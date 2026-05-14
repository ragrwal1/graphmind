import type { MemberMemoryOverviewJson, MemberNote } from "@/app/lib/memberNotes";
import type { MemberSeed } from "@/app/lib/members";

export const MEMBER_MEMORY_PROMPT_VERSION = "member-memory-overview-v1";

export const MEMBER_MEMORY_SYSTEM_PROMPT = `You are Graphmind's member memory analyst.

Your job is to convert a member's chronological note log into a durable memory overview used by a VC team to match companies to members.

Rules:
- Preserve signal from the notes. Do not invent facts.
- Prefer concrete investment preferences over generic adjectives.
- Separate what the member likes from how they evaluate opportunities.
- Capture cautions as constraints, objections, or pass patterns.
- Recent signals should be short, dated, and traceable to the raw note.
- If notes conflict, reflect the tension instead of forcing one conclusion.
- Do not mention that you are an AI or that you summarized notes.
- Keep each array item concise enough to render in a profile card.
- Output only JSON that matches the schema.`;

export const memberMemoryOverviewSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "primary_interests",
    "evaluation_lens",
    "cautions",
    "recent_signals",
    "sentiment_label"
  ],
  properties: {
    primary_interests: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 160
      }
    },
    evaluation_lens: {
      type: "array",
      minItems: 0,
      maxItems: 6,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 180
      }
    },
    cautions: {
      type: "array",
      minItems: 0,
      maxItems: 5,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 180
      }
    },
    recent_signals: {
      type: "array",
      minItems: 0,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "text"],
        properties: {
          date: {
            type: "string",
            minLength: 1,
            maxLength: 40
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 280
          }
        }
      }
    },
    sentiment_label: {
      type: "string",
      enum: ["unknown", "positive", "selective", "cautious", "negative", "mixed"]
    }
  }
} as const;

export const buildMemberMemoryUserPrompt = (member: MemberSeed, notes: MemberNote[]) => {
  const noteLines = notes
    .map((note) => `- ${note.occurred_at}: ${note.note_text}`)
    .join("\n");

  return `Member profile:
Name: ${member.name}
Organization: ${member.related_organization ?? "Unknown"}
Known aliases: ${member.aliases.join(", ") || "None"}

Raw notes, newest first:
${noteLines || "No notes yet."}

Return a structured member memory overview.`;
};

export const flattenMemberMemoryOverview = (overview: MemberMemoryOverviewJson) => {
  const sections = [
    ["Primary interests", overview.primary_interests],
    ["Evaluation lens", overview.evaluation_lens],
    ["Cautions", overview.cautions],
    ["Recent signals", overview.recent_signals.map((signal) => `${signal.date}: ${signal.text}`)]
  ] as const;

  return sections
    .map(([label, values]) => `${label}: ${values.length ? values.join(" | ") : "None yet"}`)
    .join("\n");
};
