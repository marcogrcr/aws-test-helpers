import {
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  type Message,
  PurgeQueueCommand,
  QueueDoesNotExist,
  QueueNameExists,
  ReceiveMessageCommand,
  type ReceiveMessageResult,
  type ServiceInputTypes,
  type ServiceOutputTypes,
  SQSClient,
  type SQSClientResolvedConfig,
} from "@aws-sdk/client-sqs";
import type { Command } from "@smithy/smithy-client";
import { shallowEqual } from "fast-equals";

export interface CleanQueueInput extends QueueInput {
  /** Indicates whether the cleanup should be performed with e {@link PurgeQueueCommand}. */
  readonly purge?: boolean;
}

export type GetJsonMessagesInput = GetMessagesInput;

export interface GetJsonMessagesOutput<T> {
  /** The JSON messages. */
  readonly messages: readonly (Message & {
    /** The parsed JSON body. */
    readonly Object: T;
  })[];
}

export interface GetMessagesInput extends QueueInput {
  /** The abort signal. */
  readonly abortSignal?: AbortSignal;

  /** The number of messages to receive before returning. */
  readonly batchSize?: number;

  /**
   * Indicates whether to keep the messages in the queue after reading them.
   * @default false
   */
  readonly keep?: boolean;
}

export interface GetMessagesOutput {
  /** The SQS messages. */
  readonly messages: readonly Message[];
}

export interface SendInput<
  Input extends ServiceInputTypes,
  Output extends ServiceOutputTypes,
> extends BaseInput {
  /** The command. */
  readonly command: Command<Input, Output, SQSClientResolvedConfig>;
}

export interface UpsertQueueInput extends BaseInput {
  /** The {@link CreateQueueCommand}. */
  readonly command: CreateQueueCommand;

  /** Indicates whether the queue should be re-created if the attributes differ. */
  readonly force?: boolean;
}

export interface UpsertQueueOutput {
  /** The SQS queue url. */
  readonly queueUrl: string;
}

interface BaseInput {
  /** The SQS endpoint URL. */
  readonly endpoint: string;
}

interface QueueInput extends BaseInput {
  /** The SQS queue URL. */
  readonly queueUrl: string;
}

/**
 * The SQS default attributes.
 * @see https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_CreateQueue.html#API_CreateQueue_RequestParameters
 */
const DEFAULT_ATTRIBUTES = {
  DelaySeconds: "0",
  MaximumMessageSize: "262144",
  MessageRetentionPeriod: "345600",
  ReceiveMessageWaitTimeSeconds: "0",
  VisibilityTimeout: "30",
} as const;

/** Provides utility methods for AWS SQS. */
export class SqsHelper {
  static #clients = new Map<string, SQSClient>();

  private constructor() {}

  /** Gets messages from an SQS queue parsed as JSON. */
  static async getJsonMessages<T>(
    input: GetJsonMessagesInput,
  ): Promise<GetJsonMessagesOutput<T>> {
    const res = await SqsHelper.getMessages(input);

    return {
      messages: res.messages.map((msg) => ({
        ...msg,
        Object: JSON.parse(msg.Body!),
      })),
    };
  }

  /** Gets messages from an SQS queue. */
  static async getMessages(
    input: GetMessagesInput,
  ): Promise<GetMessagesOutput> {
    const { abortSignal, batchSize, endpoint, keep, queueUrl } = input;

    if (batchSize !== undefined && batchSize < 1) {
      throw new Error("Batch size must be equal or greater than 1.");
    }

    const client = SqsHelper.#getClient(endpoint);

    const messages: Message[] = [];
    const receiveMessages = async () => {
      const res = await client.send(
        new ReceiveMessageCommand({
          /**
           * `10` is the max value.
           * See: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html#SQS-ReceiveMessage-request-MaxNumberOfMessages
           */
          MaxNumberOfMessages:
            batchSize === undefined
              ? 10
              : Math.min(10, batchSize - messages.length),
          QueueUrl: queueUrl,
          // make polled messages immediately available for polling again
          VisibilityTimeout: 0,
          /*
           * `20s` is the max value.
           * See: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html#sqs-long-polling
           */
          WaitTimeSeconds: batchSize ? 20 : 0,
        }),
        { abortSignal },
      );

      if (res.Messages?.length && !keep) {
        await client.send(
          new DeleteMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: res.Messages.map((msg) => ({
              Id: msg.MessageId,
              ReceiptHandle: msg.ReceiptHandle,
            })),
          }),
          { abortSignal },
        );
      }

