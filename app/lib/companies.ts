import { hasSupabaseAdminConfig, supabaseRestFetch } from "@/app/lib/supabaseAdmin";

export type CompanySeed = {
  airtable_id: string;
  name: string;
  aliases: string[];
  vertical: string | null;
  stage: string | null;
  diligence_status: string | null;
  description: string | null;
  fiscal_year: string | null;
  website: string | null;
  contact_email: string | null;
  source_organization: string | null;
};

export type CompanySearchResult = CompanySeed & {
  matchScore: number;
  matchedFields: string[];
};

const normalize = (value: string) => value.toLowerCase().trim();

const fieldIncludes = (field: string | null | undefined, query: string) =>
  Boolean(field && normalize(field).includes(query));

const LIST_CACHE_MS = Number(process.env.SEARCH_LIST_CACHE_MS ?? "30000");

let companiesCache: { expiresAt: number; rows: CompanySeed[] } | null = null;

export async function getCompanies(): Promise<CompanySeed[]> {
  if (!hasSupabaseAdminConfig()) {
    return [];
  }

  if (companiesCache && companiesCache.expiresAt > Date.now()) {
    return companiesCache.rows;
  }

  // NOTE: website / contact_email / source_organization are added by migration
  // 20260511140000_companies_search_fields.sql. Until that migration runs,
  // we select only the columns from the initial schema. The type has them as
  // nullable so existing code handles null gracefully.
  const select = [
    "airtable_id",
    "name",
    "aliases",
    "vertical",
    "stage",
    "diligence_status",
    "description",
    "fiscal_year",
  ].join(",");

  const response = await supabaseRestFetch(
    `/rest/v1/companies?select=${encodeURIComponent(select)}&status=eq.active&order=name.asc`
  );

  if (!response.ok) {
    console.error("Failed to load companies from Supabase", await response.text());
    return [];
  }

  const rows = (await response.json()) as CompanySeed[];
  companiesCache = { expiresAt: Date.now() + LIST_CACHE_MS, rows };
  return rows;
}

export function searchCompanyList(
  companyList: CompanySeed[],
  rawQuery: string
): CompanySearchResult[] {
  const query = normalize(rawQuery);

  if (!query) {
    return companyList.slice(0, 12).map((c) => ({
      ...c,
      matchScore: 0,
      matchedFields: [],
    }));
  }

  return companyList
    .map((company) => {
      const matchedFields: string[] = [];
      let score = 0;

      if (fieldIncludes(company.name, query)) {
        score += 100;
        matchedFields.push("name");
      }

      if (company.aliases.some((alias) => fieldIncludes(alias, query))) {
        score += 40;
        matchedFields.push("alias");
      }

      if (fieldIncludes(company.vertical, query)) {
        score += 30;
        matchedFields.push("vertical");
      }

      if (fieldIncludes(company.description, query)) {
        score += 15;
        matchedFields.push("description");
      }

      if (fieldIncludes(company.diligence_status, query)) {
        score += 10;
        matchedFields.push("diligence_status");
      }

      if (fieldIncludes(company.source_organization, query)) {
        score += 8;
        matchedFields.push("source_organization");
      }

      return { ...company, matchScore: score, matchedFields };
    })
    .filter((c) => c.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name))
    .slice(0, 20);
}
