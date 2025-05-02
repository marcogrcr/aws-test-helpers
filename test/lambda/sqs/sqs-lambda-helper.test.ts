import { randomUUID } from "node:crypto";

import {
  CreateQueueCommand,
  DeleteQueueCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import type { SQSEvent, SQSHandler, SQSRecordAttributes } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SqsLambdaHelper } from "../../../src/lambda/sqs/sqs-lambda-helper";
import { ConsoleLogger } from "../../../src/logger";
import { SqsHelper } from "../../../src/sqs";
import { delay } from "../../util";

const ENDPOINT = process.env.AWS_ENDPOINT!;
vi.mock("../../../src/logger");

describe("SqsLambdaHelper", () => {
  describe("runSqsLambda", () => {
    let queueName: string;
    let queueUrl: string;
    beforeEach(async () => {
      queueName = randomUUID();
      const res = await SqsHelper.upsertQueue({
        command: new CreateQueueCommand({
          QueueName: queueName,
        }),
        endpoint: ENDPOINT,
      });
      queueUrl = res.queueUrl;

      await Promise.all(
        Array.from({ length: 2 }).map((_, id) =>
          SqsHelper.send({
            command: new SendMessageCommand({
              MessageBody: id.toString(),
              QueueUrl: queueUrl,
            }),
            endpoint: ENDPOINT,
          }),
        ),
      );
    });

    it("runs lambda", async () => {
      const abortController = new AbortController();
      const error = new Error("failure");
      let invocationCount = 0;

      await SqsLambdaHelper.runSqsLambda({
        abortSignal: abortController.signal,
        batchSize: 1,
        endpoint: ENDPOINT,
        handler: async (event) => {
          if (++invocationCount === 2) {
            abortController.abort();
          }

          if (event.Records[0].body === "0") {
            throw error;
          } else {
            return "success" as unknown as ReturnType<SQSHandler>;
          }
        },
        logger: new ConsoleLogger(),
        queue: { name: queueName },
        timeout: 3,
      });

      expect(ConsoleLogger.prototype.error).toHaveBeenCalledWith(
        "Failed to invoke lambda handler.",
        { error, timeout: false },
      );
      expect(ConsoleLogger.prototype.info).toHaveBeenCalledWith(
        "Successfully invoked lambda handler.",
        { result: "success" },
      );
    });

    describe("abortSignal aborted", async () => {
      it("aborts SQS polling", async () => {
        const abortController = new AbortController();
        const handler = vi.fn();

        await Promise.all([
          SqsLambdaHelper.runSqsLambda({
            abortSignal: abortController.signal,
            batchSize: 3,
            endpoint: ENDPOINT,
            handler,
            queue: { url: queueUrl },
            timeout: 3,
          }),
          (async () => {
            await delay(1);
            abortController.abort();
          })(),
        ]);

        expect(handler).not.toHaveBeenCalled();
      });
    });

    describe("fail to poll SQS", () => {
      it("throws error", async () => {
        await SqsHelper.send({
          command: new DeleteQueueCommand({
            QueueUrl: queueUrl,
          }),
          endpoint: ENDPOINT,
        });
        const handler = vi.fn();

        const actual = SqsLambdaHelper.runSqsLambda({
          batchSize: 3,
          endpoint: ENDPOINT,
          handler,
          queue: { url: queueUrl },
          timeout: 3,
        });

        await expect(actual).rejects.toThrow();
        expect(handler).not.toHaveBeenCalled();
      });
    });
  });

  describe("toSqsEvent", () => {
    it("converts messages to an SQS event", () => {
      const actual = SqsLambdaHelper.toSqsEvent({
        account: "account",
        messages: [
          {
            Attributes: {
              AWSTraceHeader: "aws-trace-header",
              All: "all",
              ApproximateFirstReceiveTimestamp:
                "approximate-first-receive-timestamp",
              ApproximateReceiveCount: "approximate-receive-count",
              DeadLetterQueueSourceArn: "dead-letter-queue-source-arn",
              MessageDeduplicationId: "message-deduplication-id",
              MessageGroupId: "message-group-id",
              SenderId: "sender-it",
              SentTimestamp: "sent-timestamp",
              SequenceNumber: "sequence-number",
            },
            Body: "body",
            MD5OfBody: "body-md5",
            MD5OfMessageAttributes: "attr-md5",
            MessageAttributes: {
              binaryListValues: {
                BinaryListValues: [Buffer.from("binary"), Buffer.from("list")],
                DataType: "Binary",
              },
              binaryValue: {
                BinaryValue: Buffer.from("binary"),
                DataType: "Binary",
              },
              stringListValues: {
                DataType: "String",
                StringListValues: ["string", "list"],
              },
              stringValue: {
                DataType: "String",
                StringValue: "string",
              },
            },
            MessageId: "message-id",
            ReceiptHandle: "receipt-handle",
          },
        ],
        queueName: "queue-name",
        region: "region",
      });

      const event: SQSEvent = {
        Records: [
          {
            attributes: {
              AWSTraceHeader: "aws-trace-header",
              All: "all",
              ApproximateFirstReceiveTimestamp:
                "approximate-first-receive-timestamp",
              ApproximateReceiveCount: "approximate-receive-count",
              DeadLetterQueueSourceArn: "dead-letter-queue-source-arn",
              MessageDeduplicationId: "message-deduplication-id",
              MessageGroupId: "message-group-id",
              SenderId: "sender-it",
              SentTimestamp: "sent-timestamp",
              SequenceNumber: "sequence-number",
            } as unknown as SQSRecordAttributes,
            awsRegion: "region",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:region:account:queue-name",
            body: "body",
            md5OfBody: "body-md5",
            messageAttributes: {
              binaryListValues: expect.objectContaining({
                binaryListValues: ["YmluYXJ5", "bGlzdA=="],
                dataType: "Binary",
              }),
              binaryValue: expect.objectContaining({
                dataType: "Binary",
                binaryValue: "YmluYXJ5",
              }),
              stringListValues: expect.objectContaining({
                dataType: "String",
                stringListValues: ["string", "list"],
              }),
              stringValue: expect.objectContaining({
                dataType: "String",
                stringValue: "string",
              }),
            },
            messageId: "message-id",
            receiptHandle: "receipt-handle",
          },
        ],
      };
      expect(actual).toStrictEqual({ event });
    });
  });
});
