import type { SQSHandler } from "aws-lambda";
import { Command, Option } from "commander";
import { z } from "zod";

import { SqsLambdaHelper } from "../../../lambda/sqs";
import { loadModules } from "../util/modules";
import {
  GLOBAL_OPTIONS_SCHEMA as BASE_OPTIONS_SCHEMA,
  INTEGER_STRING,
  POSITIVE_INTEGER,
  resolveOptionValue,
} from "../util/options";
import { argParser, parseOptions } from "../util/parse-options";

const BATCH_SIZE_OPTION = "-b, --batch-size <number>";
const QUEUE_NAME_OPTION = "-q, --queue-name <name>";

const OPTIONS_SCHEMA = BASE_OPTIONS_SCHEMA.extend({
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
  queueName: z
    .string()
    .transform((v) => resolveOptionValue(QUEUE_NAME_OPTION, v)),
});

/** CLI to {@link SqsLambdaHelper}'s `runSqsLambda`. */
export default new Command("sqs")
  .description("Polls an SQS queue and invokes a Lambda handler.")
  .configureHelp({ showGlobalOptions: true })
  .showHelpAfterError()
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
    new Option(QUEUE_NAME_OPTION, "The SQS queue name.")
      .conflicts("config")
      .argParser((v) => argParser(v, OPTIONS_SCHEMA.shape.queueName)),
  )
  .action(async function () {
    const options = await parseOptions(this, OPTIONS_SCHEMA);
    const { handler, logger } = await loadModules<SQSHandler>(options);

    // print parameters
    logger.info(
      "Polling SQS queue and invoking Lambda handler with the following options.",
      { options },
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
      handler,
      logger,
      queue: { name: options.queueName },
      timeout: options.timeout,
    });

    logger.info("Finished polling SQS queue.");
  });
