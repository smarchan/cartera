import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "@/lib/server/db";
import { deleteUserData } from "@/lib/server/repo";
import { fail, requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Deletes the user's data, then the account itself. */
export async function DELETE() {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  try {
    await deleteUserData(getDb(), userId);
    await (await clerkClient()).users.deleteUser(userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
