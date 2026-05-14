/**
 * Regenerates company embeddings through the app microservice, one company at a time.
 *
 * Usage:
 *   APP_URL=http://localhost:3000 node scripts/regenerate-company-embeddings.mjs
 *   APP_URL=http://localhost:3000 node scripts/regenerate-company-embeddings.mjs --reembed
 *
 * By default, only companies with null embeddings are regenerated.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

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
  // .env.local not present; rely on shell environment.
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const PAGE_SIZE = 200;
const REEMBED = process.argv.includes("--reembed");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function fetchCompaniesPage(offset) {
  const filter = REEMBED ? "status=eq.active" : "status=eq.active&embedding=is.null";
  const select = encodeURIComponent("airtable_id,name");
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/companies?${filter}&select=${select}&order=name.asc&offset=${offset}&limit=${PAGE_SIZE}`,
    { headers: supabaseHeaders() }
  );

  if (!response.ok) {
    throw new Error(`Failed to load companies (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function regenerateCompany(company) {
  const response = await fetch(
    `${APP_URL}/api/companies/${encodeURIComponent(company.airtable_id)}/embedding/regenerate`,
    { method: "POST" }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

console.log(`Regenerating company embeddings via ${APP_URL}`);
console.log(`Mode: ${REEMBED ? "all active companies" : "missing embeddings only"}`);

let processed = 0;
let failed = 0;

while (true) {
  const companies = await fetchCompaniesPage(REEMBED ? processed : 0);
  if (!companies.length) break;

  for (const company of companies) {
    process.stdout.write(`  ${company.name}...`);
    try {
      await regenerateCompany(company);
      processed += 1;
      console.log(" ok");
    } catch (error) {
      failed += 1;
      console.log(" failed");
      console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (companies.length < PAGE_SIZE) break;
}

console.log(`Done. Embedded: ${processed}, failed: ${failed}`);
