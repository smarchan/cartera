import { NextRequest, NextResponse } from "next/server";
import { getChart, type ChartData } from "@/lib/server/market";

export const dynamic = "force-dynamic";

const SYMBOL = /^[A-Za-z0-9.\-=^]{1,20}$/;

/** Last-session intraday series for several symbols at once (for the mini charts). */
export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "").split(",").filter((s) => SYMBOL.test(s)).slice(0, 40);
  const out: Record<string, ChartData> = {};
  await Promise.all(
    symbols.map(async (s) => {
      try {
        out[s] = await getChart(s, "1d");
      } catch {
        /* omit symbols without intraday data */
      }
    }),
  );
  return NextResponse.json(out, { headers: { "Cache-Control": "private, max-age=30" } });
}
