import { NextRequest, NextResponse } from "next/server";

import {
  assertCronSecret,
  refreshConfiguredWebhooks,
  syncWebhook,
} from "@/app/lib/airtableSync";

export async function POST(request: NextRequest) {
  try {
    assertCronSecret(
      request.nextUrl.searchParams.get("secret"),
      request.headers.get("authorization")
    );

    const payload = (await request.json()) as {
      webhook?: { id?: string };
    };
    const webhookId = payload.webhook?.id;

    if (!webhookId) {
      return NextResponse.json({ error: "Missing Airtable webhook ID." }, { status: 400 });
    }

    const result = await syncWebhook(webhookId);
    return NextResponse.json({ ok: true, webhookId, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook sync failed.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized." ? 401 : 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    assertCronSecret(
      request.nextUrl.searchParams.get("secret"),
      request.headers.get("authorization")
    );

    const result = await refreshConfiguredWebhooks();
    return NextResponse.json({ ok: true, refreshed: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook refresh failed.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized." ? 401 : 500 }
    );
  }
}
