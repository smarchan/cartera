import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { importTxs } from "@/lib/server/repo";
import { fail, readJson, requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  const body = (await readJson(req)) as { txs?: unknown; mode?: unknown } | null;
  if (!body || !Array.isArray(body.txs)) return NextResponse.json({ error: "Faltan operaciones." }, { status: 400 });
  const mode = body.mode === "replace" ? "replace" : "append";
  try {
    const count = await importTxs(await getDb(), userId, body.txs, mode);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return /^(Fila|Máximo)/.test(msg) ? fail(e, 400) : fail(e);
  }
}
