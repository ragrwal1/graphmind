import { NextRequest, NextResponse } from "next/server";
import { extractCaptureUpdates, type CaptureExtractInput } from "@/app/lib/capture/extractionMicroservice";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Partial<CaptureExtractInput> | null;

  try {
    return NextResponse.json(
      await extractCaptureUpdates({
        capture_id: body?.capture_id ?? "",
        transcript: body?.transcript ?? ""
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extract capture";
    const status = message.includes("configured") ? 503 : message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
