#!/usr/bin/env node
import { startServer } from "./server/app.js";

const port = process.env.PORT || 12621;
const server = startServer(port);

function shutdown() {
  console.log("Shutting down backend sidecar gracefully...");
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
