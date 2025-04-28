import { Option, program } from "commander";

import sqs from "./commands/sqs";
import {
  CONFIG_OPTION_FLAGS,
  ENDPOINT_OPTION_FLAGS,
  GLOBAL_OPTIONS_SCHEMA,
  HANDLER_MODULE_OPTION_FLAGS,
  LOGGER_MODULE_OPTION_FLAGS,
  resolveOptionValue,
  TIMEOUT_OPTION_FLAGS,
} from "./util/options";
import { argParser } from "./util/parse-options";

// configure program
program
  .name("run-lambda")
  .description("Invokes a Lambda function handler.")
  .addHelpText(
    "after",
    'Add "env:" prefix to any option value to read it from an environment variable (.env files are supported). For example -q env:QUEUE_NAME',
  )
  .showHelpAfterError()
  .addOption(
    new Option(ENDPOINT_OPTION_FLAGS, "The AWS HTTP endpoint")
      .conflicts("config")
      .argParser((v) =>
        argParser(
          v,
          GLOBAL_OPTIONS_SCHEMA.shape.endpoint,
          "The endpoint must be a URL.",
        ),
      ),
  )
  .addOption(
    new Option(
      HANDLER_MODULE_OPTION_FLAGS,
      "The path to the module that contains the Lambda handler. It must export a function named 'handler'.",
    )
      .conflicts("config")
      .argParser((v) =>
        argParser(v, GLOBAL_OPTIONS_SCHEMA.shape.handlerModule),
      ),
  )
  .addOption(
    new Option(
      LOGGER_MODULE_OPTION_FLAGS,
      "The path to the module that contains a Logger. It must be the default export.",
    )
      .conflicts("config")
      .argParser((v) => argParser(v, GLOBAL_OPTIONS_SCHEMA.shape.loggerModule)),
  )
  .addOption(
    new Option(TIMEOUT_OPTION_FLAGS, "The Lambda function timeout in seconds.")
      .conflicts("config")
      .argParser((v) =>
        argParser(
          v,
          GLOBAL_OPTIONS_SCHEMA.shape.timeout,
          "The timeout must be an integer greater or equal to 1.",
        ),
      ),
  )
  .addOption(
    new Option(
      CONFIG_OPTION_FLAGS,
      "A JSON configuration file with the option values.",
    ).argParser((v) => resolveOptionValue(CONFIG_OPTION_FLAGS, v)),
  )
  .addCommand(sqs);

/** CLI to run Lambda function handlers. */
export async function runLambda(
  argv: readonly string[],
  unitTest = false,
): Promise<void> {
  // unit testing config
  if (unitTest) {
    program
      .configureOutput({
        writeErr() {},
        writeOut() {},
      })
      .exitOverride();

    program.commands.forEach((c) =>
      c
        .configureOutput({
          writeErr() {},
          writeOut() {},
        })
        .exitOverride(),
    );
  }

  await program.parseAsync(argv);
}
