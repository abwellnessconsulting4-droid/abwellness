// Fixed, test-only keys. Never reuse outside tests.
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.ENCRYPTION_KEY_ID = "test1";
process.env.BLIND_INDEX_KEY = Buffer.alloc(32, 9).toString("base64");
