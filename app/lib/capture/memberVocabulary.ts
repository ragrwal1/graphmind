import type { MemberSeed } from "@/app/lib/members";

export type MemberVocabularyEntry = {
  airtable_id: string;
  name: string;
  aliases: string[];
};

export function buildMemberVocabulary(members: MemberSeed[]) {
  return members
    .map((member) => ({
      airtable_id: member.airtable_id,
      name: member.name,
      aliases: cleanAliases([member.name, ...(member.aliases ?? [])]),
      priority: memberPriority(member)
    }))
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
}

export function buildSttVocabularyPrompt(entries: MemberVocabularyEntry[]) {
  const vocabulary = cleanAliases(entries.flatMap((entry) => [entry.name, ...entry.aliases])).slice(0, 500);

  return [
    "This is a short relationship-note recording for a VC member memory system.",
    "Prefer the following exact spellings for people, nicknames, and member names when they are spoken:",
    vocabulary.join(", ")
  ].join("\n");
}

export function formatKnownMembers(entries: MemberVocabularyEntry[]) {
  return entries
    .map((entry) =>
      [
        `airtable_id: ${entry.airtable_id}`,
        `name: ${entry.name}`,
        entry.aliases.length ? `aliases: ${entry.aliases.join(", ")}` : "aliases:"
      ].join(" | ")
    )
    .join("\n");
}

export function resolveMember(
  update: { spoken_name: string; matched_member_name: string },
  entries: MemberVocabularyEntry[]
) {
  const candidates = [
    update.matched_member_name,
    update.spoken_name,
    ...(update.spoken_name ? update.spoken_name.split(/\s+/) : [])
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeName(candidate);
    const exact = entries.find((entry) =>
      [entry.name, ...entry.aliases].some((value) => normalizeName(value) === normalizedCandidate)
    );
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeName(candidate);
    if (!normalizedCandidate) continue;
    const contains = entries.find((entry) =>
      [entry.name, ...entry.aliases].some((value) => normalizeName(value).includes(normalizedCandidate))
    );
    if (contains) return contains;
  }

  return null;
}

function cleanAliases(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function memberPriority(member: MemberSeed) {
  const haystack = [
    member.name,
    member.related_organization,
    member.email,
    ...(member.aliases ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("realmspark")) return 2;
  if (member.airtable_id.startsWith("manual-member-")) return 1;
  return 0;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
