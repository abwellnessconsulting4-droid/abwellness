import ConnectionString from "mongodb-connection-string-url";

/**
 * The seed writes fake patients, claims, and accounts. It must never touch a
 * production database. Allowed targets:
 *   - a local MongoDB (localhost / 127.0.0.1 / ::1), or
 *   - a remote database only with --allow-remote AND a database name that
 *     says it isn't production (dev, test, staging, sandbox, demo) AND
 *     nothing in the host or name says "prod".
 * Production environments are refused outright.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const NON_PROD_NAME = /(^|[-_])(dev|development|test|testing|staging|sandbox|demo|local)([-_]|$)/i;

export class UnsafeSeedTargetError extends Error {}

export interface SeedTarget {
  hosts: string[];
  dbName: string;
  local: boolean;
}

export function describeTarget(uri: string): SeedTarget {
  const cs = new ConnectionString(uri);
  const hosts = cs.hosts.map((h) => h.replace(/:\d+$/, ""));
  const dbName = decodeURIComponent(cs.pathname.replace(/^\//, "")) || "test";
  return { hosts, dbName, local: hosts.every((h) => LOCAL_HOSTS.has(h)) };
}

export function assertSafeSeedTarget(uri: string, options: { allowRemote?: boolean; env?: NodeJS.ProcessEnv } = {}): SeedTarget {
  const env = options.env ?? process.env;
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production" || env.SITE_MODE === "live") {
    throw new UnsafeSeedTargetError("Refusing to seed: this looks like a production environment.");
  }

  const target = describeTarget(uri);
  if (target.local) return target;

  const looksProd = /prod/i.test(target.dbName) || target.hosts.some((h) => /prod/i.test(h));
  if (!options.allowRemote || looksProd || !NON_PROD_NAME.test(target.dbName)) {
    throw new UnsafeSeedTargetError(
      `Refusing to seed remote database "${target.dbName}" on ${target.hosts.join(", ")}. ` +
        "Use a local MongoDB, or pass --allow-remote with a database named for development (e.g. abwellness_dev).",
    );
  }
  return target;
}
