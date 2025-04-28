#!/usr/bin/env tsx
import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SQSHandler } from "aws-lambda";
import { InvalidArgumentError, Option, program } from "commander";
import esMain from "es-main";
import { z, type ZodType } from "zod";

import { SqsLambdaHelper } from "../lambda/sqs";
import { ConsoleLogger, type Logger } from "../logger";

const BATCH_SIZE_OPTION = "-b, --batch-size <number>";
const CONFIG_OPTION = "-c, --config-file <config-file>";
const ENDPOINT_OPTION = "-e, --endpoint <url>";
const HANDLER_MODULE_OPTION = "-h, --handler-module <module-path>";
const LOGGER_MODULE_OPTION = "-l, --logger-module [module-path]";
const QUEUE_NAME_OPTION = "-q, --queue-name <name>";
const TIMEOUT_OPTION = "-t, --timeout <seconds>";

const INTEGER_STRING = z.string().regex(/^\d+$/);
const POSITIVE_INTEGER = z.number().int().min(1);
const OPTIONS_SCHEMA = z
  .object({
    batchSize: z.union([
      z
        .union([
          z.string().transform((v) => resolveOptionValue(BATCH_SIZE_OPTION, v)),
          INTEGER_STRING,
        ])
        .transform((v) => parseInt(v))
        .pipe(POSITIVE_INTEGER),
      POSITIVE_INTEGER,
    ]),
    endpoint: z
      .string()
      .transform((v) => resolveOptionValue(BATCH_SIZE_OPTION, v))
      .pipe(z.string().url()),
    handlerModule: z
      .string()
      .transform((v) => resolveOptionValue(HANDLER_MODULE_OPTION, v)),
    loggerModule: z
      .string()
      .transform((v) => resolveOptionValue(LOGGER_MODULE_OPTION, v))
      .optional(),
    queueName: z
      .string()
      .transform((v) => resolveOptionValue(QUEUE_NAME_OPTION, v)),
    timeout: z.union([
      z
        .union([
          z.string().transform((v) => resolveOptionValue(TIMEOUT_OPTION, v)),
          INTEGER_STRING,
        ])
        .transform((v) => parseInt(v))
        .pipe(POSITIVE_INTEGER),
      POSITIVE_INTEGER,
    ]),
  })
  .strict();

type Options = z.infer<typeof OPTIONS_SCHEMA>;
type RawOptions = Options | { readonly configFile: string };

// configure program
program
  .name("run-sqs-lambda")
  .description("Polls an SQS queue and invokes a Lambda handler.")
  .addHelpText(
    "after",
    'Add "env:" prefix to any option value to read it from an environment variable (.env files are supported). For example -q env:QUEUE_NAME',
  )
  .addOption(
    new Option(BATCH_SIZE_OPTION, "The SQS message batch size.")
      .conflicts("config")
      .argParser((v) =>
        argParser(
          v,
          OPTIONS_SCHEMA.shape.batchSize,
          "The batch size must be an integer greater or equal to 1.",
        ),
      ),
  )
  .addOption(
    new Option(ENDPOINT_OPTION, "The SQS endpoint")
      .conflicts("config")
      .argParser((v) =>
        argParser(
          v,
          OPTIONS_SCHEMA.shape.endpoint,
          "The endpoint must be a URL.",
        ),
      ),
  )
  .addOption(
    new Option(
      HANDLER_MODULE_OPTION,
      "The path to the module that contains the Lambda handler. It must export a function named 'handler'.",
    )
      .conflicts("config")
      .argParser((v) => argParser(v, OPTIONS_SCHEMA.shape.handlerModule)),
  )
  .addOption(
    new Option(
      LOGGER_MODULE_OPTION,
      "The path to the module that contains a Logger. It must be the default export.",
    )
      .conflicts("config")
      .argParser((v) => argParser(v, OPTIONS_SCHEMA.shape.loggerModule)),
  )
  .addOption(
    new Option(QUEUE_NAME_OPTION, "The SQS queue name.")
      .conflicts("config")
      .argParser((v) => argParser(v, OPTIONS_SCHEMA.shape.queueName)),
  )
  .addOption(
    new Option(TIMEOUT_OPTION, "The Lambda function timeout in seconds.")
      .conflicts("config")
      .argParser((v) =>
        argParser(
          v,
          OPTIONS_SCHEMA.shape.timeout,
          "The timeout must be an integer greater or equal to 1.",
        ),
      ),
  )
  .addOption(
    new Option(
      CONFIG_OPTION,
      "A JSON configuration file with the option values.",
    ).argParser((v) => resolveOptionValue(CONFIG_OPTION, v)),
  )
  .showHelpAfterError();

