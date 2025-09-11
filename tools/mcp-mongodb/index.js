#!/usr/bin/env node
"use strict";

// Minimal MCP server for MongoDB over stdio.
// Exposes tools to list DBs/collections and perform simple queries.

const { MongoClient } = require("mongodb");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

// Load env for least-friction usage: prefer process.env, but also try backend/.env then local .env
(() => {
  if (!process.env.MONGO_CONNECTION_STRING && !process.env.MONGODB_URI && !process.env.MONGO_URL) {
    const backendEnv = path.resolve(__dirname, "../../backend/.env");
    if (fs.existsSync(backendEnv)) {
      dotenv.config({ path: backendEnv });
    }
  }
  // Allow using a local .env next to the server as an override if present
  const localEnv = path.resolve(__dirname, ".env");
  if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv, override: true });
  }
})();

// Read connection string from env after potential .env loads
const MONGO_URI = process.env.MONGO_CONNECTION_STRING || process.env.MONGODB_URI || process.env.MONGO_URL || "";

let client; // MongoClient instance (lazy)

async function getClient() {
  if (!client) {
    if (!MONGO_URI) {
      const err = new Error(
        "Missing Mongo connection string. Set MONGO_CONNECTION_STRING (or MONGODB_URI/MONGO_URL)."
      );
      err.code = "MISSING_MONGO_URI";
      throw err;
    }
    client = new MongoClient(MONGO_URI, { maxPoolSize: 10 });
  }
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  return client;
}

function jsonContent(obj) {
  return { content: [{ type: "json", json: obj }] };
}

function textContent(text) {
  return { content: [{ type: "text", text }] };
}

// Optional one-off self test mode (no MCP). Usage: `node index.js --self-test`
if (process.argv.includes("--self-test")) {
  (async () => {
    try {
      const c = await getClient();
      const { databases } = await c.db().admin().listDatabases();

      // Optionally run a write cycle to verify permissions
      const allowWrites = String(process.env.MONGO_MCP_ALLOW_WRITES || "false").toLowerCase() === "true";
      let writeResult = undefined;
      if (allowWrites) {
        const { randomUUID } = require("crypto");
        const dbName = databases.find(d => d.name === "test") ? "test" : (databases[0]?.name || "test");
        const col = c.db(dbName).collection("mcp_self_test");
        const nonce = randomUUID();
        const insert = await col.insertOne({ _marker: "mongodb-mcp", nonce, ts: new Date().toISOString() });
        const update = await col.updateOne({ _id: insert.insertedId }, { $set: { updated: true } });
        const del = await col.deleteOne({ _id: insert.insertedId });
        writeResult = {
          database: dbName,
          collection: "mcp_self_test",
          insertedId: insert.insertedId,
          matchedCount: update.matchedCount,
          modifiedCount: update.modifiedCount,
          deletedCount: del.deletedCount,
        };
      }

      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ ok: true, databases: databases.map((d) => d.name), writeTest: writeResult }));
      await c.close();
      process.exit(0);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }));
      process.exit(1);
    }
  })();
  return;
}

const server = new McpServer({ name: "mongodb-mcp", version: "0.1.0" }, {
  capabilities: {
    tools: {},
  },
  instructions: "MongoDB MCP server. Configure MONGO_CONNECTION_STRING; use tools to query.",
});

const ALLOW_WRITES = String(process.env.MONGO_MCP_ALLOW_WRITES || "false").toLowerCase() === "true";

// list_databases
server.tool(
  "mongo_list_databases",
  {
    description: "List databases on the MongoDB server",
  },
  async () => {
    const c = await getClient();
    const admin = c.db().admin();
    const { databases } = await admin.listDatabases();
    return jsonContent(databases.map((d) => ({ name: d.name, sizeOnDisk: d.sizeOnDisk, empty: d.empty })));
  }
);

