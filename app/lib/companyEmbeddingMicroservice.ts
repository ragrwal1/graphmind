import { OPENAI_EMBEDDING_MODEL, openAiFetch } from "@/app/lib/openaiClient";
import { supabaseRestFetch } from "@/app/lib/supabaseAdmin";

type EmbeddingPayload = {
  data?: Array<{
    embedding?: number[];
  }>;
};

export type CompanyEmbeddingSource = {
  airtable_id: string;
  name: string;
  vertical: string | null;
  description: string | null;
};

const MAX_EMBED_TEXT_LENGTH = 8000;

const toVectorLiteral = (embedding: number[]) => `[${embedding.join(",")}]`;

export function buildCompanyEmbeddingText(company: CompanyEmbeddingSource) {
  const parts = [company.name];
  if (company.vertical) parts.push(company.vertical);
  if (company.description) parts.push(company.description);
  return parts.join(". ").slice(0, MAX_EMBED_TEXT_LENGTH);
}

async function generateCompanyEmbedding(company: CompanyEmbeddingSource) {
  const response = await openAiFetch("/v1/embeddings", {
    method: "POST",
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: buildCompanyEmbeddingText(company),
      encoding_format: "float",
    }),
  });
  const payload = (await response.json()) as EmbeddingPayload;
  const embedding = payload.data?.[0]?.embedding;

  if (!embedding?.length) {
    throw new Error("OpenAI embedding response did not include an embedding.");
  }

  return embedding;
}

export async function loadCompanyEmbeddingSource(airtableId: string) {
  const select = "airtable_id,name,vertical,description";
  const response = await supabaseRestFetch(
    `/rest/v1/companies?select=${encodeURIComponent(select)}&airtable_id=eq.${encodeURIComponent(
      airtableId
    )}&status=eq.active&limit=1`
  );

  if (!response.ok) {
    throw new Error(`Failed to load company: ${await response.text()}`);
  }

  const [company] = (await response.json()) as CompanyEmbeddingSource[];
  if (!company) {
    throw new Error("Company not found.");
  }

  return company;
}

export async function regenerateCompanyEmbedding(airtableId: string) {
  const company = await loadCompanyEmbeddingSource(airtableId);
  const embedding = await generateCompanyEmbedding(company);
  const response = await supabaseRestFetch(
    `/rest/v1/companies?airtable_id=eq.${encodeURIComponent(company.airtable_id)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        embedding: toVectorLiteral(embedding),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to save company embedding: ${await response.text()}`);
  }

  const [savedCompany] = (await response.json()) as CompanyEmbeddingSource[];
  return savedCompany;
}
