import { fileURLToPath } from "node:url";

import { NoLogger } from "../../../../src/logger";

export const modulePath = fileURLToPath(import.meta.url);

export default new NoLogger();
