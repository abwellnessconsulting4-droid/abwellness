import { existsSync } from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * One single-node replica set for the whole run (transactions and the audit
 * chain need a replica set). Uses a local mongod when available, otherwise
 * mongodb-memory-server downloads one (CI).
 */
const LOCAL_MONGOD = ["/opt/homebrew/bin/mongod", "/usr/local/bin/mongod", "/usr/bin/mongod"].find(existsSync);

let replSet: MongoMemoryReplSet | undefined;

export async function setup() {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    binary: LOCAL_MONGOD ? { systemBinary: LOCAL_MONGOD } : undefined,
  });
  process.env.MONGO_TEST_URI = replSet.getUri();
}

export async function teardown() {
  await replSet?.stop();
}
