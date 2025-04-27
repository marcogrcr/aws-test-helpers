#!/usr/bin/env tsx
import "dotenv/config";

import path from "node:path";

import { AbortController } from "@aws-sdk/abort-controller";
import type { SQSHandler } from "aws-lambda";
import { InvalidArgumentError, program } from "commander";
import esMain from "es-main";
import { z } from "zod";

import { SqsLambdaHelper } from "../lambda/sqs";
import { ConsoleLogger, type Logger } from "../logger";

interface Options {
  readonly batchSize: number;
  readonly endpoint: string;
  readonly handlerModule: string;
  readonly loggerModule?: string;
  readonly queueName: string;
  readonly timeout: number;
}

const HANDLER_OPTION = "-h, --handler-module <module-path>";
const LOGGER_OPTION = "-l, --logger-module <module-path>";

// configure program
program
  .name("run-sqs-lambda")
  .description("Polls an SQS queue and invokes a Lambda handler.")
  .addHelpText(
    "after",
    'Add "env:" prefix to any option value to read it from an environment variable (.env files are supported). For example -q env:QUEUE_NAME',
  )
  .requiredOption(
    "-b, --batch-size <number>",
    "The SQS message batch size.",
    (v) => {
      const r = z
        .string()
        .regex(/^\d+$/)
        .transform((v) => parseInt(v))
        .pipe(z.number().int().min(1))
        .safeParse(resolveOptionValue(v));
      if (!r.success) {
        throw new InvalidArgumentError(
          "The batch size must be an integer greater or equal to 1.",
        );
      }
      return r.data;
    },
  )
  .requiredOption("-e, --endpoint <url>", "The SQS endpoint", (v) => {
    const r = z.string().url().safeParse(resolveOptionValue(v));
    if (!r.success) {
      throw new InvalidArgumentError("The endpoint must be a URL.");
    }
    return r.data;
  })
  .requiredOption(
    HANDLER_OPTION,
    "The path to the module that contains the Lambda handler. It must export a function named 'handler'.",
    (v) => resolveOptionValue(v),
  )
  .option(
    LOGGER_OPTION,
    "The path to the module that contains a Logger. It must be the default export.",
    (v) => resolveOptionValue(v),
  )
  .requiredOption("-q, --queue-name <name>", "The SQS queue name.", (v) =>
    resolveOptionValue(v),
  )
  .requiredOption(
    "-t, --timeout <seconds>",
    "The Lambda function timeout in seconds.",
    (v) => {
      const r = z
        .string()
        .regex(/^\d+$/)
        .transform((v) => parseInt(v))
        .pipe(z.number().int().min(1))
        .safeParse(resolveOptionValue(v));
      if (!r.success) {
        throw new InvalidArgumentError(
          "The timeout must be an integer greater or equal to 1.",
        );
      }
      return r.data;
    },
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
  const options: Options = program.parse(argv).opts();

  // dynamically load logger
  let logger: Logger = new ConsoleLogger();
  if (options.loggerModule) {
    const module = await loadModule(LOGGER_OPTION, options.loggerModule);
    if (!isLogger(module.default)) {
      program.error(
        `error: option: '${LOGGER_OPTION}' argument '${options.loggerModule}' is invalid. The module default export is not a Logger instance.`,
      );
    }
    logger = module.default;
  }

  // dynamically load Lambda handler
  const { handler } = await loadModule(HANDLER_OPTION, options.handlerModule);
  if (typeof handler !== "function") {
    program.error(
      `error: option '${HANDLER_OPTION}' argument '${options.handlerModule}' is invalid. The module does not export a function named 'handler'.`,
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

async function loadModule(
  option: string,
  modulePath: string,
): Promise<Record<string, unknown>> {
  try {
    return await import(path.resolve(modulePath));
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

function resolveOptionValue(value: string): string {
  if (!value.startsWith("env:")) {
    return value;
  }

  const varName = value.substring(4);
  const result = process.env[varName];
  if (!result) {
    throw new InvalidArgumentError(
      `No environment variable found with name '${varName}'.`,
    );
  }

  return result;
}

// main
if (esMain(import.meta)) {
  await runSqsLambda(process.argv);
}
