import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
  );
  process.exit(1);
}

const DEFAULT_EMAIL = "admin@caab.org.br";
const DEFAULT_PASSWORD = "caab2026!";

async function seed() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Creating initial superuser...");

  const { data, error } = await supabase.auth.admin.createUser({
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    app_metadata: {
      role: "superuser",
      is_active: true,
    },
  });

  if (error) {
    if (error.message.includes("already been registered")) {
      console.log("Superuser already exists — skipping");
      return;
    }
    console.error("Failed to create superuser:", error.message);
    process.exit(1);
  }

  console.log("Superuser created successfully:");
  console.log(`  Email:    ${DEFAULT_EMAIL}`);
  console.log(`  Password: ${DEFAULT_PASSWORD}`);
  console.log(`  ID:       ${data.user.id}`);
  console.log("\n  Change the password after first login!");
}

seed();