/** CLI to {@link SqsLambdaHelper}'s `runSqsLambda`. */
export async function runSqsLambda(
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
  }

  // parse arguments
  let options: Options;
  const rawOptions: RawOptions = program.parse(argv).opts();
  if ("configFile" in rawOptions) {
    const config = await loadModule(
      CONFIG_OPTION,
      rawOptions.configFile,
      "json",
    );
    const r = OPTIONS_SCHEMA.safeParse(config);
    if (!r.success) {
      program.error(
        `error: option '${CONFIG_OPTION}' argument '${rawOptions.configFile}' is invalid. ${r.error}`,
      );
    }
    options = r.data;
  } else {
    const r = OPTIONS_SCHEMA.safeParse(rawOptions);
    if (!r.success) {
      program.error(
        `error: you must specify ${CONFIG_OPTION} or all the required options.`,
      );
    }
    options = r.data;
  }

  // dynamically load logger
  let logger: Logger = new ConsoleLogger();
  if (options.loggerModule) {
    const module = await loadModule(LOGGER_MODULE_OPTION, options.loggerModule);
    if (!isLogger(module.default)) {
      program.error(
        `error: option: '${LOGGER_MODULE_OPTION}' argument '${options.loggerModule}' is invalid. The module default export is not a Logger instance.`,
      );
    }
    logger = module.default;
  }

  // dynamically load Lambda handler
  const { handler } = await loadModule(
    HANDLER_MODULE_OPTION,
    options.handlerModule,
  );
  if (typeof handler !== "function") {
    program.error(
      `error: option '${HANDLER_MODULE_OPTION}' argument '${options.handlerModule}' is invalid. The module does not export a function named 'handler'.`,
    );
  }

  // print parameters
  logger.info(
    "Polling SQS queue and invoking Lambda handler with the following options.",
    options,
  );

  // abort controller
  const abortController = new AbortController();
  process.once("SIGINT", () => {
    logger.info("Stopping...");
    abortController.abort();
  });

  // poll SQS queue, invoke Lamda handler
  await SqsLambdaHelper.runSqsLambda({
    abortSignal: abortController.signal,
    batchSize: options.batchSize,
    endpoint: options.endpoint,
    handler: handler as SQSHandler,
    logger,
    queue: { name: options.queueName },
    timeout: options.timeout,
  });

  logger.info("Finished polling SQS queue.");
}

function argParser(value: unknown, schema: ZodType, errorMsg?: string) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new InvalidArgumentError(errorMsg ?? result.error.message);
  }

  return result.data;
}

async function loadModule(
  option: string,
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
      `error: option '${option}' argument '${modulePath}' is invalid. ${error}`,
    );
  }
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

function resolveOptionValue(option: string, value: string): string {
  if (!value.startsWith("env:")) {
    return value;
  }

  const varName = value.substring(4);
  const result = process.env[varName];
  if (!result) {
    program.error(
      `error: option '${option}' argument '${value}' is invalid. No environment variable found with name '${varName}'.`,
    );
  }

  return result;
}

// main
if (esMain(import.meta)) {
  await runSqsLambda(process.argv);
}
