/**
 * hybridSearch.ts
 *
 * Unified search across investors (members) and companies.
 *
 * Strategy:
 *  1. Keyword search: always runs, uses in-process scoring.
 *  2. Semantic search: runs when Supabase + OpenAI are configured and query.length > 2.
 *     Calls pgvector RPC functions.
 *  3. Merge: Reciprocal Rank Fusion (RRF) blends keyword + semantic rankings.
 *
 * Returns HybridSearchResponse with a full `debug` payload for the workbench.
 */

import { getMembers, searchMemberList } from "@/app/lib/members";
import { getCompanies, searchCompanyList } from "@/app/lib/companies";
import { hasSupabaseAdminConfig, supabaseRestFetch } from "@/app/lib/supabaseAdmin";
import { hasOpenAIConfig, openAiFetch, OPENAI_EMBEDDING_MODEL } from "@/app/lib/openaiClient";
import { cosineSimilarity, parseVectorLiteral } from "@/app/lib/vectorMath";
import type { MemberSearchResult } from "@/app/lib/members";
import type { CompanySearchResult } from "@/app/lib/companies";

export type ResultType = "investor" | "company";

export type HybridSearchItem =
  | (MemberSearchResult & {
      resultType: "investor";
      semanticScore?: number;
      rrfScore?: number;
    })
  | (CompanySearchResult & {
      resultType: "company";
      semanticScore?: number;
      rrfScore?: number;
    });

export type SearchMode = "keyword" | "hybrid";

export type SearchDebug = {
  timing: {
    keyword_ms: number;
    embedding_ms: number;
    semantic_ms: number;
    merge_ms: number;
    total_ms: number;
  };
  keyword_hits: {
    investors: number;
    companies: number;
  };
  semantic_hits: {
    investors: number;
    companies: number;
  };
  total_candidates: number;
  embedding_used: boolean;
  embedding_model: string | null;
  semantic_status: {
    investors: SemanticChannelStatus;
    companies: SemanticChannelStatus;
  };
  semantic_errors: {
    investors: string | null;
    companies: string | null;
  };
  rrf_k: number;
  limit: number;
};

export type HybridSearchResponse = {
  results: HybridSearchItem[];
  query: string;
  types: ResultType[];
  mode: SearchMode;
  debug: SearchDebug;
};

// ── RRF constant ───────────────────────────────────────────────────────────────
const RRF_K = 60;
const LOCAL_SEMANTIC_THRESHOLD = Number(
  process.env.SEARCH_SEMANTIC_THRESHOLD ?? "0.1"
);
const SEMANTIC_PAGE_SIZE = 1000;
const ENABLE_LOCAL_SEMANTIC_FALLBACK =
  process.env.SEARCH_ENABLE_LOCAL_VECTOR_FALLBACK === "true";

let companiesSemanticRpcUnavailable = false;
let membersSemanticRpcUnavailable = false;

type SemanticChannelStatus = "skipped" | "ok" | "unavailable" | "error";

type SemanticSearchResult<T> = {
  rows: T[];
  status: SemanticChannelStatus;
  error: string | null;
};

function formatRpcError(functionName: string, status: number, errorText: string) {
  try {
    const parsed = JSON.parse(errorText) as { message?: string; code?: string };
    const message = parsed.message ?? errorText;
    const code = parsed.code ? ` ${parsed.code}` : "";
    return `${functionName} ${status}${code}: ${message}`;
  } catch {
    return `${functionName} ${status}: ${errorText.slice(0, 240)}`;
  }
}

function rrfScore(rank: number) {
  return 1 / (RRF_K + rank + 1);
}

// ── Embedding ──────────────────────────────────────────────────────────────────
async function embedQuery(query: string): Promise<number[] | null> {
  try {
    const res = await openAiFetch("/v1/embeddings", {
      method: "POST",
      body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input: query }),
    });
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Semantic search via Supabase RPC ───────────────────────────────────────────
type SemanticCompanyRow = {
  airtable_id: string;
  name: string;
  vertical: string | null;
  stage: string | null;
  diligence_status: string | null;
  description: string | null;
  website: string | null;
  similarity: number;
};

type SemanticMemberRow = {
  airtable_id: string;
  name: string;
  aliases: string[];
  related_organization: string | null;
  email: string | null;
  linkedin: string | null;
  raw_hash: string | null;
  similarity: number;
};

