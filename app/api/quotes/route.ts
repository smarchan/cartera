import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/server/market";

export const dynamic = "force-dynamic";

const SYMBOL = /^[A-Za-z0-9.\-=^]{1,20}$/;

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SYMBOL.test(s))
    .slice(0, 60);
  if (symbols.length === 0) return NextResponse.json({});
  try {
    const data = await getQuotes(symbols);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } });
  } catch (e) {
    return NextResponse.json({ error: "No se pudieron obtener cotizaciones" }, { status: 502 });
  }
}
