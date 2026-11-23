import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { deleteTx, upsertTx } from "@/lib/server/repo";
import { fail, readJson, requireUser } from "@/lib/server/session";
import { validateTx } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  const r = validateTx(await readJson(req));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  try {
    await upsertTx(await getDb(), userId, r.tx);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id || id.length > 64) return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  try {
    await deleteTx(await getDb(), userId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
