/**
 * Creates or updates a DGL admin: `npm run dgl:admin -- --name "Sai" --role SUPER_ADMIN`.
 * Prompts for the passcode with hidden input, then upserts by name (and
 * re-activates the row). Reads DATABASE_URL from .env; prints neither it nor
 * the passcode.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPasscode } from "../src/lib/dgl/auth";
import { ensureSchema, neonDb } from "../src/lib/dgl/db";
import type { Role } from "../src/lib/dgl/types";

const ROLES: Role[] = ["SUPER_ADMIN", "OPERATOR", "HOST", "VOLUNTEER"];
const USAGE = `Usage: npm run dgl:admin -- --name "<name>" --role <${ROLES.join("|")}>`;

export function parseArgs(argv: string[]): { name: string; role: Role } | { error: string } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const name = get("--name")?.trim();
  const role = get("--role");
  if (!name) return { error: "Missing --name." };
  if (!role) return { error: "Missing --role." };
  if (!ROLES.includes(role as Role)) return { error: `Unknown role "${role}".` };
  return { name, role: role as Role };
}

/** Reads one line from the terminal without echoing it. */
function askHidden(prompt: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: !!process.stdin.isTTY });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(`${args.error}\n${USAGE}`);
    process.exit(1);
  }
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: DATABASE_URL may already be in the environment.
  }
  const db = neonDb();
  if (!db) {
    console.error("DATABASE_URL is not set. Add it to .env or the environment.");
    process.exit(1);
  }

  const pass = await askHidden("Passcode: ");
  if (pass.length < 6) {
    console.error("Passcode must be at least 6 characters.");
    process.exit(1);
  }
  const again = await askHidden("Repeat passcode: ");
  if (again !== pass) {
    console.error("Passcodes do not match.");
    process.exit(1);
  }

  await ensureSchema(db);
  const hash = await hashPasscode(pass);
  await db.query(
    `INSERT INTO dgl_admins (name, role, passcode_hash) VALUES ($1::text, $2::text, $3::text)
     ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role, passcode_hash = EXCLUDED.passcode_hash, active = true`,
    [args.name, args.role, hash],
  );
  console.log(`Saved admin "${args.name}" as ${args.role}.`);
}

// Only run when executed directly, so parseArgs stays importable.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : "Failed.");
    process.exit(1);
  });
}
