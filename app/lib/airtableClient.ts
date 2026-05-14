type AirtableListResponse<T> = {
  records: T[];
  offset?: string;
};

export type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

export type AirtableWebhookPayload = {
  baseTransactionNumber?: number;
  timestamp?: string;
  payloadFormat?: string;
  changedTablesById?: Record<
    string,
    {
      createdRecordsById?: Record<string, unknown>;
      changedRecordsById?: Record<string, unknown>;
      destroyedRecordIds?: string[];
    }
  >;
};

type AirtablePayloadsResponse = {
  cursor: number;
  mightHaveMore: boolean;
  payloads: AirtableWebhookPayload[];
};

type WebhookCreateResponse = {
  id: string;
  expirationTime?: string;
};

const airtableApiBase = "https://api.airtable.com/v0";

function getAirtableToken() {
  const token = process.env.AIRTABLE_TOKEN ?? process.env.AIRTABLE_API_TOKEN;
  if (!token) {
    throw new Error("Missing AIRTABLE_TOKEN or AIRTABLE_API_TOKEN.");
  }
  return token;
}

export function getAirtableBaseId() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!baseId) {
    throw new Error("Missing AIRTABLE_BASE_ID.");
  }
  return baseId;
}

function airtableHeaders() {
  return {
    Authorization: `Bearer ${getAirtableToken()}`,
    "Content-Type": "application/json",
  };
}

async function airtableFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${airtableApiBase}${path}`, {
    ...init,
    headers: {
      ...airtableHeaders(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Airtable request failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export async function listAirtableRecords(tableId: string) {
  const baseId = getAirtableBaseId();
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const response = await airtableFetch<AirtableListResponse<AirtableRecord>>(
      `/${baseId}/${encodeURIComponent(tableId)}?${params.toString()}`
    );
    records.push(...response.records);
    offset = response.offset;
  } while (offset);

  return records;
}

export async function getAirtableRecord(tableId: string, recordId: string) {
  const baseId = getAirtableBaseId();
  return airtableFetch<AirtableRecord>(
    `/${baseId}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`
  );
}

export async function getWebhookPayloads(webhookId: string, cursor?: number) {
  const baseId = getAirtableBaseId();
  const params = new URLSearchParams();
  if (cursor !== undefined) params.set("cursor", String(cursor));
  const suffix = params.size ? `?${params.toString()}` : "";
  return airtableFetch<AirtablePayloadsResponse>(
    `/bases/${baseId}/webhooks/${encodeURIComponent(webhookId)}/payloads${suffix}`
  );
}

export async function refreshAirtableWebhook(webhookId: string) {
  const baseId = getAirtableBaseId();
  return airtableFetch<{ expirationTime?: string }>(
    `/bases/${baseId}/webhooks/${encodeURIComponent(webhookId)}/refresh`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function createAirtableWebhook(notificationUrl: string, tableId: string) {
  const baseId = getAirtableBaseId();
  return airtableFetch<WebhookCreateResponse>(`/bases/${baseId}/webhooks`, {
    method: "POST",
    body: JSON.stringify({
      notificationUrl,
      specification: {
        options: {
          filters: {
            dataTypes: ["tableData"],
            recordChangeScope: tableId,
          },
        },
      },
    }),
  });
}
