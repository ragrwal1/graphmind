import { createHash } from "node:crypto";

import {
  type AirtableRecord,
  type AirtableWebhookPayload,
  getAirtableRecord,
  getWebhookPayloads,
  listAirtableRecords,
  refreshAirtableWebhook,
} from "@/app/lib/airtableClient";
import { supabaseRestFetch } from "@/app/lib/supabaseAdmin";

type SyncEntity = "members" | "companies";

type TableConfig = {
  entity: SyncEntity;
  tableId: string;
  webhookId?: string;
  cursorKey?: string;
};

type SyncStats = {
  checked: number;
  written: number;
  archived: number;
  missing: number;
  errors: string[];
};

type MemberSyncRow = {
  airtable_id: string;
  name: string;
  aliases: string[];
  related_organization: string | null;
  email: string | null;
  linkedin: string | null;
  raw_hash: string;
};

type CompanySyncRow = {
  airtable_id: string;
  name: string;
  aliases: string[];
  vertical: string | null;
  stage: string | null;
  diligence_status: string | null;
  description: string | null;
  fiscal_year: string | null;
  website: string | null;
  contact_email: string | null;
  source_organization: string | null;
  raw_hash: string;
};

const nullIfBlank = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const firstText = (fields: Record<string, unknown>, names: string[]) => {
  for (const name of names) {
    const value = nullIfBlank(fields[name]);
    if (value) return value;
  }
  return null;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const hashFields = (fields: Record<string, unknown>) =>
  createHash("sha256").update(stableJson(fields)).digest("hex");

const uniqueAliases = (values: Array<string | null>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const nameParts = (name: string) => name.split(/\s+/).filter((part) => part.length > 2);

function normalizeStage(rawStage: string | null) {
  if (!rawStage) return null;
  const stage = rawStage.trim().toLowerCase();
  if (stage.includes("pre-seed") || stage.includes("pre seed") || stage.includes("preseed")) {
    return "Pre-Seed";
  }
  if (stage.includes("seed")) return "Seed";
  if (stage.includes("series a")) return "Series A";
  if (stage.includes("series b")) return "Series B";
  if (stage.includes("series c")) return "Series C";
  if (stage.includes("mvp") || stage.includes("prototype")) return "MVP";
  if (stage.includes("idea") || stage.includes("concept")) return "Idea";
  if (stage.includes("revenue") || stage.includes("growth")) return "Revenue Stage";
  return rawStage.trim().slice(0, 50);
}

function mapMember(record: AirtableRecord): MemberSyncRow | null {
  const name = firstText(record.fields, ["Name"]);
  if (!name) return null;

  const relatedOrganization = firstText(record.fields, ["Related Organization"]);

  return {
    airtable_id: record.id,
    name,
    aliases: uniqueAliases([name, ...nameParts(name), relatedOrganization]),
    related_organization: relatedOrganization,
    email: firstText(record.fields, ["Email"]),
    linkedin: firstText(record.fields, ["LinkedIn", "Linkedin", "LinkedIn URL"]),
    raw_hash: hashFields(record.fields),
  };
}

function mapCompany(record: AirtableRecord): CompanySyncRow | null {
  const name = firstText(record.fields, ["Company", "Name"]);
  if (!name) return null;

  return {
    airtable_id: record.id,
    name,
    aliases: uniqueAliases([name, ...nameParts(name)]),
    vertical: firstText(record.fields, ["Vertical"]),
    stage: normalizeStage(firstText(record.fields, ["Development Stage", "Stage"])),
    diligence_status: firstText(record.fields, ["Diligence Status"]),
    description: firstText(record.fields, ["Company Description", "Description"]),
    fiscal_year: firstText(record.fields, ["Fiscal Year"]),
    website: firstText(record.fields, ["Website"]),
    contact_email: firstText(record.fields, ["Contact - Email", "Contact Email"]),
    source_organization: firstText(record.fields, ["Source Organization"]),
    raw_hash: hashFields(record.fields),
  };
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function getOptionalEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

export function getTableConfigs(): TableConfig[] {
  const membersTableId = getOptionalEnv("AIRTABLE_MEMBERS_TABLE_ID", "AIRTABLE_INVESTORS_TABLE_ID");
  const companiesTableId = getOptionalEnv("AIRTABLE_COMPANIES_TABLE_ID");
  const configs: TableConfig[] = [];

  if (membersTableId) {
    const webhookId = getOptionalEnv("AIRTABLE_MEMBERS_WEBHOOK_ID", "AIRTABLE_INVESTORS_WEBHOOK_ID");
    configs.push({
      entity: "members",
      tableId: membersTableId,
      webhookId,
      cursorKey: webhookId ? `airtable_webhook_${webhookId}_cursor` : undefined,
    });
  }

  if (companiesTableId) {
    const webhookId = getOptionalEnv("AIRTABLE_COMPANIES_WEBHOOK_ID");
    configs.push({
      entity: "companies",
      tableId: companiesTableId,
      webhookId,
      cursorKey: webhookId ? `airtable_webhook_${webhookId}_cursor` : undefined,
    });
  }

  return configs;
}

export function getConfiguredTable(entity: SyncEntity) {
  const config = getTableConfigs().find((candidate) => candidate.entity === entity);
  if (!config) {
    const envName = entity === "members" ? "AIRTABLE_MEMBERS_TABLE_ID" : "AIRTABLE_COMPANIES_TABLE_ID";
    throw new Error(`Missing ${envName}.`);
  }
  return config;
}

async function getSyncState(key: string) {
  const response = await supabaseRestFetch(
    `/rest/v1/sync_state?select=value&key=eq.${encodeURIComponent(key)}&limit=1`
  );

  if (!response.ok) {
    throw new Error(`Failed to read sync state (${response.status}): ${await response.text()}`);
  }

  const rows = (await response.json()) as Array<{ value: string }>;
  return rows[0]?.value;
}

async function setSyncState(key: string, value: string) {
  const response = await supabaseRestFetch("/rest/v1/sync_state?on_conflict=key", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ key, value }),
  });

  if (!response.ok) {
    throw new Error(`Failed to write sync state (${response.status}): ${await response.text()}`);
  }
}

