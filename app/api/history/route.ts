import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/server/market";
import type { HistoryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const SYMBOL = /^[A-Za-z0-9.\-=^]{1,20}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const from = p.get("from") ?? "";
  if (!DAY.test(from)) return NextResponse.json({ error: "Parámetro 'from' inválido (YYYY-MM-DD)" }, { status: 400 });
  const symbols = (p.get("symbols") ?? "").split(",").map((s) => s.trim()).filter((s) => SYMBOL.test(s)).slice(0, 60);
  const out: HistoryResponse = {};
  await Promise.all(
    symbols.map(async (s) => {
      try {
        out[s] = await getHistory(s, from);
      } catch {
        out[s] = { error: `Sin histórico para ${s}` };
      }
    }),
  );
  return NextResponse.json(out, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
