#!/usr/bin/env tsx
import "dotenv/config";

import { runLambda } from "./cli";

await runLambda(process.argv);
