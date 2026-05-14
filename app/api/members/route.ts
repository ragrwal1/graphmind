import { NextRequest, NextResponse } from "next/server";
import { getMembers, searchMemberList } from "@/app/lib/members";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const members = await getMembers();
  return NextResponse.json({ members: searchMemberList(members, query) });
}
