import { NextRequest, NextResponse } from "next/server";

import { assertCronSecret, syncFull } from "@/app/lib/airtableSync";

export async function GET(request: NextRequest) {
  try {
    assertCronSecret(
      request.nextUrl.searchParams.get("secret"),
      request.headers.get("authorization")
    );

    const entityParam = request.nextUrl.searchParams.get("entity");
    const entity =
      entityParam === "members" || entityParam === "companies" ? entityParam : undefined;

    if (entityParam && !entity) {
      return NextResponse.json(
        { error: "Invalid entity. Use members or companies." },
        { status: 400 }
      );
    }

    const result = await syncFull(entity);
    return NextResponse.json({ ok: true, mode: "full", result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Full sync failed.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized." ? 401 : 500 }
    );
  }
}
