/**
 * embed-companies.mjs
 *
 * Batch-generates OpenAI text-embedding-3-small vectors for all active companies
 * in Supabase that don't yet have an embedding (or --reembed flag to redo all).
 *
 * Usage:
 *   node scripts/embed-companies.mjs           # embed only unembedded rows
 *   node scripts/embed-companies.mjs --reembed  # regenerate all embeddings
 *   node scripts/embed-companies.mjs --dry-run  # show what would be embedded
 *
 * Requires environment variables (reads from .env.local automatically):
 *   SUPABASE_URL  or  NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  or  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   OPENAI_API_KEY
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

// ── Load .env.local ────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
try {
  const envContent = await readFile(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env.local not present — rely on shell environment
}

// ── Config ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

const BATCH_SIZE = 20;       // OpenAI embeddings per request
const PAGE_SIZE = 200;       // Supabase rows per fetch page
const RATE_LIMIT_MS = 500;   // ms between OpenAI batches

const args = process.argv.slice(2);
const REEMBED = args.includes("--reembed");
const DRY_RUN = args.includes("--dry-run");

// ── Validation ─────────────────────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in environment.");
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function supabaseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

async function fetchCompaniesPage(offset) {
  const filter = REEMBED
    ? `status=eq.active`
    : `status=eq.active&embedding=is.null`;
  const url = `${SUPABASE_URL}/rest/v1/companies?${filter}&select=airtable_id,name,description,vertical&order=name.asc&offset=${offset}&limit=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) {
    throw new Error(`Supabase fetch failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

function buildEmbedText(company) {
  const parts = [company.name];
  if (company.vertical) parts.push(company.vertical);
  if (company.description) parts.push(company.description);
  return parts.join(". ").slice(0, 8000); // stay within token limits
}

async function fetchEmbeddings(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function updateEmbeddings(batch) {
  // Supabase REST doesn't support bulk upsert by arbitrary field, so we patch one at a time
  // in parallel within the batch (all have already been rate-limited by the OpenAI call).
  await Promise.all(
    batch.map(({ airtable_id, embedding }) =>
      fetch(
        `${SUPABASE_URL}/rest/v1/companies?airtable_id=eq.${encodeURIComponent(airtable_id)}`,
        {
          method: "PATCH",
          headers: supabaseHeaders(),
          body: JSON.stringify({ embedding }),
        }
      ).then(async (res) => {
        if (!res.ok) {
          console.error(`  ⚠️  Failed to update ${airtable_id}: ${await res.text()}`);
        }
      })
    )
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ───────────────────────────────────────────────────────────────────────
console.log(`\n🔍  embed-companies — model: ${EMBEDDING_MODEL}`);
console.log(`    Mode: ${REEMBED ? "re-embed ALL" : "embed unembedded only"}${DRY_RUN ? " (dry-run)" : ""}\n`);

let totalProcessed = 0;
let totalFailed = 0;

// Always fetch from offset 0 — as we patch embeddings, the "embedding IS NULL"
// set shrinks, so offset 0 always gives the next unembedded page.
while (true) {
  const companies = await fetchCompaniesPage(0);
  if (companies.length === 0) break;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const texts = batch.map(buildEmbedText);

    const rangeStart = totalProcessed + i + 1;
    const rangeEnd = totalProcessed + i + batch.length;
    process.stdout.write(`  [${rangeStart}–${rangeEnd}] Embedding: ${batch[0].name}…`);

    if (DRY_RUN) {
      console.log(" (skipped)");
      continue;
    }

    try {
      const embeddings = await fetchEmbeddings(texts);
      const updates = batch.map((c, idx) => ({
        airtable_id: c.airtable_id,
        embedding: embeddings[idx],
      }));
      await updateEmbeddings(updates);
      console.log(` ✓`);
    } catch (err) {
      console.error(` ✗ ${err.message}`);
      totalFailed += batch.length;
    }

    if (i + BATCH_SIZE < companies.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  totalProcessed += companies.length;

  // If the page was full there may be more — loop again from offset 0.
  // If it was a partial page we've hit the end of unembedded rows.
  if (companies.length < PAGE_SIZE) break;
}

console.log(`\n✅  Done. Processed: ${totalProcessed}, Failed: ${totalFailed}`);
if (DRY_RUN) {
  console.log("    (dry-run — no embeddings were written)");
}
