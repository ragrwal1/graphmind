const openAiApiKey = process.env.OPENAI_API_KEY;

export const OPENAI_MEMORY_MODEL = process.env.OPENAI_MEMORY_MODEL ?? "gpt-4.1-mini";
export const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export function hasOpenAIConfig() {
  return Boolean(openAiApiKey);
}

export function assertOpenAIConfig() {
  if (!openAiApiKey) {
    throw new Error("OpenAI is not configured. Set OPENAI_API_KEY in .env.local.");
  }
}

export async function openAiFetch(path: string, init: RequestInit) {
  assertOpenAIConfig();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${openAiApiKey}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`https://api.openai.com${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
  }

  return response;
}
