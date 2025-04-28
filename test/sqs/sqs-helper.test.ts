import { randomUUID } from "node:crypto";

import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  QueueNameExists,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { beforeEach, describe, expect, it } from "vitest";

import { SqsHelper } from "../../src/sqs/sqs-helper";
import { delay } from "../util";

const ENDPOINT = process.env.AWS_ENDPOINT!;

describe("SQSHelper", () => {
  let queueName: string;
  let queueUrl: string;
  beforeEach(async () => {
    queueName = randomUUID();
    const res = await SqsHelper.upsertQueue({
      command: new CreateQueueCommand({ QueueName: queueName }),
      endpoint: ENDPOINT,
    });
    queueUrl = res.queueUrl;
  });

  describe("clearQueue", () => {
    beforeEach(async () => {
      await Promise.all(
        Array.from({ length: 11 }).map((_, id) =>
          SqsHelper.send({
            command: new SendMessageCommand({
              QueueUrl: queueUrl,
              MessageBody: id.toString(),
            }),
            endpoint: ENDPOINT,
          }),
        ),
      );
    });

    it("clears queue", async () => {
      await SqsHelper.clearSqsQueue({
        endpoint: ENDPOINT,
        queueUrl,
      });

      const actual = await SqsHelper.getMessages({
        endpoint: ENDPOINT,
        queueUrl,
      });

      expect(actual.messages).toHaveLength(0);
    });

    describe("purge", () => {
      it("clears queue", async () => {
        await SqsHelper.clearSqsQueue({
          endpoint: ENDPOINT,
          queueUrl,
          purge: true,
        });

        const actual = await SqsHelper.getMessages({
          endpoint: ENDPOINT,
          queueUrl,
        });

        expect(actual.messages).toHaveLength(0);
      });
    });
  });

  describe("getJsonMessage", () => {
    it("gets parsed JSON messages", async () => {
      await Promise.all(
        Array.from({ length: 3 }).map((_, id) =>
          SqsHelper.send({
            command: new SendMessageCommand({
              MessageBody: JSON.stringify({ id }),
              QueueUrl: queueUrl,
            }),
            endpoint: ENDPOINT,
          }),
        ),
      );

      const actual = await SqsHelper.getJsonMessages({
        endpoint: ENDPOINT,
        queueUrl,
      });

      expect(actual.messages).toHaveLength(3);
      expect(actual).toStrictEqual({
        messages: expect.arrayContaining(
          Array.from({ length: 3 }).map((_, id) =>
            expect.objectContaining({
              Object: { id },
            }),
          ),
        ),
      });
    });
  });

  describe("getMessages", () => {
    beforeEach(async () => {
      await Promise.all(
        Array.from({ length: 3 }).map((_, id) =>
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

    it("gets SQS messages and deletes them", async () => {
      const first = await SqsHelper.getMessages({
        endpoint: ENDPOINT,
        queueUrl,
      });

      expect(first.messages).toHaveLength(3);
      expect(first).toStrictEqual({
        messages: expect.arrayContaining(
          Array.from({ length: 3 }).map((_, id) =>
            expect.objectContaining({
              Body: id.toString(),
            }),
          ),
        ),
      });

      const second = await SqsHelper.getMessages({
        endpoint: ENDPOINT,
        queueUrl,
      });

      expect(second.messages).toHaveLength(0);
    });

    describe("abortController", () => {
      it("aborts request", async () => {
        const abortController = new AbortController();
        const [actual] = await Promise.allSettled([
          SqsHelper.getMessages({
            abortSignal: abortController.signal,
            batchSize: 4,
            endpoint: ENDPOINT,
            queueUrl,
          }),
          (async () => {
            await delay(1);
            abortController.abort();
          })(),
        ]);

        expect(actual.status).toBe("rejected");
        expect(actual.status === "rejected" && actual.reason).toMatchObject({
          name: "AbortError",
        });
      });
    });

    describe("batchSize", () => {
      it("waits for the messages to arrive", async () => {
        const [actual] = await Promise.all([
          SqsHelper.getMessages({
            batchSize: 15,
            endpoint: ENDPOINT,
            queueUrl,
          }),
          (async () => {
            await delay(1);
            await Promise.all(
              Array.from({ length: 13 }).map((_, id) =>
                SqsHelper.send({
                  command: new SendMessageCommand({
                    MessageBody: (id + 3).toString(),
                    QueueUrl: queueUrl,
                  }),
                  endpoint: ENDPOINT,
                }),
              ),
            );
          })(),
        ]);

        expect(actual.messages).toHaveLength(15);
      });

      describe("less than 1", () => {
        it("throws error", async () => {
          const actual = SqsHelper.getMessages({
            batchSize: 0,
            endpoint: ENDPOINT,
            queueUrl,
          });

          await expect(actual).rejects.toThrow();
        });
      });
    });

    describe("keep", () => {
      it("gets SQS messages and keeps them", async () => {
        const first = await SqsHelper.getMessages({
          endpoint: ENDPOINT,
          keep: true,
          queueUrl,
        });

        expect(first.messages).toHaveLength(3);
        expect(first).toMatchObject({
          messages: expect.arrayContaining(
            Array.from({ length: 3 }).map((_, id) =>
              expect.objectContaining({
                Body: id.toString(),
              }),
            ),
          ),
        });

        const second = await SqsHelper.getMessages({
          endpoint: ENDPOINT,
          queueUrl,
        });

        expect(second.messages).toHaveLength(3);
      });
    });
  });

  describe("upsertQueue", () => {
    it("creates queue", async () => {
      const { QueueUrl: expected } = await SqsHelper.send({
        command: new GetQueueUrlCommand({
          QueueName: queueName,
        }),
        endpoint: ENDPOINT,
      });

      expect(expected).toBe(queueUrl);
    });

    describe("existing queue", () => {
      describe("same attributes", () => {
        it("is no-op", async () => {
          const { queueUrl: actual } = await SqsHelper.upsertQueue({
            command: new CreateQueueCommand({ QueueName: queueName }),
            endpoint: ENDPOINT,
          });

          expect(queueUrl).toBe(actual);
        });
      });

      describe("different attributes", () => {
        it("throws QueueNameExists", async () => {
          const actual = SqsHelper.upsertQueue({
            command: new CreateQueueCommand({
              QueueName: queueName,
              Attributes: {
                DelaySeconds: "1",
              },
            }),
            endpoint: ENDPOINT,
          });

          await expect(actual).rejects.toThrow(QueueNameExists);
        });

        describe("force", () => {
          it("re-creates queue with new attributes", async () => {
            const { queueUrl } = await SqsHelper.upsertQueue({
              command: new CreateQueueCommand({
                QueueName: queueName,
                Attributes: {
                  DelaySeconds: "1",
                },
              }),
              endpoint: ENDPOINT,
              force: true,
            });

            const actual = await SqsHelper.send({
              command: new GetQueueAttributesCommand({
                AttributeNames: ["DelaySeconds"],
                QueueUrl: queueUrl,
              }),
              endpoint: ENDPOINT,
            });

            expect(actual).toMatchObject({
              Attributes: {
                DelaySeconds: "1",
              },
            });
          });
        });
      });
    });
  });
});
