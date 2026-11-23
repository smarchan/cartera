import "server-only";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** userId of the signed-in user, or a 401 response. Never trust a user id sent by the client. */
export async function requireUser(): Promise<string | NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  return userId;
}

export function fail(e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : "Error inesperado";
  if (status >= 500) console.error(e);
  return NextResponse.json({ error: status >= 500 ? "No se pudo guardar. Inténtalo de nuevo." : msg }, { status });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
