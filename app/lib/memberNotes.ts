import { supabaseRestFetch } from "@/app/lib/supabaseAdmin";
import { assertOpenAIConfig } from "@/app/lib/openaiClient";

export type MemberNote = {
  id: string;
  note_text: string;
  occurred_at: string;
  source: "desktop" | "voice" | "import";
  created_by: string | null;
  created_at: string;
};

export type MemberMemorySignal = {
  date: string;
  text: string;
};

export type MemberMemoryOverviewJson = {
  primary_interests: string[];
  evaluation_lens: string[];
  cautions: string[];
  recent_signals: MemberMemorySignal[];
  sentiment_label?: "unknown" | "positive" | "selective" | "cautious" | "negative" | "mixed";
};

export type MemberMemoryOverview = {
  overview_text: string;
  overview_json: MemberMemoryOverviewJson;
  note_count: number;
  last_note_at: string | null;
  overview_updated_at: string;
};

export type MemberNotesPayload = {
  notes: MemberNote[];
  overview: MemberMemoryOverview;
};

type MemberIdRow = {
  id: string;
};

const defaultOverview = (): MemberMemoryOverview => ({
  overview_text: "No notes yet.",
  overview_json: {
    primary_interests: [],
    evaluation_lens: [],
    cautions: [],
    recent_signals: []
  },
  note_count: 0,
  last_note_at: null,
  overview_updated_at: new Date().toISOString()
});

const normalizeOverview = (overview: MemberMemoryOverview): MemberMemoryOverview => ({
  ...overview,
  overview_json: {
    primary_interests: overview.overview_json?.primary_interests ?? [],
    evaluation_lens: overview.overview_json?.evaluation_lens ?? [],
    cautions: overview.overview_json?.cautions ?? [],
    recent_signals: overview.overview_json?.recent_signals ?? [],
    sentiment_label: overview.overview_json?.sentiment_label ?? "unknown"
  }
});

export async function getMemberNotesForMemberId(memberId: string) {
  const notesResponse = await supabaseRestFetch(
    `/rest/v1/member_notes?select=id,note_text,occurred_at,source,created_by,created_at&member_id=eq.${memberId}&order=occurred_at.desc`
  );

  if (!notesResponse.ok) {
    throw new Error("Failed to load notes");
  }

  return (await notesResponse.json()) as MemberNote[];
}

async function getSavedMemberMemoryOverview(memberId: string) {
  const select = "overview_text,overview_json,note_count,last_note_at,overview_updated_at";
  const response = await supabaseRestFetch(
    `/rest/v1/member_memory?select=${encodeURIComponent(
      select
    )}&member_id=eq.${memberId}&limit=1`
  );

  if (!response.ok) {
    throw new Error("Failed to load member memory overview");
  }

  const [overview] = (await response.json()) as MemberMemoryOverview[];
  return overview ? normalizeOverview(overview) : defaultOverview();
}

export async function getMemberIdByAirtableId(airtableId: string) {
  const response = await supabaseRestFetch(
    `/rest/v1/members?select=id&airtable_id=eq.${encodeURIComponent(airtableId)}&limit=1`
  );

  if (!response.ok) {
    throw new Error("Failed to look up member");
  }

  const rows = (await response.json()) as MemberIdRow[];
  return rows[0]?.id ?? null;
}

export async function getMemberNotesPayload(airtableId: string): Promise<MemberNotesPayload> {
  const memberId = await getMemberIdByAirtableId(airtableId);
  if (!memberId) {
    throw new Error("Member not found");
  }

  const [notes, overview] = await Promise.all([
    getMemberNotesForMemberId(memberId),
    getSavedMemberMemoryOverview(memberId)
  ]);

  return { notes, overview };
}

export async function createMemberNote(
  airtableId: string,
  noteText: string,
  source: MemberNote["source"] = "desktop"
) {
  assertOpenAIConfig();

  const memberId = await getMemberIdByAirtableId(airtableId);
  if (!memberId) {
    throw new Error("Member not found");
  }

  const cleanNoteText = noteText.trim();
  if (!cleanNoteText) {
    throw new Error("Note cannot be empty");
  }

  const insertResponse = await supabaseRestFetch("/rest/v1/member_notes?select=id", {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      member_id: memberId,
      note_text: cleanNoteText,
      source,
      created_by: source
    })
  });

  if (!insertResponse.ok) {
    throw new Error("Failed to save note");
  }

  const { regenerateMemberMemoryOverview } = await import("@/app/lib/memberMemoryMicroservice");
  const overview = await regenerateMemberMemoryOverview(airtableId);
  const notes = await getMemberNotesForMemberId(memberId);

  return { notes, overview };
}
