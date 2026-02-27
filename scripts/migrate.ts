import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

async function migrate() {
  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log("Connected to database");

    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Get already applied migrations
    const { rows: applied } = await client.query(
      "SELECT name FROM _migrations ORDER BY name",
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    // Read migration files
    const migrationsDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
      "..",
      "supabase",
      "migrations",
    );
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`SKIP: ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      console.log(`APPLYING: ${file}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        console.log(`OK: ${file}`);
        count++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log(
      count > 0
        ? `Done — ${count} migration(s) applied`
        : "No new migrations to apply",
    );
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
