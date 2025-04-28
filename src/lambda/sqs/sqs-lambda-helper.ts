import { GetQueueUrlCommand, type Message } from "@aws-sdk/client-sqs";
import type { SQSEvent, SQSHandler } from "aws-lambda";

import { type Logger, NoLogger } from "../../logger";
import { SqsHelper } from "../../sqs/sqs-helper";
import { LambdaHelper } from "..";

export interface RunSqsLambdaInput {
  /** An abort signal. */
  readonly abortSignal?: AbortSignal;

  /** The batch size. */
  readonly batchSize: number;

  /** The AWS endpoint URL. */
  readonly endpoint: string;

  /** The Lambda handler. */
  readonly handler: SQSHandler;

  /** The logger. */
  readonly logger?: Logger;

  /** The SQS queue. */
  readonly queue:
    | {
        /** The SQS queue name. */
        readonly name: string;
      }
    | {
        /** The SQS queue url. */
        readonly url: string;
      };

  /** The Lambda timeout in seconds. */
  readonly timeout: number;
}

export interface ToSqsEventInput {
  /**
   * The AWS account ID.
   * @default "123456789012"
   */
  readonly account?: string;

  /** The SQS messages. */
  readonly messages: readonly Message[];

  /**
   * The SQS queue name.
   * @default "queue"
   */
  readonly queueName?: string;

  /**
   * The AWS region.
   * @default process.env.AWS_REGION ?? "us-east-1"
   */
  readonly region?: string;
}

export interface ToSqsEventOutput {
  /** The SQS event. */
  readonly event: SQSEvent;
}

/** Provides utilities for AWS Lambda handler functions that consume {@link SQSEvent}. */
export class SqsLambdaHelper {
  private constructor() {}

  /** Simulates the Lambda service invoking a {@link SQSHandler}. */
  static async runSqsLambda(input: RunSqsLambdaInput): Promise<void> {
    const {
      abortSignal,
      batchSize,
      endpoint,
      handler,
      logger = new NoLogger(),
      queue,
      timeout,
    } = input;

    // get queue URL
    let queueUrl: string;
    if ("name" in queue) {
      const { QueueUrl } = await SqsHelper.send({
        command: new GetQueueUrlCommand({
          QueueName: queue.name,
        }),
        endpoint,
      });
      queueUrl = QueueUrl!;
    } else {
      queueUrl = queue.url;
    }

    // poll/invoke loop
    while (abortSignal === undefined || !abortSignal.aborted) {
      // poll SQS queue
      logger.info("Polling for SQS messages...");
      let messages: readonly Message[];
      try {
        const res = await SqsHelper.getMessages({
          abortSignal,
          batchSize,
          endpoint,
          queueUrl,
        });
        messages = res.messages;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          break;
        }
        throw error;
      }

      // invoke Lambda handler
      logger.info(`Invoking lambda handler with ${messages.length} messages.`);
      const output = await LambdaHelper.invokeLambda({
        event: SqsLambdaHelper.toSqsEvent({ messages }).event,
        handler,
        timeout,
      });
      if (output.success) {
        logger.info("Successfully invoked lambda handler.", {
          result: output.result,
        });
      } else {
        logger.error("Failed to invoke lambda handler.", {
          error: output.error,
          timeout: output.timeout,
        });
      }
    }
  }

  /** Converts {@link Message} instances to an {@link SQSEvent}. */
  static toSqsEvent(input: ToSqsEventInput): ToSqsEventOutput {
    const {
      account = "123456789012",
      messages,
      queueName = "queue",
      region = process.env.AWS_REGION ?? "us-east-1",
    } = input;

    return {
      event: {
        Records: messages.map((m) => ({
          attributes:
            m.Attributes as unknown as SQSEvent["Records"][0]["attributes"],
          awsRegion: region,
          eventSource: "aws:sqs",
          eventSourceARN: `arn:aws:sqs:${region}:${account}:${queueName}`,
          body: m.Body!,
          md5OfBody: m.MD5OfBody!,
          messageAttributes: m.MessageAttributes
            ? Object.fromEntries(
                Object.entries(m.MessageAttributes).map(
                  ([
                    key,
                    {
                      BinaryListValues,
                      BinaryValue,
                      DataType,
                      StringListValues,
                      StringValue,
                    },
                  ]) => [
                    key,
                    {
                      binaryValue: BinaryValue
                        ? Buffer.from(BinaryValue).toString("base64")
                        : undefined,
                      binaryListValues: (BinaryListValues
                        ? BinaryListValues.map((b) =>
                            Buffer.from(b).toString("base64"),
                          )
                        : undefined) as SQSEvent["Records"][0]["messageAttributes"][string]["binaryListValues"],
                      dataType: DataType!,
                      stringValue: StringValue,
                      stringListValues:
                        StringListValues as SQSEvent["Records"][0]["messageAttributes"][string]["stringListValues"],
                    },
                  ],
                ),
              )
            : {},
          messageId: m.MessageId!,
          receiptHandle: m.ReceiptHandle!,
        })),
      },
    };
  }
}
