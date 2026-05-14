import { NextRequest, NextResponse } from "next/server";
import { transcribeCaptureAudio } from "@/app/lib/capture/transcriptionMicroservice";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");

  try {
    if (!(audio instanceof File)) {
      throw new Error("audio is required");
    }

    return NextResponse.json(await transcribeCaptureAudio({ audio }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to transcribe capture";
    const status = message.includes("configured") ? 503 : message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
