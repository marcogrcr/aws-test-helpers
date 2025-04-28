import { program } from "commander";
import { z } from "zod";

export const CONFIG_OPTION_FLAGS = "-c, --config-file <config-file>";
export const ENDPOINT_OPTION_FLAGS = "-e, --endpoint <url>";
export const HANDLER_MODULE_OPTION_FLAGS = "-h, --handler-module <module-path>";
export const LOGGER_MODULE_OPTION_FLAGS = "-l, --logger-module [module-path]";
export const TIMEOUT_OPTION_FLAGS = "-t, --timeout <seconds>";

export interface ConfigFileOptions {
  readonly configFile: string;
}

export const INTEGER_STRING = z.string().regex(/^\d+$/);
export const POSITIVE_INTEGER = z.number().int().min(1);

/** The schema of the global options. */
export const GLOBAL_OPTIONS_SCHEMA = z
  .object({
    endpoint: z
      .string()
      .transform((v) => resolveOptionValue(ENDPOINT_OPTION_FLAGS, v))
      .pipe(z.string().url()),
    handlerModule: z
      .string()
      .transform((v) => resolveOptionValue(HANDLER_MODULE_OPTION_FLAGS, v)),
    loggerModule: z
      .string()
      .transform((v) => resolveOptionValue(LOGGER_MODULE_OPTION_FLAGS, v))
      .optional(),
    timeout: z.union([
      z
        .union([
          z
            .string()
            .transform((v) => resolveOptionValue(TIMEOUT_OPTION_FLAGS, v)),
          INTEGER_STRING,
        ])
        .transform((v) => parseInt(v))
        .pipe(POSITIVE_INTEGER),
      POSITIVE_INTEGER,
    ]),
  })
  .strict();

/**
 * Resolves an option value using environment variables if the raw value starts with `env:`.
 * @param option The `commander` option flags.
 * @param rawValue The raw value of the option.
 */
export function resolveOptionValue(option: string, rawValue: string): string {
  if (!rawValue.startsWith("env:")) {
    return rawValue;
  }

  const varName = rawValue.substring(4);
  const result = process.env[varName];
  if (!result) {
    program.error(
      `error: option '${option}' argument '${rawValue}' is invalid. No environment variable found with name '${varName}'.`,
    );
  }

  return result;
}
