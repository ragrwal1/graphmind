import { NextRequest, NextResponse } from "next/server";
import { regenerateMemberMemoryOverview } from "@/app/lib/memberMemoryMicroservice";
import { getMemberNotesPayload } from "@/app/lib/memberNotes";
import { hasOpenAIConfig } from "@/app/lib/openaiClient";
import { hasSupabaseAdminConfig } from "@/app/lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{
    airtableId: string;
  }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  if (!hasOpenAIConfig()) {
    return NextResponse.json({ error: "OpenAI is not configured" }, { status: 503 });
  }

  const { airtableId } = await context.params;

  try {
    await regenerateMemberMemoryOverview(airtableId);
    return NextResponse.json(await getMemberNotesPayload(airtableId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to regenerate member memory";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
