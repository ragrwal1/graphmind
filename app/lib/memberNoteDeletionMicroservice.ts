import {
  getMemberIdByAirtableId,
  getMemberNotesForMemberId,
  type MemberNotesPayload
} from "@/app/lib/memberNotes";
import { assertOpenAIConfig } from "@/app/lib/openaiClient";
import { supabaseRestFetch } from "@/app/lib/supabaseAdmin";

type NoteIdRow = {
  id: string;
};

const normalizeNoteIds = (noteIds: unknown) => {
  if (!Array.isArray(noteIds)) {
    throw new Error("note_ids must be an array");
  }

  const cleanNoteIds = Array.from(
    new Set(
      noteIds
        .map((noteId) => (typeof noteId === "string" ? noteId.trim() : ""))
        .filter(Boolean)
    )
  );

  if (cleanNoteIds.length === 0) {
    throw new Error("Select at least one note to delete");
  }

  return cleanNoteIds;
};

const buildIdFilter = (noteIds: string[]) =>
  `in.(${noteIds.map((noteId) => encodeURIComponent(noteId)).join(",")})`;

export async function deleteMemberNotes(
  airtableId: string,
  noteIdsInput: unknown
): Promise<MemberNotesPayload & { deleted_note_ids: string[] }> {
  assertOpenAIConfig();

  const noteIds = normalizeNoteIds(noteIdsInput);
  const memberId = await getMemberIdByAirtableId(airtableId);
  if (!memberId) {
    throw new Error("Member not found");
  }

  const idFilter = buildIdFilter(noteIds);
  const lookupResponse = await supabaseRestFetch(
    `/rest/v1/member_notes?select=id&member_id=eq.${encodeURIComponent(memberId)}&id=${idFilter}`
  );

  if (!lookupResponse.ok) {
    throw new Error("Failed to look up selected notes");
  }

  const matchedNotes = (await lookupResponse.json()) as NoteIdRow[];
  const matchedNoteIds = matchedNotes.map((note) => note.id);

  if (matchedNoteIds.length !== noteIds.length) {
    throw new Error("One or more selected notes were not found on this member");
  }

  const deleteResponse = await supabaseRestFetch(
    `/rest/v1/member_notes?member_id=eq.${encodeURIComponent(memberId)}&id=${idFilter}`,
    {
      method: "DELETE"
    }
  );

  if (!deleteResponse.ok) {
    throw new Error("Failed to delete selected notes");
  }

  const { regenerateMemberMemoryOverview } = await import("@/app/lib/memberMemoryMicroservice");
  const overview = await regenerateMemberMemoryOverview(airtableId);
  const notes = await getMemberNotesForMemberId(memberId);

  return { notes, overview, deleted_note_ids: matchedNoteIds };
}
