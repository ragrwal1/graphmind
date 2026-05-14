import { getMembers } from "@/app/lib/members";
import { buildMemberVocabulary, buildSttVocabularyPrompt } from "@/app/lib/capture/memberVocabulary";

export type CaptureTranscriptionInput = {
  audio: File;
};

export type CaptureTranscriptionResult = {
  capture_id: string;
  transcript: string;
  member_vocabulary_count: number;
};

const openAiApiKey = process.env.OPENAI_API_KEY;
const STT_MODEL = process.env.OPENAI_STT_MODEL ?? "whisper-1";

export async function transcribeCaptureAudio({
  audio
}: CaptureTranscriptionInput): Promise<CaptureTranscriptionResult> {
  if (!openAiApiKey) {
    throw new Error("OpenAI is not configured");
  }
  if (!audio || audio.size === 0) {
    throw new Error("audio is required");
  }

  const members = await getMembers();
  const vocabulary = buildMemberVocabulary(members);
  const formData = new FormData();
  formData.append("model", STT_MODEL);
  formData.append("response_format", "json");
  formData.append("prompt", buildSttVocabularyPrompt(vocabulary));
  formData.append("file", audio, audio.name || "capture.webm");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const body = await response.text();
    let message = `Transcription failed (${response.status})`;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const payload = (await response.json()) as { text?: string };
  return {
    capture_id: crypto.randomUUID(),
    transcript: payload.text ?? "",
    member_vocabulary_count: vocabulary.length
  };
}
