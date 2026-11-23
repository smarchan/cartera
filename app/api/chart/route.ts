import { NextRequest, NextResponse } from "next/server";
import { CHART_RANGES, getChart, type ChartRange } from "@/lib/server/market";

export const dynamic = "force-dynamic";

const SYMBOL = /^[A-Za-z0-9.\-=^]{1,20}$/;

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "";
  const range = (req.nextUrl.searchParams.get("range") ?? "1d") as ChartRange;
  if (!SYMBOL.test(symbol) || !CHART_RANGES.includes(range)) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  try {
    const data = await getChart(symbol, range);
    return NextResponse.json(data, { headers: { "Cache-Control": `private, max-age=${range === "1d" ? 30 : 300}` } });
  } catch {
    return NextResponse.json({ error: `Sin gráfica para ${symbol}` }, { status: 502 });
  }
}
