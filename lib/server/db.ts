import "server-only";
import { neon } from "@neondatabase/serverless";
import type { Db } from "./repo";
import { SCHEMA } from "./schema";

let cached: Promise<Db> | null = null;

/** Database client; creates the tables on first use (idempotent). */
export function getDb(): Promise<Db> {
  if (cached) return cached;
  cached = (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL");
    const sql = neon(url);
    const db: Db = {
      query: (text, params) => sql.query(text, params) as Promise<Record<string, unknown>[]>,
      transaction: async (qs) => {
        await sql.transaction(qs.map((q) => sql.query(q.text, q.params)));
      },
    };
    for (const stmt of SCHEMA) await sql.query(stmt);
    return db;
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}
