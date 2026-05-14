import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "../..");
const demoDir = import.meta.dirname;
const port = Number(process.env.PORT ?? 8787);

await loadEnvFile(".env");
await loadEnvFile(".env.local");

const openAiApiKey = process.env.OPENAI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/process") {
      await handleProcess(req, res);
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const pathname = new URL(req.url ?? "/", `http://localhost:${port}`).pathname;
    const filePath = pathname === "/" ? join(demoDir, "index.html") : join(demoDir, pathname);

    if (!filePath.startsWith(demoDir)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    sendJson(res, 500, { error: error.message });
  }
}).listen(port, () => {
  console.log(`STT POC listening at http://localhost:${port}`);
});

async function handleProcess(req, res) {
  if (!openAiApiKey) throw new Error("OPENAI_API_KEY is required.");

  const body = await readJson(req);
  if (!body.audioBase64) throw new Error("audioBase64 is required.");

  const members = await loadMembers();
  const vocabulary = buildVocabulary(members);
  const transcript = await transcribeAudio({
    audioBase64: body.audioBase64,
    mimeType: body.mimeType || "audio/webm",
    filename: body.filename || "speech.webm",
    vocabulary
  });
  const extracted = await extractMemberUpdates({ transcript, members });

  sendJson(res, 200, {
    transcript,
    extracted,
    memberVocabularyCount: vocabulary.length
  });
}

async function transcribeAudio({ audioBase64, mimeType, filename, vocabulary }) {
  const audioBytes = Buffer.from(audioBase64, "base64");
  const formData = new FormData();
  formData.append("model", process.env.OPENAI_STT_MODEL ?? "whisper-1");
  formData.append("response_format", "json");
  formData.append(
    "prompt",
    [
      "This is a relationship note about people in a member database.",
      "Prefer these spellings for names and nicknames:",
      vocabulary.slice(0, 500).join(", ")
    ].join("\n")
  );
  formData.append("file", new Blob([audioBytes], { type: mimeType }), filename);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiApiKey}` },
    body: formData
  });

  if (!response.ok) throw new Error(`STT failed (${response.status}): ${await response.text()}`);

  const payload = await response.json();
  return payload.text ?? "";
}

async function extractMemberUpdates({ transcript, members }) {
  const model = process.env.OPENAI_STRUCTURED_MODEL ?? process.env.OPENAI_MEMORY_MODEL ?? "gpt-4.1-mini";
  const knownMembers = members
    .map((member) => {
      const aliases = Array.isArray(member.aliases) ? member.aliases.filter(Boolean) : [];
      return [
        `investor_id: ${member.airtable_id}`,
        `name: ${member.name}`,
        aliases.length ? `aliases: ${aliases.join(", ")}` : "aliases:"
      ].join(" | ");
    })
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Extract concise relationship-memory updates from the transcript. Match spoken nicknames to the known member list when possible. Return short fragments like 'newly into cars' or 'into energy'. Use the spoken short name as name."
        },
        {
          role: "user",
          content: `Known members and aliases:\n${knownMembers}\n\nTranscript:\n${transcript}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "member_updates",
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
                    name: {
                      type: "string",
                      description:
                        "The short spoken name or nickname for the member, normalized to lowercase."
                    },
                    matched_member_name: {
                      type: "string",
                      description:
                        "The full member name from the known member list, or an empty string if uncertain."
                    },
                    detail: {
                      type: "string",
                      description: "A concise memory fragment about this member."
                    }
                  },
                  required: ["name", "matched_member_name", "detail"]
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

  const payload = await response.json();
  const parsed = JSON.parse(payload.choices[0].message.content);
  return {
    updates: parsed.updates.map((update) => {
      const member = resolveMember(update, members);
      return {
        spoken_name: update.name,
        investor_id: member?.airtable_id ?? null,
        matched_name: member?.name ?? update.matched_member_name ?? null,
        detail: update.detail
      };
    })
  };
}

async function loadMembers() {
  if (supabaseUrl && supabaseKey) {
    const select = "airtable_id,name,aliases";
    const response = await fetch(
      `${supabaseUrl}/rest/v1/members?select=${encodeURIComponent(select)}&status=eq.active&order=name.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    if (response.ok) return response.json();
    console.warn("Falling back to seed members:", await response.text());
  }

  const seed = await readFile(join(rootDir, "app/data/members.seed.json"), "utf8");
  return JSON.parse(seed);
}

function buildVocabulary(members) {
  const names = new Set();
  for (const member of members) {
    if (member.name) names.add(member.name);
    for (const alias of member.aliases ?? []) {
      if (alias) names.add(alias);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function resolveMember(update, members) {
  const candidates = [
    update.matched_member_name,
    update.name,
    ...(update.name ? update.name.split(/\s+/) : [])
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeName(candidate);
    const exact = members.find((member) =>
      memberVocabulary(member).some((value) => normalizeName(value) === normalizedCandidate)
    );
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeName(candidate);
    if (!normalizedCandidate) continue;
    const contains = members.find((member) =>
      memberVocabulary(member).some((value) => normalizeName(value).includes(normalizedCandidate))
    );
    if (contains) return contains;
  }

  return null;
}

function memberVocabulary(member) {
  return [member.name, ...(member.aliases ?? [])].filter(Boolean);
}

function normalizeName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadEnvFile(filename) {
  try {
    const text = await readFile(join(rootDir, filename), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (process.env[key]) continue;
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function readJson(req) {
  return new Promise((resolveJson, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolveJson(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