// list_collections
server.tool(
  "mongo_list_collections",
  {
    description: "List collections within a database",
    db: z.string().describe("Database name"),
  },
  async ({ db }) => {
    const c = await getClient();
    const cols = await c.db(db).listCollections().toArray();
    return jsonContent(cols.map((c) => ({ name: c.name, type: c.type })));
  }
);

// find documents
server.tool(
  "mongo_find",
  {
    description: "Find documents in a collection with an optional filter and projection",
    db: z.string().describe("Database name"),
    collection: z.string().describe("Collection name"),
    filter: z
      .any()
      .optional()
      .describe("Filter object (JSON). Example: { userId: '123' }"),
    projection: z
      .any()
      .optional()
      .describe("Projection object (JSON). Example: { _id: 0, name: 1 }"),
    sort: z.any().optional().describe("Sort object (JSON). Example: { createdAt: -1 }"),
    limit: z.number().int().positive().max(5000).optional().describe("Max documents to return (default 100)"),
  },
  async ({ db, collection, filter, projection, sort, limit }) => {
    const c = await getClient();
    const col = c.db(db).collection(collection);
    let cursor = col.find(filter || {});
    if (projection) cursor = cursor.project(projection);
    if (sort) cursor = cursor.sort(sort);
    cursor = cursor.limit(limit || 100);
    const docs = await cursor.toArray();
    return jsonContent(docs);
  }
);

if (ALLOW_WRITES) {
  // insert one
  server.tool(
    "mongo_insert_one",
    {
      description: "Insert a single document",
      db: z.string().describe("Database name"),
      collection: z.string().describe("Collection name"),
      document: z.any().describe("Document to insert (JSON object)"),
    },
    async ({ db, collection, document }) => {
      const c = await getClient();
      const res = await c.db(db).collection(collection).insertOne(document);
      return jsonContent({ insertedId: res.insertedId });
    }
  );

  // update one
  server.tool(
    "mongo_update_one",
    {
      description: "Update a single document matching filter",
      db: z.string().describe("Database name"),
      collection: z.string().describe("Collection name"),
      filter: z.any().describe("Filter object (JSON)"),
      update: z.any().describe("Update operators (e.g., { $set: {...} })"),
      upsert: z.boolean().optional().describe("Create if not found (default false)"),
    },
    async ({ db, collection, filter, update, upsert }) => {
      const c = await getClient();
      const res = await c
        .db(db)
        .collection(collection)
        .updateOne(filter, update, { upsert: !!upsert });
      return jsonContent({ matchedCount: res.matchedCount, modifiedCount: res.modifiedCount, upsertedId: res.upsertedId });
    }
  );

  // delete one
  server.tool(
    "mongo_delete_one",
    {
      description: "Delete a single document matching filter",
      db: z.string().describe("Database name"),
      collection: z.string().describe("Collection name"),
      filter: z.any().describe("Filter object (JSON)"),
    },
    async ({ db, collection, filter }) => {
      const c = await getClient();
      const res = await c.db(db).collection(collection).deleteOne(filter);
      return jsonContent({ deletedCount: res.deletedCount });
    }
  );
}

// aggregate
server.tool(
  "mongo_aggregate",
  {
    description: "Run an aggregation pipeline",
    db: z.string().describe("Database name"),
    collection: z.string().describe("Collection name"),
    pipeline: z.array(z.any()).nonempty().describe("Aggregation pipeline array"),
    allowDiskUse: z.boolean().optional().describe("Allow disk use (default false)"),
  },
  async ({ db, collection, pipeline, allowDiskUse }) => {
    const c = await getClient();
    const cursor = c
      .db(db)
      .collection(collection)
      .aggregate(pipeline, { allowDiskUse: !!allowDiskUse });
    const docs = await cursor.toArray();
    return jsonContent(docs);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error("mongodb-mcp server ready on stdio");
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start mongodb-mcp:", err?.message || err);
  try {
    if (client) await client.close();
  } catch {}
  process.exit(1);
});
