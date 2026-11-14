import mongoose from "mongoose";
import { afterAll, beforeAll } from "vitest";

/** Connect mongoose to a fresh database for one test file and sync every index. */
export function setupTestDatabase(name: string) {
  const dbName = `abw_test_${name}_${Date.now()}`;
  const baseUri = () => {
    const uri = process.env.MONGO_TEST_URI;
    if (!uri) throw new Error("MONGO_TEST_URI not set; is tests/global-setup.ts configured?");
    return uri;
  };

  beforeAll(async () => {
    await mongoose.connect(baseUri(), { dbName });
    await import("@/models");
    await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  return {
    dbName,
    /** Connection string pointing at this file's database (for non-mongoose clients). */
    uri: () => {
      const url = new URL(baseUri());
      url.pathname = `/${dbName}`;
      return url.toString();
    },
  };
}
