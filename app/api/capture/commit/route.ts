import { NextRequest, NextResponse } from "next/server";
import { commitCaptureUpdates, type CaptureCommitInput } from "@/app/lib/capture/noteCommitMicroservice";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Partial<CaptureCommitInput> | null;

  try {
    return NextResponse.json(
      await commitCaptureUpdates({
        capture_id: body?.capture_id ?? "",
        updates: body?.updates ?? []
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save capture";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
