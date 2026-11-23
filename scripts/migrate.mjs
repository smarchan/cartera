// Applies db/migrations/*.sql in order. Usage: DATABASE_URL=... npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
const sql = neon(url);
const dir = new URL("../db/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const text = await readFile(new URL(f, dir), "utf8");
  for (const stmt of text.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await sql.query(stmt);
  }
  console.log("aplicada", f);
}