type EmbeddedCompanyRow = Omit<SemanticCompanyRow, "similarity"> & {
  aliases: string[] | null;
  fiscal_year: string | null;
  embedding: string | number[] | null;
};

type EmbeddedMemberRow = Omit<SemanticMemberRow, "similarity"> & {
  id: string;
};

type EmbeddedMemberMemoryRow = {
  member_id: string;
  overview_embedding: string | number[] | null;
};

async function semanticSearchCompanies(
  embedding: number[],
  matchCount = 30
): Promise<SemanticSearchResult<SemanticCompanyRow>> {
  try {
    const res = await supabaseRestFetch("/rest/v1/rpc/search_companies_semantic", {
      method: "POST",
      body: JSON.stringify({ query_embedding: embedding, match_count: matchCount }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      if (res.status === 404) {
        companiesSemanticRpcUnavailable = true;
        if (ENABLE_LOCAL_SEMANTIC_FALLBACK) {
          return semanticSearchCompaniesLocal(embedding, matchCount);
        }
        return {
          rows: [],
          status: "unavailable",
          error: formatRpcError("search_companies_semantic", res.status, errorText),
        };
      }
      return {
        rows: [],
        status: "error",
        error: formatRpcError("search_companies_semantic", res.status, errorText),
      };
    }
    return {
      rows: (await res.json()) as SemanticCompanyRow[],
      status: "ok",
      error: null,
    };
  } catch {
    return {
      rows: [],
      status: "error",
      error: "search_companies_semantic request failed",
    };
  }
}

async function semanticSearchCompaniesLocal(
  embedding: number[],
  matchCount = 30
): Promise<SemanticSearchResult<SemanticCompanyRow>> {
  const select = [
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

  try {
    const res = await supabaseRestFetch(
      `/rest/v1/companies?select=${encodeURIComponent(
        select
      )}&status=eq.active&embedding=not.is.null&limit=${SEMANTIC_PAGE_SIZE}`
    );

    if (!res.ok) {
      return {
        rows: [],
        status: "error",
        error: formatRpcError("companies embedding fallback", res.status, await res.text()),
      };
    }

    const rows = ((await res.json()) as EmbeddedCompanyRow[])
      .flatMap((row): SemanticCompanyRow[] => {
        const rowEmbedding = parseVectorLiteral(row.embedding);
        if (!rowEmbedding) return [];
        return [
          {
            airtable_id: row.airtable_id,
            name: row.name,
            vertical: row.vertical,
            stage: row.stage,
            diligence_status: row.diligence_status,
            description: row.description,
            website: null,
            similarity: cosineSimilarity(embedding, rowEmbedding),
          },
        ];
      })
      .filter((row) => row.similarity > LOCAL_SEMANTIC_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, matchCount);

    return { rows, status: "ok", error: null };
  } catch {
    return {
      rows: [],
      status: "error",
      error: "companies embedding fallback request failed",
    };
  }
}

async function semanticSearchMembers(
  embedding: number[],
  matchCount = 15
): Promise<SemanticSearchResult<SemanticMemberRow>> {
  try {
    const res = await supabaseRestFetch("/rest/v1/rpc/search_members_semantic", {
      method: "POST",
      body: JSON.stringify({ query_embedding: embedding, match_count: matchCount }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      if (res.status === 404) {
        membersSemanticRpcUnavailable = true;
        if (ENABLE_LOCAL_SEMANTIC_FALLBACK) {
          return semanticSearchMembersLocal(embedding, matchCount);
        }
        return {
          rows: [],
          status: "unavailable",
          error: formatRpcError("search_members_semantic", res.status, errorText),
        };
      }
      return {
        rows: [],
        status: "error",
        error: formatRpcError("search_members_semantic", res.status, errorText),
      };
    }
    return {
      rows: (await res.json()) as SemanticMemberRow[],
      status: "ok",
      error: null,
    };
  } catch {
    return {
      rows: [],
      status: "error",
      error: "search_members_semantic request failed",
    };
  }
}

async function semanticSearchMembersLocal(
  embedding: number[],
  matchCount = 15
): Promise<SemanticSearchResult<SemanticMemberRow>> {
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

  try {
    const [membersRes, memoryRes] = await Promise.all([
      supabaseRestFetch(
        `/rest/v1/members?select=${encodeURIComponent(
          memberSelect
        )}&status=eq.active&limit=${SEMANTIC_PAGE_SIZE}`
      ),
      supabaseRestFetch(
        `/rest/v1/member_memory?select=${encodeURIComponent(
          "member_id,overview_embedding"
        )}&overview_embedding=not.is.null&limit=${SEMANTIC_PAGE_SIZE}`
      ),
    ]);

    if (!membersRes.ok) {
      return {
        rows: [],
        status: "error",
        error: formatRpcError("members fallback", membersRes.status, await membersRes.text()),
      };
    }

    if (!memoryRes.ok) {
      return {
        rows: [],
        status: "error",
        error: formatRpcError(
          "member_memory embedding fallback",
          memoryRes.status,
          await memoryRes.text()
        ),
      };
    }

    const membersById = new Map(
      ((await membersRes.json()) as EmbeddedMemberRow[]).map((member) => [
        member.id,
        member,
      ])
    );

    const rows = ((await memoryRes.json()) as EmbeddedMemberMemoryRow[])
      .map((memory) => {
        const member = membersById.get(memory.member_id);
        const rowEmbedding = parseVectorLiteral(memory.overview_embedding);
        if (!member || !rowEmbedding) return null;
        return {
          airtable_id: member.airtable_id,
          name: member.name,
          aliases: member.aliases,
          related_organization: member.related_organization,
          email: member.email,
          linkedin: member.linkedin,
          raw_hash: member.raw_hash,
          similarity: cosineSimilarity(embedding, rowEmbedding),
        } satisfies SemanticMemberRow;
      })
      .filter((row): row is SemanticMemberRow => Boolean(row))
      .filter((row) => row.similarity > LOCAL_SEMANTIC_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, matchCount);

    return { rows, status: "ok", error: null };
  } catch {
    return {
      rows: [],
      status: "error",
      error: "member_memory embedding fallback request failed",
    };
  }
}

// ── Main export ────────────────────────────────────────────────────────────────
export async function hybridSearch(
  rawQuery: string,
  types: ResultType[],
  limit = 20
): Promise<HybridSearchResponse> {
  const t0 = Date.now();
  const query = rawQuery.trim();

  const wantInvestors = types.includes("investor");
  const wantCompanies = types.includes("company");
  const hasSemanticChannel =
    ENABLE_LOCAL_SEMANTIC_FALLBACK ||
    (wantCompanies && !companiesSemanticRpcUnavailable) ||
    (wantInvestors && !membersSemanticRpcUnavailable);
  const canSemantic =
    query.length > 2 && hasSemanticChannel && hasSupabaseAdminConfig() && hasOpenAIConfig();

  // ── 1. Keyword search ────────────────────────────────────────────────────────
  const t1 = Date.now();
  const [memberList, companyList] = await Promise.all([
    wantInvestors ? getMembers() : Promise.resolve([]),
    wantCompanies ? getCompanies() : Promise.resolve([]),
  ]);

  const keywordInvestors = wantInvestors ? searchMemberList(memberList, query) : [];
  const keywordCompanies = wantCompanies ? searchCompanyList(companyList, query) : [];
  const keywordMs = Date.now() - t1;

  // ── 2. Embedding ──────────────────────────────────────────────────────────────
  let embedding: number[] | null = null;
  let embeddingMs = 0;
  if (canSemantic) {
    const t2 = Date.now();
    embedding = await embedQuery(query);
    embeddingMs = Date.now() - t2;
  }

  // ── 3. Semantic search ────────────────────────────────────────────────────────
  let semanticCompanies: SemanticCompanyRow[] = [];
  let semanticMembers: SemanticMemberRow[] = [];
  let semanticCompanyStatus: SemanticChannelStatus = "skipped";
  let semanticMemberStatus: SemanticChannelStatus = "skipped";
  let semanticCompanyError: string | null = null;
  let semanticMemberError: string | null = null;
  let semanticMs = 0;

  if (embedding) {
    const t3 = Date.now();
    const [sc, sm] = await Promise.all([
      wantCompanies
        ? semanticSearchCompanies(embedding, 30)
        : Promise.resolve<SemanticSearchResult<SemanticCompanyRow>>({
            rows: [],
            status: "skipped",
            error: null,
          }),
      wantInvestors
        ? semanticSearchMembers(embedding, 15)
        : Promise.resolve<SemanticSearchResult<SemanticMemberRow>>({
            rows: [],
            status: "skipped",
            error: null,
          }),
    ]);
    semanticCompanies = sc.rows;
    semanticMembers = sm.rows;
    semanticCompanyStatus = sc.status;
    semanticMemberStatus = sm.status;
    semanticCompanyError = sc.error;
    semanticMemberError = sm.error;
    semanticMs = Date.now() - t3;
  }

  // ── 4. RRF merge ──────────────────────────────────────────────────────────────
  const t4 = Date.now();

  type MergedEntry = { item: HybridSearchItem; rrfScore: number };
  const merged = new Map<string, MergedEntry>();

  function upsert(id: string, item: HybridSearchItem, rank: number) {
    const score = rrfScore(rank);
    const existing = merged.get(id);
    if (existing) {
      existing.rrfScore += score;
    } else {
      merged.set(id, { item, rrfScore: score });
    }
  }

  // Keyword investors
  keywordInvestors.forEach((m, rank) =>
    upsert(m.airtable_id, { ...m, resultType: "investor" as const }, rank)
  );

  // Keyword companies
  keywordCompanies.forEach((c, rank) =>
    upsert(c.airtable_id, { ...c, resultType: "company" as const }, rank)
  );

  // Semantic companies
  semanticCompanies.forEach((sc, rank) => {
    const id = sc.airtable_id;
    const existing = merged.get(id);
    if (existing) {
      existing.rrfScore += rrfScore(rank);
      (existing.item as CompanySearchResult & { semanticScore?: number }).semanticScore =
        sc.similarity;
    } else {
      const synth: HybridSearchItem = {
        airtable_id: sc.airtable_id,
        name: sc.name,
        aliases: [],
        vertical: sc.vertical,
        stage: sc.stage,
        diligence_status: sc.diligence_status,
        description: sc.description,
        website: sc.website,
        fiscal_year: null,
        contact_email: null,
        source_organization: null,
        matchScore: 0,
        matchedFields: [],
        resultType: "company" as const,
        semanticScore: sc.similarity,
      };
      upsert(id, synth, rank);
    }
  });

  // Semantic members
  semanticMembers.forEach((sm, rank) => {
    const id = sm.airtable_id;
    const existing = merged.get(id);
    if (existing) {
      existing.rrfScore += rrfScore(rank);
      (existing.item as MemberSearchResult & { semanticScore?: number }).semanticScore =
        sm.similarity;
    } else {
      const synth: HybridSearchItem = {
        airtable_id: sm.airtable_id,
        name: sm.name,
        aliases: sm.aliases,
        related_organization: sm.related_organization,
        email: sm.email,
        linkedin: sm.linkedin,
        raw_hash: sm.raw_hash,
        matchScore: 0,
        matchedFields: [],
        resultType: "investor" as const,
        semanticScore: sm.similarity,
      };
      upsert(id, synth, rank);
    }
  });

  const totalCandidates = merged.size;

  // Sort, attach rrfScore to each item, take top N
  const sorted = Array.from(merged.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(({ item, rrfScore: score }) => ({ ...item, rrfScore: score }));

  const mergeMs = Date.now() - t4;
  const totalMs = Date.now() - t0;

  const semanticAvailable =
    semanticCompanyStatus === "ok" || semanticMemberStatus === "ok";
  const mode: SearchMode = embedding && semanticAvailable ? "hybrid" : "keyword";

  const debug: SearchDebug = {
    timing: {
      keyword_ms: keywordMs,
      embedding_ms: embeddingMs,
      semantic_ms: semanticMs,
      merge_ms: mergeMs,
      total_ms: totalMs,
    },
    keyword_hits: {
      investors: keywordInvestors.length,
      companies: keywordCompanies.length,
    },
    semantic_hits: {
      investors: semanticMembers.length,
      companies: semanticCompanies.length,
    },
    total_candidates: totalCandidates,
    embedding_used: Boolean(embedding),
    embedding_model: embedding ? OPENAI_EMBEDDING_MODEL : null,
    semantic_status: {
      investors: semanticMemberStatus,
      companies: semanticCompanyStatus,
    },
    semantic_errors: {
      investors: semanticMemberError,
      companies: semanticCompanyError,
    },
    rrf_k: RRF_K,
    limit,
  };

  return {
    results: sorted,
    query: rawQuery,
    types,
    mode,
    debug,
  };
}
