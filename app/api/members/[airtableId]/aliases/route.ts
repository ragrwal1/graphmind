import { NextRequest, NextResponse } from "next/server";
import { hasSupabaseAdminConfig, supabaseRestFetch } from "@/app/lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{
    airtableId: string;
  }>;
};

const cleanAliases = (aliases: unknown) => {
  if (!Array.isArray(aliases)) {
    return null;
  }

  return Array.from(
    new Set(
      aliases
        .map((alias) => (typeof alias === "string" ? alias.trim() : ""))
        .filter(Boolean)
    )
  );
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL plus a server-side Supabase key."
      },
      { status: 503 }
    );
  }

  const { airtableId } = await context.params;
  const body = await request.json().catch(() => null);
  const aliases = cleanAliases(body?.aliases);

  if (!aliases) {
    return NextResponse.json({ error: "aliases must be an array of strings" }, { status: 400 });
  }

  const updateResponse = await supabaseRestFetch("/rest/v1/rpc/update_member_aliases", {
    method: "POST",
    body: JSON.stringify({
      p_airtable_id: airtableId,
      p_aliases: aliases
    })
  });

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    const status = errorText.includes("Member not found") ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? "Member not found" : "Failed to update aliases" },
      { status }
    );
  }

  const [updatedMember] = (await updateResponse.json()) as unknown[];
  return NextResponse.json({ member: updatedMember });
}
