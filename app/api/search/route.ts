import { NextRequest, NextResponse } from "next/server";
import { hybridSearch } from "@/app/lib/hybridSearch";
import type { ResultType } from "@/app/lib/hybridSearch";

const VALID_TYPES: ResultType[] = ["investor", "company"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const limitParam = params.get("limit");
  const limit = limitParam
    ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 50)
    : 20;

  // ?types=investors,companies  or  ?types=investor&types=company
  // accept both singular and plural forms
  const normalize = (t: string): ResultType | null => {
    const s = t.trim().toLowerCase();
    if (s === "investor" || s === "investors") return "investor";
    if (s === "company" || s === "companies") return "company";
    return null;
  };

  const typesRaw = params
    .getAll("types")
    .flatMap((t) => t.split(","))
    .map((t) => normalize(t))
    .filter((t): t is ResultType => t !== null);

  const types: ResultType[] = typesRaw.length ? typesRaw : ["investor", "company"];

  if (types.length === 0) {
    return NextResponse.json(
      { error: "At least one valid type required (investor, company)" },
      { status: 400 }
    );
  }

  const response = await hybridSearch(query, types, limit);
  return NextResponse.json(response);
}
