#!/usr/bin/env node
import { startServer } from "./server/app.js";

const port = process.env.PORT || 8000;
startServer(port);