async function callSyncRpc(name: string, body: Record<string, unknown>) {
  const response = await supabaseRestFetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${name} failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as boolean;
}

async function upsertRecord(entity: SyncEntity, record: AirtableRecord) {
  if (entity === "members") {
    const member = mapMember(record);
    if (!member) return { skipped: true, written: false };
    const written = await callSyncRpc("sync_upsert_member", {
      p_airtable_id: member.airtable_id,
      p_name: member.name,
      p_aliases: member.aliases,
      p_related_organization: member.related_organization,
      p_email: member.email,
      p_linkedin: member.linkedin,
      p_raw_hash: member.raw_hash,
    });
    return { skipped: false, written };
  }

  const company = mapCompany(record);
  if (!company) return { skipped: true, written: false };
  const written = await callSyncRpc("sync_upsert_company", {
    p_airtable_id: company.airtable_id,
    p_name: company.name,
    p_aliases: company.aliases,
    p_vertical: company.vertical,
    p_stage: company.stage,
    p_diligence_status: company.diligence_status,
    p_description: company.description,
    p_fiscal_year: company.fiscal_year,
    p_website: company.website,
    p_contact_email: company.contact_email,
    p_source_organization: company.source_organization,
    p_raw_hash: company.raw_hash,
  });
  return { skipped: false, written };
}

async function archiveRecord(entity: SyncEntity, recordId: string) {
  return callSyncRpc(entity === "members" ? "sync_archive_member" : "sync_archive_company", {
    p_airtable_id: recordId,
  });
}

function emptyStats(): SyncStats {
  return { checked: 0, written: 0, archived: 0, missing: 0, errors: [] };
}

function collectRecordIds(payloads: AirtableWebhookPayload[], tableId: string) {
  const changed = new Set<string>();
  const destroyed = new Set<string>();

  for (const payload of payloads) {
    const tableChange = payload.changedTablesById?.[tableId];
    if (!tableChange) continue;

    for (const recordId of Object.keys(tableChange.createdRecordsById ?? {})) {
      changed.add(recordId);
      destroyed.delete(recordId);
    }

    for (const recordId of Object.keys(tableChange.changedRecordsById ?? {})) {
      changed.add(recordId);
      destroyed.delete(recordId);
    }

    for (const recordId of tableChange.destroyedRecordIds ?? []) {
      changed.delete(recordId);
      destroyed.add(recordId);
    }
  }

  return { changed: Array.from(changed), destroyed: Array.from(destroyed) };
}

export async function syncFull(entity?: SyncEntity) {
  const configs = entity ? [getConfiguredTable(entity)] : getTableConfigs();
  if (!configs.length) {
    throw new Error("No Airtable table IDs are configured.");
  }

  const result: Record<string, SyncStats> = {};

  for (const config of configs) {
    const stats = emptyStats();
    result[config.entity] = stats;
    const records = await listAirtableRecords(config.tableId);

    for (const record of records) {
      stats.checked += 1;
      try {
        const upsert = await upsertRecord(config.entity, record);
        if (upsert.skipped) stats.missing += 1;
        if (upsert.written) stats.written += 1;
      } catch (error) {
        stats.errors.push(`${record.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return result;
}

export async function syncWebhook(webhookId: string) {
  const config = getTableConfigs().find((candidate) => candidate.webhookId === webhookId);
  if (!config || !config.cursorKey) {
    throw new Error(`No table config found for webhook ${webhookId}.`);
  }

  const stats = emptyStats();
  const savedCursor = await getSyncState(config.cursorKey);
  let cursor = savedCursor ? Number(savedCursor) : undefined;
  let shouldContinue = true;

  while (shouldContinue) {
    const response = await getWebhookPayloads(webhookId, cursor);
    const recordIds = collectRecordIds(response.payloads, config.tableId);

    for (const recordId of recordIds.changed) {
      stats.checked += 1;
      try {
        const record = await getAirtableRecord(config.tableId, recordId);
        const upsert = await upsertRecord(config.entity, record);
        if (upsert.skipped) stats.missing += 1;
        if (upsert.written) stats.written += 1;
      } catch (error) {
        stats.errors.push(`${recordId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const recordId of recordIds.destroyed) {
      stats.checked += 1;
      try {
        if (await archiveRecord(config.entity, recordId)) {
          stats.archived += 1;
        }
      } catch (error) {
        stats.errors.push(`${recordId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    cursor = response.cursor;
    await setSyncState(config.cursorKey, String(cursor));
    shouldContinue = response.mightHaveMore;
  }

  return { [config.entity]: stats };
}

export async function refreshConfiguredWebhooks() {
  const results: Array<{ entity: SyncEntity; webhookId: string; expirationTime?: string }> = [];

  for (const config of getTableConfigs()) {
    if (!config.webhookId) continue;
    const response = await refreshAirtableWebhook(config.webhookId);
    results.push({
      entity: config.entity,
      webhookId: config.webhookId,
      expirationTime: response.expirationTime,
    });
  }

  return results;
}

export function assertCronSecret(secret: string | null, authorization: string | null) {
  const expected = getRequiredEnv("CRON_SECRET");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  if (secret !== expected && bearer !== expected) {
    throw new Error("Unauthorized.");
  }
}
