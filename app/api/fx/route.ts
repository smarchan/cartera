import { NextRequest, NextResponse } from "next/server";
import { getFxHistory } from "@/lib/server/market";
import type { FxResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const CCY = /^[A-Z]{3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const base = (p.get("base") ?? "").toUpperCase();
  const from = p.get("from") ?? "";
  if (!CCY.test(base) || !DAY.test(from)) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  const ccys = (p.get("ccys") ?? "").toUpperCase().split(",").filter((c) => CCY.test(c) && c !== base).slice(0, 20);
  const out: FxResponse = { base, pairs: {} };
  await Promise.all(
    ccys.map(async (c) => {
      try {
        out.pairs[c] = await getFxHistory(c, base, from);
      } catch {
        out.pairs[c] = { error: `Tipo de cambio ${c}/${base} no disponible` };
      }
    }),
  );
  return NextResponse.json(out, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
