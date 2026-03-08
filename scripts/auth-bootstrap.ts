import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.BOOTSTRAP_SUPERUSER_EMAIL;
const PASSWORD = process.env.BOOTSTRAP_SUPERUSER_PASSWORD;

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

if (!EMAIL || !PASSWORD) {
  fail(
    "BOOTSTRAP_SUPERUSER_EMAIL and BOOTSTRAP_SUPERUSER_PASSWORD are required",
  );
}

async function bootstrap() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Creating production superuser: ${EMAIL}`);

  const { data, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
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

    fail(`Failed to create superuser: ${error.message}`);
  }

  console.log("Superuser created successfully:");
  console.log(`  Email: ${EMAIL}`);
  console.log(`  ID:    ${data.user.id}`);
  console.log("  Password not echoed; store it securely.");
}

bootstrap();
