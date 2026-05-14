/**
 * seed-companies-rest.mjs
 *
 * Seeds the Supabase companies table via REST API using only the columns
 * that exist in the initial schema migration (no website/contact_email cols).
 * Safe to run multiple times — uses ON CONFLICT DO UPDATE via upsert header.
 *
 * Usage: node scripts/seed-companies-rest.mjs
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";

const root = process.cwd();

// ── Load .env.local ────────────────────────────────────────────────────────────
const envPath = path.join(root, ".env.local");
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
} catch { /* no .env.local */ }

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌  Missing SUPABASE_URL / key in .env.local");
  process.exit(1);
}

// ── Parse CSV ──────────────────────────────────────────────────────────────────
const normalizeHeader = (v) => v.replace(/^﻿/, "").trim();

const slugify = (v) =>
  v.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);

const stableId = (name, website) => {
  const suffix = createHash("sha1").update(`${name}|${website || ""}`).digest("hex").slice(0, 10);
  return `snapshot-company-${slugify(name)}-${suffix}`;
};

const normalizeStage = (raw) => {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes("pre-seed") || s.includes("preseed") || s.includes("pre seed")) return "Pre-Seed";
  if (s.includes("seed")) return "Seed";
  if (s.includes("series a")) return "Series A";
  if (s.includes("series b")) return "Series B";
  if (s.includes("series c")) return "Series C";
  if (s.includes("mvp") || s.includes("prototype")) return "MVP";
  if (s.includes("idea") || s.includes("concept")) return "Idea";
  return raw.trim().slice(0, 50);
};

const csv = await readFile(path.join(root, "DB-Snapshot-CSV", "InvestU Captured Opportunities (1).csv"), "utf8");
const rows = parse(csv, { columns: (h) => h.map(normalizeHeader), skip_empty_lines: true, trim: true, relax_column_count: true });

const seen = new Map();
for (const row of rows) {
  if (!row.Company?.trim()) continue;
  const name = row.Company.trim();
  const website = row.Website?.trim() || null;
  const id = stableId(name, website);
  if (!seen.has(id)) {
    seen.set(id, {
      airtable_id: id,
      name,
      aliases: Array.from(new Set([name, ...name.split(/\s+/).filter((p) => p.length > 2)])),
      vertical: row.Vertical?.trim() || null,
      stage: normalizeStage(row["Development Stage"]),
      diligence_status: row["Diligence Status"]?.trim() || null,
      description: row["Company Description"]?.trim() || null,
      fiscal_year: row["Fiscal Year"]?.trim() || null,
      raw_hash: createHash("sha256").update(JSON.stringify(row)).digest("hex"),
      material_change: true,
      status: "active",
    });
  }
}

const companies = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
console.log(`\n📦  ${companies.length} companies to upsert into Supabase\n`);

// ── Batch upsert via REST ──────────────────────────────────────────────────────
const BATCH = 50;
let inserted = 0;
let failed = 0;

for (let i = 0; i < companies.length; i += BATCH) {
  const batch = companies.slice(i, i + BATCH);
  const rangeEnd = Math.min(i + BATCH, companies.length);
  process.stdout.write(`  [${i + 1}–${rangeEnd}/${companies.length}] Upserting…`);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });

  if (res.ok) {
    console.log(` ✓`);
    inserted += batch.length;
  } else {
    const err = await res.text();
    console.error(` ✗  HTTP ${res.status}: ${err.slice(0, 120)}`);
    failed += batch.length;
  }

  // Small pause to avoid rate limits
  if (i + BATCH < companies.length) {
    await new Promise((r) => setTimeout(r, 80));
  }
}

console.log(`\n✅  Done. Inserted/updated: ${inserted}  Failed: ${failed}`);

// Verify
const check = await fetch(
  `${SUPABASE_URL}/rest/v1/companies?select=count&status=eq.active`,
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "count=exact",
    },
  }
);
const range = check.headers.get("content-range");
console.log(`🔍  Supabase companies count: ${range ?? "(unknown)"}`);
