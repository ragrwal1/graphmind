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
  // Rely on shell environment.
}

const token = process.env.AIRTABLE_TOKEN ?? process.env.AIRTABLE_API_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID;
const cronSecret = process.env.CRON_SECRET;
const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;

if (!token) throw new Error("Missing AIRTABLE_TOKEN or AIRTABLE_API_TOKEN.");
if (!baseId) throw new Error("Missing AIRTABLE_BASE_ID.");
if (!cronSecret) throw new Error("Missing CRON_SECRET.");
if (!appUrl) throw new Error("Missing APP_URL, NEXT_PUBLIC_APP_URL, or VERCEL_URL.");

const origin = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
const notificationUrl = new URL("/api/airtable/webhook", origin);
notificationUrl.searchParams.set("secret", cronSecret);

const targets = [
  {
    name: "members",
    tableId: process.env.AIRTABLE_MEMBERS_TABLE_ID ?? process.env.AIRTABLE_INVESTORS_TABLE_ID,
  },
  {
    name: "companies",
    tableId: process.env.AIRTABLE_COMPANIES_TABLE_ID,
  },
].filter((target) => target.tableId);

if (!targets.length) {
  throw new Error("Missing AIRTABLE_MEMBERS_TABLE_ID/AIRTABLE_INVESTORS_TABLE_ID or AIRTABLE_COMPANIES_TABLE_ID.");
}

async function createWebhook(target) {
  const response = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      notificationUrl: notificationUrl.toString(),
      specification: {
        options: {
          filters: {
            dataTypes: ["tableData"],
            recordChangeScope: target.tableId,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`${target.name} webhook failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

for (const target of targets) {
  const webhook = await createWebhook(target);
  const envName =
    target.name === "members" ? "AIRTABLE_MEMBERS_WEBHOOK_ID" : "AIRTABLE_COMPANIES_WEBHOOK_ID";
  console.log(`${target.name}: ${webhook.id}`);
  console.log(`  add to env: ${envName}=${webhook.id}`);
  if (webhook.expirationTime) {
    console.log(`  expires: ${webhook.expirationTime}`);
  }
}

console.log(`\nWebhook notification URL:\n${notificationUrl.toString()}`);
