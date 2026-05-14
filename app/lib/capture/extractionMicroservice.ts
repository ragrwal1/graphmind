import { getMembers } from "@/app/lib/members";
import {
  buildMemberVocabulary,
  formatKnownMembers,
  resolveMember
} from "@/app/lib/capture/memberVocabulary";

export type CaptureExtractInput = {
  capture_id: string;
  transcript: string;
};

export type CaptureExtractedUpdate = {
  spoken_name: string;
  airtable_id: string | null;
  matched_name: string | null;
  detail: string;
  confidence: "high" | "medium" | "low";
};

export type CaptureExtractResult = {
  updates: CaptureExtractedUpdate[];
};

type StructuredCaptureUpdate = {
  spoken_name: string;
  matched_member_name: string;
  detail: string;
  confidence: "high" | "medium" | "low";
};

const openAiApiKey = process.env.OPENAI_API_KEY;
const STRUCTURED_MODEL =
  process.env.OPENAI_STRUCTURED_MODEL ?? process.env.OPENAI_MEMORY_MODEL ?? "gpt-4.1-mini";

export async function extractCaptureUpdates({
  capture_id: captureId,
  transcript
}: CaptureExtractInput): Promise<CaptureExtractResult> {
  if (!openAiApiKey) {
    throw new Error("OpenAI is not configured");
  }
  if (!captureId.trim()) {
    throw new Error("capture_id is required");
  }
  if (!transcript.trim()) {
    throw new Error("transcript is required");
  }

  const members = await getMembers();
  const vocabulary = buildMemberVocabulary(members);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: STRUCTURED_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Extract concise relationship-memory updates from a transcript. Match spoken names or nicknames to the known members when possible. Keep detail fragments short, like 'newly into cars' or 'into energy'."
        },
        {
          role: "user",
          content: `Known members:\n${formatKnownMembers(vocabulary)}\n\nTranscript:\n${transcript}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "capture_member_updates",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              updates: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    spoken_name: {
                      type: "string",
                      description: "The short name or nickname as spoken."
                    },
                    matched_member_name: {
                      type: "string",
                      description: "The full known member name, or an empty string if uncertain."
                    },
                    detail: {
                      type: "string",
                      description: "The concise note to save for this member."
                    },
                    confidence: {
                      type: "string",
                      enum: ["high", "medium", "low"],
                      description: "Confidence in the member match and extracted note."
                    }
                  },
                  required: ["spoken_name", "matched_member_name", "detail", "confidence"]
                }
              }
            },
            required: ["updates"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Structured extraction failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Structured extraction did not return content");
  }

  const parsed = JSON.parse(content) as { updates: StructuredCaptureUpdate[] };
  return {
    updates: parsed.updates.map((update) => {
      const member = resolveMember(update, vocabulary);
      return {
        spoken_name: update.spoken_name,
        airtable_id: member?.airtable_id ?? null,
        matched_name: member?.name ?? update.matched_member_name ?? null,
        detail: update.detail,
        confidence: update.confidence
      };
    })
  };
}
