import { describe, expect, it } from "vitest";
import { buildSignature, verifySignature } from "@/lib/signatures";
import { parseIcd10Line } from "@/scripts/import-icd10";
import { assertSafeSeedTarget, UnsafeSeedTargetError } from "@/scripts/seed/guard";

const dev = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

describe("seed guard", () => {
  it("allows local databases", () => {
    expect(assertSafeSeedTarget("mongodb://127.0.0.1:27017/abwellness", { env: dev }).local).toBe(true);
    expect(assertSafeSeedTarget("mongodb://localhost/abw?replicaSet=rs0", { env: dev }).dbName).toBe("abw");
  });

  it("refuses remote databases by default, and production-looking ones always", () => {
    const remote = "mongodb+srv://user:pass@cluster0.abcde.mongodb.net/abwellness?retryWrites=true";
    expect(() => assertSafeSeedTarget(remote, { env: dev })).toThrow(UnsafeSeedTargetError);
    expect(() => assertSafeSeedTarget(remote, { env: dev, allowRemote: true })).toThrow(/named for development/);
    expect(() => assertSafeSeedTarget("mongodb+srv://u:p@prod-cluster.mongodb.net/abwellness_dev", { env: dev, allowRemote: true })).toThrow();
    expect(assertSafeSeedTarget("mongodb+srv://u:p@cluster0.abcde.mongodb.net/abwellness_dev", { env: dev, allowRemote: true }).dbName).toBe("abwellness_dev");
  });

  it("refuses production environments even for local targets", () => {
    expect(() => assertSafeSeedTarget("mongodb://127.0.0.1/abw", { env: { NODE_ENV: "production" } as NodeJS.ProcessEnv })).toThrow(/production/);
    expect(() => assertSafeSeedTarget("mongodb://127.0.0.1/abw", { env: { ...dev, VERCEL_ENV: "production" } })).toThrow();
  });
});

describe("signatures", () => {
  it("verify only the exact content, signer, IP, and time", () => {
    const signature = buildSignature({ content: "I agree.", signerId: "u1", signerName: "Elena Vance", signerRole: "PATIENT", ipAddress: "203.0.113.44", method: "TYPED" });
    expect(verifySignature("I agree.", signature)).toBe(true);
    expect(verifySignature("I agree!", signature)).toBe(false);
    expect(verifySignature("I agree.", { ...signature, ipAddress: "203.0.113.45" })).toBe(false);
    expect(verifySignature("I agree.", { ...signature, signerId: "u2" })).toBe(false);
  });
});

describe("ICD-10-CM import parsing", () => {
  it("adds the dot and keeps the description", () => {
    expect(parseIcd10Line("F411    Generalized anxiety disorder")).toEqual({ code: "F41.1", description: "Generalized anxiety disorder" });
    expect(parseIcd10Line("Z730    Burn-out")).toEqual({ code: "Z73.0", description: "Burn-out" });
    expect(parseIcd10Line("A000    Cholera due to Vibrio cholerae 01, biovar cholerae")?.code).toBe("A00.0");
    expect(parseIcd10Line("")).toBeNull();
  });
});
