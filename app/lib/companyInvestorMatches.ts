import { supabaseRestFetch } from "@/app/lib/supabaseAdmin";
import { cosineSimilarity, parseVectorLiteral } from "@/app/lib/vectorMath";
import type { CompanySeed } from "@/app/lib/companies";
import type { MemberMemoryOverviewJson } from "@/app/lib/memberNotes";

const MATCH_PAGE_SIZE = 1000;
const MATCH_THRESHOLD = Number(process.env.COMPANY_MATCH_THRESHOLD ?? "0.1");

type CompanyEmbeddingRow = CompanySeed & {
  embedding: string | number[] | null;
};

type MemberRow = {
  id: string;
  airtable_id: string;
  name: string;
  aliases: string[];
  related_organization: string | null;
  email: string | null;
  linkedin: string | null;
  raw_hash: string | null;
};

type MemberMemoryRow = {
  member_id: string;
  overview_text: string | null;
  overview_json: MemberMemoryOverviewJson | null;
  overview_embedding: string | number[] | null;
  note_count: number | null;
  last_note_at: string | null;
  overview_updated_at: string | null;
};

export type CompanyInvestorMatch = {
  airtable_id: string;
  name: string;
  aliases: string[];
  related_organization: string | null;
  email: string | null;
  linkedin: string | null;
  raw_hash: string | null;
  similarity: number;
  note_count: number;
  last_note_at: string | null;
  overview_text: string | null;
  primary_interests: string[];
  evaluation_lens: string[];
  cautions: string[];
  recent_signals: { date: string; text: string }[];
};

export type CompanyInvestorMatchResponse = {
  company: CompanySeed;
  matches: CompanyInvestorMatch[];
  debug: {
    company_has_embedding: boolean;
    investors_considered: number;
    matches_returned: number;
    threshold: number;
  };
};

function normalizeCompany(row: CompanyEmbeddingRow): CompanySeed {
  return {
    airtable_id: row.airtable_id,
    name: row.name,
    aliases: row.aliases ?? [],
    vertical: row.vertical,
    stage: row.stage,
    diligence_status: row.diligence_status,
    description: row.description,
    fiscal_year: row.fiscal_year,
    website: row.website ?? null,
    contact_email: row.contact_email ?? null,
    source_organization: row.source_organization ?? null,
  };
}

export async function getCompanyInvestorMatches(
  airtableId: string,
  limit = 20
): Promise<CompanyInvestorMatchResponse> {
  const companySelect = [
    "airtable_id",
    "name",
    "aliases",
    "vertical",
    "stage",
    "diligence_status",
    "description",
    "fiscal_year",
    "embedding",
  ].join(",");

  const companyResponse = await supabaseRestFetch(
    `/rest/v1/companies?select=${encodeURIComponent(
      companySelect
    )}&airtable_id=eq.${encodeURIComponent(airtableId)}&limit=1`
  );

  if (!companyResponse.ok) {
    throw new Error("Failed to load company");
  }

  const [companyRow] = (await companyResponse.json()) as CompanyEmbeddingRow[];
  if (!companyRow) {
    throw new Error("Company not found");
  }

  const company = normalizeCompany(companyRow);
  const companyEmbedding = parseVectorLiteral(companyRow.embedding);
  if (!companyEmbedding) {
    return {
      company,
      matches: [],
      debug: {
        company_has_embedding: false,
        investors_considered: 0,
        matches_returned: 0,
        threshold: MATCH_THRESHOLD,
      },
    };
  }

  const memberSelect = [
    "id",
    "airtable_id",
    "name",
    "aliases",
    "related_organization",
    "email",
    "linkedin",
    "raw_hash",
  ].join(",");

  const [membersResponse, memoryResponse] = await Promise.all([
    supabaseRestFetch(
      `/rest/v1/members?select=${encodeURIComponent(
        memberSelect
      )}&status=eq.active&limit=${MATCH_PAGE_SIZE}`
    ),
    supabaseRestFetch(
      `/rest/v1/member_memory?select=${encodeURIComponent(
        "member_id,overview_text,overview_json,overview_embedding,note_count,last_note_at,overview_updated_at"
      )}&overview_embedding=not.is.null&limit=${MATCH_PAGE_SIZE}`
    ),
  ]);

  if (!membersResponse.ok || !memoryResponse.ok) {
    throw new Error("Failed to load investor memories");
  }

  const membersById = new Map(
    ((await membersResponse.json()) as MemberRow[]).map((member) => [member.id, member])
  );
  const memoryRows = (await memoryResponse.json()) as MemberMemoryRow[];

  const matches = memoryRows
    .flatMap((memory): CompanyInvestorMatch[] => {
      const member = membersById.get(memory.member_id);
      const memberEmbedding = parseVectorLiteral(memory.overview_embedding);
      if (!member || !memberEmbedding) return [];

      const overview = memory.overview_json;
      return [
        {
          airtable_id: member.airtable_id,
          name: member.name,
          aliases: member.aliases,
          related_organization: member.related_organization,
          email: member.email,
          linkedin: member.linkedin,
          raw_hash: member.raw_hash,
          similarity: cosineSimilarity(companyEmbedding, memberEmbedding),
          note_count: memory.note_count ?? 0,
          last_note_at: memory.last_note_at,
          overview_text: memory.overview_text,
          primary_interests: overview?.primary_interests ?? [],
          evaluation_lens: overview?.evaluation_lens ?? [],
          cautions: overview?.cautions ?? [],
          recent_signals: overview?.recent_signals ?? [],
        },
      ];
    })
    .filter((match) => match.similarity > MATCH_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return {
    company,
    matches,
    debug: {
      company_has_embedding: true,
      investors_considered: memoryRows.length,
      matches_returned: matches.length,
      threshold: MATCH_THRESHOLD,
    },
  };
}
