import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/server/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  if (q.length < 1) return NextResponse.json([]);
  try {
    return NextResponse.json(await search(q), { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch {
    return NextResponse.json([], { status: 502 });
  }
}
