import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage for documents. Callers always pass bytes that are already
 * encrypted (lib/crypto.ts encryptBytes), so the provider only ever holds
 * ciphertext. Keys are "<patientId>/<documentId>": never file names.
 *
 * VERCEL_BLOB: a *private* Blob store (vercel blob create-store <name>
 * --access private). On Vercel the connected store authenticates with OIDC;
 * locally set BLOB_READ_WRITE_TOKEN. Requires Vercel's BAA before real PHI.
 *
 * LOCAL: .data/uploads on disk, for development and tests. Refused on Vercel,
 * where the filesystem isn't persistent.
 */

export interface StoredObject {
  provider: "LOCAL" | "VERCEL_BLOB";
  key: string;
}

export interface ObjectStorage {
  readonly provider: StoredObject["provider"];
  put(key: string, bytes: Buffer): Promise<void>;
  /** Null when the object doesn't exist. */
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-f0-9]{24}\/[a-f0-9]{24}$/;
function checkKey(key: string) {
  if (!SAFE_KEY.test(key)) throw new Error("Invalid storage key.");
}

function localStorage(): ObjectStorage {
  // Development-only paths: keep them out of build tracing (they never run on Vercel).
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_STORAGE_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "uploads"));
  const file = (key: string) => {
    checkKey(key);
    return path.join(/*turbopackIgnore: true*/ root, ...key.split("/"));
  };
  return {
    provider: "LOCAL",
    async put(key, bytes) {
      await mkdir(path.dirname(/*turbopackIgnore: true*/ file(key)), { recursive: true });
      await writeFile(file(key), bytes, { mode: 0o600 });
    },
    async get(key) {
      try {
        return await readFile(file(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async remove(key) {
      await rm(file(key), { force: true });
    },
  };
}

function blobStorage(): ObjectStorage {
  const pathname = (key: string) => {
    checkKey(key);
    return `documents/${key}.bin`;
  };
  return {
    provider: "VERCEL_BLOB",
    async put(key, bytes) {
      const { put } = await import("@vercel/blob");
      await put(pathname(key), bytes, { access: "private", contentType: "application/octet-stream", addRandomSuffix: false, allowOverwrite: false });
    },
    async get(key) {
      const { get } = await import("@vercel/blob");
      const result = await get(pathname(key), { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    },
    async remove(key) {
      const { del } = await import("@vercel/blob");
      await del(pathname(key));
    },
  };
}

export function objectStorage(): ObjectStorage {
  const configured = process.env.STORAGE_PROVIDER?.toLowerCase();
  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
  if (configured === "vercel-blob" || (!configured && blobConfigured)) return blobStorage();
  if (process.env.VERCEL) throw new Error("No document storage configured: connect a private Vercel Blob store (see lib/storage.ts).");
  return localStorage();
}

/** Look up the adapter that holds an existing object. */
export function storageFor(provider: string): ObjectStorage {
  if (provider === "VERCEL_BLOB") return blobStorage();
  if (provider === "LOCAL") return localStorage();
  throw new Error(`Unsupported storage provider "${provider}".`);
}
