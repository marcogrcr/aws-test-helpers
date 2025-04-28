import {
  Command,
  InvalidArgumentError,
  type OptionValues,
  program,
} from "commander";
import type { z, ZodType } from "zod";

import { loadModule } from "./modules";
import { CONFIG_OPTION_FLAGS } from "./options";

/**
 * Provides a `commander` argument parser.
 * @param value The value to parse.
 * @param schema The schema to parse the argument with.
 * @param errorMsg An error message to display if the argument is invalid.
 */
export function argParser(value: unknown, schema: ZodType, errorMsg?: string) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new InvalidArgumentError(errorMsg ?? result.error.message);
  }

  return result.data;
}

/**
 * Parse the options of {@link Command} using a schema.
 * Dynamically loads the option values from a `.json` file if `configFile` option is present.
 * @param command The command to parse the options from.
 * @param schema The schema to parse the options with.
 */
export async function parseOptions<T extends ZodType>(
  command: Command,
  schema: T,
): Promise<z.infer<T>> {
  const rawOptions: OptionValues = command.optsWithGlobals();

  // use config file if specified
  if ("configFile" in rawOptions) {
    const config = await loadModule(
      CONFIG_OPTION_FLAGS,
      rawOptions.configFile,
      "json",
    );
    const r = schema.safeParse(config);
    if (!r.success) {
      program.error(
        `error: option '${CONFIG_OPTION_FLAGS}' argument '${rawOptions.configFile}' is invalid. ${r.error}`,
      );
    }
    return r.data;
  }

  // otherwise use arguments
  const r = schema.safeParse(rawOptions);
  if (!r.success) {
    program.error(
      `error: you must specify ${CONFIG_OPTION_FLAGS} or all the required options.`,
    );
  }
  return r.data;
}
