import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { saveSettings } from "@/lib/server/repo";
import { fail, readJson, requireUser } from "@/lib/server/session";
import { validateSettings } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  const r = validateSettings(await readJson(req));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  try {
    await saveSettings(getDb(), userId, r.settings);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
