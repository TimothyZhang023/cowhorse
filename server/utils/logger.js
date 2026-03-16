import pino from "pino";
import os from "os";
import path from "path";
import fs from "fs";

const logDir = path.join(os.homedir(), ".workhorse", "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const isDev = process.env.NODE_ENV !== "production" && !process.pkg;

const transport = pino.transport({
  targets: [
    {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
        singleLine: true,
        sync: true,
      },
      level: "info",
    },
    {
      target: "pino/file",
      options: { destination: path.join(logDir, "gateway.log") },
      level: "info",
    },
  ],
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  transport
);
