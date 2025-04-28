import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Handler } from "aws-lambda";
import { program } from "commander";
import type { z } from "zod";

import { ConsoleLogger, type Logger } from "../../../logger";
import {
  type GLOBAL_OPTIONS_SCHEMA,
  HANDLER_MODULE_OPTION_FLAGS,
  LOGGER_MODULE_OPTION_FLAGS,
} from "./options";

/**
 * Dynamically loads a module associated with a `commander` option flag.
 * @param optionFlags The `commander` option flags associated with the module path.
 * @param modulePath The module path.
 * @param type The type of the module. Affects how the module is loaded.
 */
export async function loadModule(
  optionFlags: string,
  modulePath: string,
  type: "import" | "json" = "import",
): Promise<Record<string, unknown>> {
  try {
    const resolvedPath = path.resolve(modulePath);
    return type === "import"
      ? await import(resolvedPath)
      : JSON.parse((await readFile(resolvedPath)).toString());
  } catch (error) {
    program.error(
      `error: option '${optionFlags}' argument '${modulePath}' is invalid. ${error}`,
    );
  }
}

export type LoadModulesInput = Pick<
  z.infer<typeof GLOBAL_OPTIONS_SCHEMA>,
  "handlerModule" | "loggerModule"
>;
export interface LoadModulesOutput<T extends Handler> {
  readonly handler: T;
  readonly logger: Logger;
}
/** Dynamically loads the Lambda handler and logger modules. */
export async function loadModules<T extends Handler>(
  input: LoadModulesInput,
): Promise<LoadModulesOutput<T>> {
  const { handlerModule, loggerModule } = input;

  // dynamically load Lambda handler
  const { handler } = await loadModule(
    HANDLER_MODULE_OPTION_FLAGS,
    handlerModule,
  );
  if (typeof handler !== "function") {
    program.error(
      `error: option '${HANDLER_MODULE_OPTION_FLAGS}' argument '${handlerModule}' is invalid. The module does not export a function named 'handler'.`,
    );
  }

  // dynamically load logger
  let logger: Logger = new ConsoleLogger();
  if (loggerModule) {
    const module = await loadModule(LOGGER_MODULE_OPTION_FLAGS, loggerModule);
    if (!isLogger(module.default)) {
      program.error(
        `error: option: '${LOGGER_MODULE_OPTION_FLAGS}' argument '${loggerModule}' is invalid. The module default export is not a Logger instance.`,
      );
    }
    logger = module.default;
  }

  return {
    handler: handler as T,
    logger,
  };
}

function isLogger(value: unknown): value is Logger {
  const levels: (keyof Logger)[] = [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "critical",
  ];

  return levels.every(
    (level) =>
      typeof (value as Record<string, unknown>)?.[level] === "function",
  );
}
