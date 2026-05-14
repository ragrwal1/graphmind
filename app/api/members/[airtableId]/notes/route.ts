import { NextRequest, NextResponse } from "next/server";
import { createMemberNote, getMemberNotesPayload } from "@/app/lib/memberNotes";
import { deleteMemberNotes } from "@/app/lib/memberNoteDeletionMicroservice";
import { hasSupabaseAdminConfig } from "@/app/lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{
    airtableId: string;
  }>;
};

const supabaseMissingResponse = () =>
  NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!hasSupabaseAdminConfig()) {
    return supabaseMissingResponse();
  }

  const { airtableId } = await context.params;

  try {
    return NextResponse.json(await getMemberNotesPayload(airtableId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notes";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!hasSupabaseAdminConfig()) {
    return supabaseMissingResponse();
  }

  const { airtableId } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    return NextResponse.json(await createMemberNote(airtableId, body?.note_text ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save note";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!hasSupabaseAdminConfig()) {
    return supabaseMissingResponse();
  }

  const { airtableId } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    return NextResponse.json(await deleteMemberNotes(airtableId, body?.note_ids));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete notes";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}
