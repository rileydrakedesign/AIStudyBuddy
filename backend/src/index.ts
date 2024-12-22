// server.ts

import fs from "fs";
import https from "https";
import path from "path";
import app from "./app.js";
import { connectToDatabase } from "./db/connection.js";

// Absolute paths to your certificate and key files
const CERT_PATH = "/Users/rileydrake/Desktop/AIStudyBuddy/localhost.pem";
const KEY_PATH = "/Users/rileydrake/Desktop/AIStudyBuddy/localhost-key.pem";

// Verify that the certificate and key files exist
if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
  console.error("SSL certificate or key file not found. Please ensure 'localhost.pem' and 'localhost-key.pem' exist at the specified paths.");
  process.exit(1); // Exit the process with an error code
}

// Read the certificate and private key
const key = fs.readFileSync(KEY_PATH);
const cert = fs.readFileSync(CERT_PATH);

// Create HTTPS server
const httpsServer = https.createServer({ key, cert }, app);

// Choose a port, e.g., 3000
const PORT = process.env.PORT || 3000;

// Connect to the database and start the HTTPS server
connectToDatabase()
  .then(() => {
    httpsServer.listen(PORT, () => {
      console.log(`HTTPS server is running at https://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err);
    process.exit(1); // Exit the process with an error code
  });
