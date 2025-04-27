import { fileURLToPath } from "node:url";

export const modulePath = fileURLToPath(import.meta.url);

export default {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  // missing: critical() {},
};
