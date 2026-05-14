import type { MemberSeed } from "@/app/lib/members";
import {
  getMemberIdByAirtableId,
  getMemberNotesForMemberId,
  type MemberMemoryOverview,
  type MemberMemoryOverviewJson,
  type MemberNote
} from "@/app/lib/memberNotes";
import {
  OPENAI_EMBEDDING_MODEL,
  OPENAI_MEMORY_MODEL,
  openAiFetch
} from "@/app/lib/openaiClient";
import {
  buildMemberMemoryUserPrompt,
  flattenMemberMemoryOverview,
  MEMBER_MEMORY_SYSTEM_PROMPT,
  memberMemoryOverviewSchema
} from "@/app/lib/prompts/memberMemoryOverview";
import { supabaseRestFetch } from "@/app/lib/supabaseAdmin";

type OpenAIResponsePayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};

type EmbeddingPayload = {
  data?: Array<{
    embedding?: number[];
  }>;
};

type ModelOverview = MemberMemoryOverviewJson & {
  sentiment_label: NonNullable<MemberMemoryOverviewJson["sentiment_label"]>;
};

const extractResponseText = (payload: OpenAIResponsePayload) => {
  if (payload.output_text) {
    return payload.output_text;
  }

  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string") {
        return content.text;
      }
    }
  }

  throw new Error("OpenAI response did not include output text");
};

const parseOverviewJson = (text: string): ModelOverview => {
  const parsed = JSON.parse(text) as Partial<ModelOverview>;
  const arrayKeys = ["primary_interests", "evaluation_lens", "cautions", "recent_signals"] as const;

  for (const key of arrayKeys) {
    if (!Array.isArray(parsed[key])) {
      throw new Error(`OpenAI overview response is missing ${key}`);
    }
  }

  if (
    !parsed.sentiment_label ||
    !["unknown", "positive", "selective", "cautious", "negative", "mixed"].includes(
      parsed.sentiment_label
    )
  ) {
    throw new Error("OpenAI overview response is missing a valid sentiment_label");
  }

  return parsed as ModelOverview;
};

const toVectorLiteral = (embedding: number[]) => `[${embedding.join(",")}]`;

async function generateOverviewJson(member: MemberSeed, notes: MemberNote[]) {
  const response = await openAiFetch("/v1/responses", {
    method: "POST",
    body: JSON.stringify({
      model: OPENAI_MEMORY_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: MEMBER_MEMORY_SYSTEM_PROMPT
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildMemberMemoryUserPrompt(member, notes)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "member_memory_overview",
          strict: true,
          schema: memberMemoryOverviewSchema
        }
      }
    })
  });

  return parseOverviewJson(extractResponseText((await response.json()) as OpenAIResponsePayload));
}

async function generateEmbedding(overviewText: string) {
  const response = await openAiFetch("/v1/embeddings", {
    method: "POST",
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: overviewText,
      encoding_format: "float"
    })
  });
  const payload = (await response.json()) as EmbeddingPayload;
  const embedding = payload.data?.[0]?.embedding;

  if (!embedding?.length) {
    throw new Error("OpenAI embedding response did not include an embedding");
  }

  return embedding;
}

async function loadMemberProfile(airtableId: string) {
  const select = "airtable_id,name,aliases,related_organization,email,linkedin,raw_hash";
  const response = await supabaseRestFetch(
    `/rest/v1/members?select=${encodeURIComponent(select)}&airtable_id=eq.${encodeURIComponent(
      airtableId
    )}&limit=1`
  );

  if (!response.ok) {
    throw new Error("Failed to load member profile");
  }

  const [member] = (await response.json()) as MemberSeed[];
  if (!member) {
    throw new Error("Member not found");
  }

  return member;
}

export async function regenerateMemberMemoryOverview(
  airtableId: string
): Promise<MemberMemoryOverview> {
  const memberId = await getMemberIdByAirtableId(airtableId);
  if (!memberId) {
    throw new Error("Member not found");
  }

  const [member, notes] = await Promise.all([
    loadMemberProfile(airtableId),
    getMemberNotesForMemberId(memberId)
  ]);
  const generated = await generateOverviewJson(member, notes);
  const overviewJson: MemberMemoryOverviewJson = {
    primary_interests: generated.primary_interests,
    evaluation_lens: generated.evaluation_lens,
    cautions: generated.cautions,
    recent_signals: generated.recent_signals,
    sentiment_label: generated.sentiment_label
  };
  const overviewText = flattenMemberMemoryOverview(overviewJson);
  const embedding = await generateEmbedding(overviewText);
  const now = new Date().toISOString();
  const lastNoteAt = notes[0]?.occurred_at ?? null;

  const response = await supabaseRestFetch(
    "/rest/v1/member_memory?on_conflict=member_id&select=overview_text,overview_json,note_count,last_note_at,overview_updated_at",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        member_id: memberId,
        overview_text: overviewText,
        overview_json: overviewJson,
        overview_embedding: toVectorLiteral(embedding),
        note_count: notes.length,
        last_note_at: lastNoteAt,
        overview_updated_at: now
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to save member memory overview: ${await response.text()}`);
  }

  const [savedOverview] = (await response.json()) as MemberMemoryOverview[];
  return savedOverview;
}
