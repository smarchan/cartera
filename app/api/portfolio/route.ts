import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { getPortfolio } from "@/lib/server/repo";
import { fail, requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  try {
    return NextResponse.json(await getPortfolio(await getDb(), userId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return fail(e);
  }
}
