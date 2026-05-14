import { createMemberNote } from "@/app/lib/memberNotes";
import type { CaptureExtractedUpdate } from "@/app/lib/capture/extractionMicroservice";

export type CaptureCommitInput = {
  capture_id: string;
  updates: CaptureExtractedUpdate[];
};

export type CaptureCommitResult = {
  saved: Array<{
    airtable_id: string;
    source: "voice";
  }>;
};

export async function commitCaptureUpdates({
  capture_id: captureId,
  updates
}: CaptureCommitInput): Promise<CaptureCommitResult> {
  if (!captureId.trim()) {
    throw new Error("capture_id is required");
  }

  const matchedUpdates = updates.filter(
    (update): update is CaptureExtractedUpdate & { airtable_id: string } =>
      Boolean(update.airtable_id && update.detail.trim())
  );

  const saved = await Promise.all(
    matchedUpdates.map(async (update) => {
      await createMemberNote(update.airtable_id, update.detail, "voice");
      return {
        airtable_id: update.airtable_id,
        source: "voice" as const
      };
    })
  );

  return { saved };
}
