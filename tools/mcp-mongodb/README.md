MongoDB MCP Server

This is a minimal Model Context Protocol (MCP) server exposing MongoDB via stdio.

Provided tools (read-only by default):

- mongo_list_databases: List available databases.
- mongo_list_collections: List collections in a database.
- mongo_find: Query documents with filter/projection/sort/limit.
- mongo_aggregate: Run an aggregation pipeline.

Optional write tools (opt‑in via env `MONGO_MCP_ALLOW_WRITES=true`):

- mongo_insert_one, mongo_update_one, mongo_delete_one

Environment

- MONGO_CONNECTION_STRING: MongoDB connection string (same as backend).
- MONGO_MCP_ALLOW_WRITES: Set to `true` to enable write tools. Default `false`.

Run locally

```
export MONGO_CONNECTION_STRING="<your-uri>"
node tools/mcp-mongodb/index.js
```

Claude Desktop config example (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`

```
{
  "mcpServers": {
    "mongodb": {
      "command": "node",
      "args": ["/absolute/path/to/AIStudyBuddy/tools/mcp-mongodb/index.js"],
      "env": {
        "MONGO_CONNECTION_STRING": "<your-uri>",
        "MONGO_MCP_ALLOW_WRITES": "false"
      }
    }
  }
}
```

