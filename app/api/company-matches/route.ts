import { NextRequest, NextResponse } from "next/server";
import { getCompanyInvestorMatches } from "@/app/lib/companyInvestorMatches";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const airtableId = params.get("company");
  const limitParam = params.get("limit");
  const limit = limitParam
    ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 50)
    : 20;

  if (!airtableId) {
    return NextResponse.json(
      { error: "Missing company Airtable ID. Use ?company=<airtable_id>." },
      { status: 400 }
    );
  }

  try {
    const response = await getCompanyInvestorMatches(airtableId, limit);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to match company" },
      { status: 500 }
    );
  }
}
