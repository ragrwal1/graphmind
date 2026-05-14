import memberSeed from "@/app/data/members.seed.json";
import { hasSupabaseAdminConfig, supabaseRestFetch } from "@/app/lib/supabaseAdmin";

export type MemberSeed = {
  airtable_id: string;
  name: string;
  aliases: string[];
  related_organization: string | null;
  email: string | null;
  linkedin: string | null;
  raw_hash: string | null;
};

export type MemberSearchResult = MemberSeed & {
  matchScore: number;
  matchedFields: string[];
};

const members = memberSeed as MemberSeed[];

const normalize = (value: string) => value.toLowerCase().trim();

const fieldIncludes = (field: string | null | undefined, query: string) =>
  Boolean(field && normalize(field).includes(query));

const LIST_CACHE_MS = Number(process.env.SEARCH_LIST_CACHE_MS ?? "30000");

let membersCache: { expiresAt: number; rows: MemberSeed[] } | null = null;

export async function getMembers() {
  if (!hasSupabaseAdminConfig()) {
    return members;
  }

  if (membersCache && membersCache.expiresAt > Date.now()) {
    return membersCache.rows;
  }

  const select = "airtable_id,name,aliases,related_organization,email,linkedin,raw_hash";
  const response = await supabaseRestFetch(
    `/rest/v1/members?select=${encodeURIComponent(select)}&status=eq.active&order=name.asc`
  );

  if (!response.ok) {
    console.error("Failed to load members from Supabase", await response.text());
    return members;
  }

  const rows = (await response.json()) as MemberSeed[];
  membersCache = { expiresAt: Date.now() + LIST_CACHE_MS, rows };
  return rows;
}

export function getSeedMembers() {
  return members;
}

export function searchMemberList(
  memberList: MemberSeed[],
  rawQuery: string
): MemberSearchResult[] {
  const query = normalize(rawQuery);

  if (!query) {
    return memberList.slice(0, 12).map((member) => ({
      ...member,
      matchScore: 0,
      matchedFields: []
    }));
  }

  return memberList
    .map((member) => {
      const matchedFields: string[] = [];
      let score = 0;

      if (fieldIncludes(member.name, query)) {
        score += 100;
        matchedFields.push("name");
      }

      if (member.aliases.some((alias) => fieldIncludes(alias, query))) {
        score += 40;
        matchedFields.push("alias");
      }

      if (fieldIncludes(member.related_organization, query)) {
        score += 25;
        matchedFields.push("organization");
      }

      if (fieldIncludes(member.email, query)) {
        score += 10;
        matchedFields.push("email");
      }

      return { ...member, matchScore: score, matchedFields };
    })
    .filter((member) => member.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name))
    .slice(0, 20);
}

export function searchMembers(rawQuery: string): MemberSearchResult[] {
  return searchMemberList(members, rawQuery);
}

export function getMemberByAirtableId(airtableId: string) {
  return members.find((member) => member.airtable_id === airtableId) ?? null;
}
