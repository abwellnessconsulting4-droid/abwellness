/**
 * Seed a development database with the EMR use-case dataset.
 *
 *   npm run seed:emr                  # local MongoDB from .env.local
 *   npm run seed:emr -- --reset       # wipe EMR data + seeded accounts first
 *   npm run seed:emr -- --allow-remote  # remote *dev/staging* database (name must say so)
 *
 * Accounts share one password: SEED_PASSWORD if set, otherwise a random one
 * printed once at the end. Every account must enroll in MFA at first sign-in.
 */
import { existsSync, writeFileSync } from "node:fs";
import mongoose from "mongoose";
import { assertSafeSeedTarget, UnsafeSeedTargetError } from "./seed/guard";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const args = new Set(process.argv.slice(2));
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (add it to .env.local).");
  for (const name of ["ENCRYPTION_KEY", "BETTER_AUTH_SECRET"]) {
    if (!process.env[name]) throw new Error(`${name} is not set. Generate one with: openssl rand -base64 32`);
  }

  const target = assertSafeSeedTarget(uri, { allowRemote: args.has("--allow-remote") });
  console.log(`Seeding ${target.local ? "local" : "remote"} database "${target.dbName}" on ${target.hosts.join(", ")}`);

  await mongoose.connect(uri);
  // Import after env is loaded (lib/auth reads it lazily, models register on import).
  const { isSeeded, resetEmrData, seedEmr, SEED_USERS } = await import("./seed/emr");

  if (args.has("--reset")) {
    await resetEmrData();
    console.log("Removed existing EMR data and seeded accounts.");
  } else if (await isSeeded()) {
    throw new Error("This database is already seeded. Re-run with --reset to start over.");
  }

  const { password, counts } = await seedEmr({ password: process.env.SEED_PASSWORD });

  console.log("\nCreated:");
  for (const [model, count] of Object.entries(counts).filter(([, c]) => c > 0).sort()) {
    console.log(`  ${model.padEnd(20)} ${count}`);
  }
  console.log("\nAccounts (all must enroll in MFA at first sign-in):");
  for (const user of SEED_USERS) console.log(`  ${user.role.padEnd(14)} ${user.email.padEnd(28)} ${user.name}`);
  if (!process.env.SEED_PASSWORD) console.log(`\nShared password: ${password}`);

  writeCredentialsFile(SEED_USERS, password, target.dbName);
  console.log(`\nSaved sign-in details to ${CREDENTIALS_FILE} (git-ignored; never commit it).`);
}

const CREDENTIALS_FILE = "seed-accounts.local.md";

/** Local, git-ignored record of the development accounts (rewritten on every seed). */
function writeCredentialsFile(users: { role: string; email: string; name: string }[], password: string, dbName: string) {
  const rows = users.map((u) => `| ${u.role} | ${u.email} | ${u.name} |`).join("\n");
  const content = `# Development sign-in accounts

> Local only. This file is git-ignored: never commit it or share it. These accounts exist only in
> your development database ("${dbName}") and hold fictitious data.

Seeded: ${new Date().toISOString()}

**Shared password:** \`${password}\`

| Role | Email | Name |
|---|---|---|
${rows}

Every account must set up two-step login (authenticator app or emailed code) at first sign-in.

To keep this password across re-seeds, set \`SEED_PASSWORD\` in \`.env.local\`, then run
\`npm run seed:emr -- --reset\`. Without it, each seed generates a new password and rewrites this file.
`;
  writeFileSync(CREDENTIALS_FILE, content, { mode: 0o600 });
}

main()
  .catch((error) => {
    console.error(error instanceof UnsafeSeedTargetError ? `\n${error.message}\n` : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { closeAuth } = await import("@/lib/auth");
    await Promise.all([closeAuth(), mongoose.disconnect()]);
  });
