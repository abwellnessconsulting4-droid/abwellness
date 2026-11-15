/**
 * Import the full ICD-10-CM code set (about 74,000 codes) into MedicalCode.
 *
 * 1. Download the current "Code Descriptions in Tabular Order" ZIP from CMS:
 *    https://www.cms.gov/medicare/coding-billing/icd-10-codes
 * 2. Unzip it and point this script at icd10cm-codes-<year>.txt:
 *
 *    npm run import:icd10 -- ./icd10cm-codes-2027.txt
 *
 * Each line is "<code without dot> <description>". Codes are stored with the
 * dot (F411 -> F41.1). Existing codes are updated; nothing is deleted.
 * ICD-10-CM is public domain. (CPT is AMA-licensed and is NOT imported here.)
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import mongoose from "mongoose";

function withDot(code: string) {
  return code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code;
}

export function parseIcd10Line(line: string): { code: string; description: string } | null {
  const match = line.match(/^([A-Z][0-9][0-9A-Z]{1,5})\s+(.+)$/);
  return match ? { code: withDot(match[1]), description: match[2].trim() } : null;
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const file = process.argv[2];
  if (!file || !existsSync(file)) throw new Error("Usage: npm run import:icd10 -- <path to icd10cm-codes-YYYY.txt>");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set.");

  await mongoose.connect(process.env.MONGODB_URI);
  const { MedicalCode } = await import("@/models/billing");

  let batch: Parameters<typeof MedicalCode.bulkWrite>[0] = [];
  let total = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    await MedicalCode.bulkWrite(batch, { ordered: false });
    total += batch.length;
    batch = [];
    process.stdout.write(`\r  ${total.toLocaleString()} codes`);
  };

  for await (const line of createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity })) {
    const parsed = parseIcd10Line(line);
    if (!parsed) continue;
    batch.push({
      updateOne: {
        filter: { system: "ICD10CM", code: parsed.code },
        update: { $set: { description: parsed.description, active: true }, $setOnInsert: { system: "ICD10CM", code: parsed.code, defaultFeeCents: 0 } },
        upsert: true,
      },
    });
    if (batch.length >= 2000) await flush();
  }
  await flush();
  console.log(`\nImported ${total.toLocaleString()} ICD-10-CM codes.`);
}

if (process.argv[1]?.endsWith("import-icd10.ts")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