      return res.Messages ?? [];
    };

    do {
      messages.push(...(await receiveMessages()));
    } while (batchSize !== undefined && messages.length < batchSize);

    return { messages };
  }

  /** Clears all the messages in an SQS queue. */
  static async clearSqsQueue(input: CleanQueueInput): Promise<void> {
    const { endpoint, purge, queueUrl } = input;

    const client = SqsHelper.#getClient(endpoint);

    if (purge) {
      await client.send(
        new PurgeQueueCommand({
          QueueUrl: queueUrl,
        }),
      );
    } else {
      let res: ReceiveMessageResult;
      do {
        res = await client.send(
          new ReceiveMessageCommand({
            MaxNumberOfMessages: 10,
            QueueUrl: queueUrl,
            /*
             * In localstack, empty message receives due to eventual consistency shouldn't be a problem.
             * Thus, long polling is not used.
             */
            WaitTimeSeconds: 0,
          }),
        );

        if (res.Messages?.length) {
          await client.send(
            new DeleteMessageBatchCommand({
              QueueUrl: queueUrl,
              Entries: res.Messages.map((msg) => ({
                Id: msg.MessageId,
                ReceiptHandle: msg.ReceiptHandle,
              })),
            }),
          );
        }
      } while (res.Messages?.length);
    }
  }

  /** A convenience method for sending SQS commands. */
  static async send<
    Input extends ServiceInputTypes,
    Output extends ServiceOutputTypes,
  >(input: SendInput<Input, Output>): Promise<Output> {
    const { command, endpoint } = input;
    const output = await this.#getClient(endpoint).send(command);
    return output;
  }

  /** Creates or updates a queue. */
  static async upsertQueue(
    input: UpsertQueueInput,
  ): Promise<UpsertQueueOutput> {
    const { command, endpoint, force } = input;

    const client = this.#getClient(endpoint);

    const getQueueUrl = async (): Promise<string> => {
      const { QueueUrl } = await client.send(
        new GetQueueUrlCommand({
          QueueName: command.input.QueueName,
        }),
      );
      return QueueUrl!;
    };

    let queueUrl!: string;
    try {
      queueUrl = await getQueueUrl();

      // ensure existing queue has same attributes
      const { Attributes: actualAttributes } = await client.send(
        new GetQueueAttributesCommand({
          AttributeNames: [
            "DelaySeconds",
            "MaximumMessageSize",
            "MessageRetentionPeriod",
            "Policy",
            "ReceiveMessageWaitTimeSeconds",
            "VisibilityTimeout",
          ],
          QueueUrl: queueUrl,
        }),
      );

      if (
        !shallowEqual(
          actualAttributes,
          Object.assign(
            {},
            DEFAULT_ATTRIBUTES,
            command.input.Attributes,
            command.input.Attributes,
          ),
        )
      ) {
        throw new QueueNameExists({ $metadata: {}, message: "" });
      }
    } catch (error) {
      switch (true) {
        // no queue: create it
        case error instanceof QueueDoesNotExist: {
          await client.send(command);
          queueUrl = await getQueueUrl();
          break;
        }

        // queue with different attributes: create it if force is enabled
        case error instanceof QueueNameExists && force: {
          await client.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
          await client.send(command);
          queueUrl = await getQueueUrl();
          break;
        }

        default: {
          throw error;
        }
      }
    }

    return { queueUrl };
  }

  static #getClient(endpoint: string): SQSClient {
    let client = SqsHelper.#clients.get(endpoint);
    if (!client) {
      client = new SQSClient({ endpoint });
      SqsHelper.#clients.set(endpoint, client);
    }

    return client;
  }
}
