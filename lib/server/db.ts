import "server-only";
import { neon } from "@neondatabase/serverless";
import type { Db } from "./repo";

let cached: Db | null = null;

export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const sql = neon(url);
  cached = {
    query: (text, params) => sql.query(text, params) as Promise<Record<string, unknown>[]>,
    transaction: async (qs) => {
      await sql.transaction(qs.map((q) => sql.query(q.text, q.params)));
    },
  };
  return cached;
}
