import { randomUUID } from "node:crypto";

import type { Callback, Context, Handler } from "aws-lambda";

export interface InvokeLambdaInput<TEvent, TResult> {
  /**
   * Allows to mock the {@link Context} passed to the handler
   * @see https://docs.aws.amazon.com/lambda/latest/dg/nodejs-context.html
   */
  readonly context?: Partial<
    Pick<
      Context,
      | "awsRequestId"
      | "clientContext"
      | "functionName"
      | "functionVersion"
      | "identity"
      | "invokedFunctionArn"
      | "logGroupName"
      | "logStreamName"
      | "memoryLimitInMB"
    >
  >;

  /** The input event to the Lambda handler. */
  readonly event: TEvent;

  /** The Lambda handler to execute. */
  readonly handler: Handler<TEvent, TResult>;

  /** The timeout of the lambda function in seconds. */
  readonly timeout: number;
}

export type InvokeLambdaOutput<TResult> =
  | SuccessfulInvokeLambdaOutput<TResult>
  | FailedInvokeLambdaOutput;

export interface SuccessfulInvokeLambdaOutput<TResult> {
  /** The result of the Lambda handler. */
  readonly result: TResult | undefined;

  /** Indicates that the Lambda handler executed successfully. */
  readonly success: true;
}

export interface FailedInvokeLambdaOutput {
  /** The error thrown by the Lambda handler. */
  readonly error: unknown;

  /** Indicates that the Lambda handler executed with an error. */
  readonly success: false;

  /** Indicates whether the Lambda handler execution timed out. */
  readonly timeout: boolean;
}

/** Provides utility methods for AWS Lambda. */
export class LambdaHelper {
  private constructor() {}

  /** Simulates the invocation of a Lambda function. */
  static async invokeLambda<TEvent, TResult>(
    input: InvokeLambdaInput<TEvent, TResult>,
  ): Promise<InvokeLambdaOutput<TResult>> {
    const { event, handler, timeout } = input;

    // callbacks to resolve/reject promise below
    let resolve!: (result: TResult | undefined) => void;
    let reject!: (error: unknown) => void;

    let promiseSettled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // promise with idempotent resolve/reject
    const promise = new Promise<TResult | undefined>(
      (innerResolve, innerReject) => {
        resolve = (result) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!promiseSettled) {
            innerResolve(result);
            promiseSettled = true;
          }
        };
        reject = (error) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!promiseSettled) {
            innerReject(error);
            promiseSettled = true;
          }
        };
      },
    );

    // simulate callback for returning result or error
    const callback: Callback<TResult> = (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    // simulate lambda function timeout
    timeoutId = setTimeout(() => {
      timeoutId = null;
      reject("lambda-helper-timeout");
    }, timeout * 1000);

    try {
      // invoke lambda handler
      const result = handler(
        event,
        LambdaHelper.#createContext(input, callback),
        callback,
      );

      // only reject/resolve if result is a Promise
      if (result instanceof Promise) {
        result.then(resolve, reject);
      }
    } catch (error) {
      // handler invocation can fail
      reject(error);
    }

    try {
      return {
        result: await promise,
        success: true,
      };
    } catch (error) {
      return {
        error: error !== "lambda-helper-timeout" ? error : undefined,
        success: false,
        timeout: error === "lambda-helper-timeout",
      };
    }
  }

  static #createContext<TEvent, TResult>(
    input: InvokeLambdaInput<TEvent, TResult>,
    callback: Callback<TResult>,
  ): Context {
    const { context = {}, timeout } = input;
    const {
      awsRequestId,
      clientContext,
      identity,
      functionName,
      functionVersion,
      invokedFunctionArn,
      logGroupName,
      logStreamName,
      memoryLimitInMB,
    } = context;

    const now = Date.now();
    return {
      awsRequestId: awsRequestId ?? randomUUID(),
      callbackWaitsForEmptyEventLoop: true,
      clientContext,
      done(error, result) {
        callback(error, result);
      },
      fail(error) {
        callback(error);
      },
      functionName: functionName ?? "placeholder",
      functionVersion: functionVersion ?? "placeholder",
      getRemainingTimeInMillis() {
        const elapsed = Date.now() - now;
        const timeoutInMs = timeout * 1000;
        return timeoutInMs - elapsed;
      },
      identity,
      invokedFunctionArn: invokedFunctionArn ?? "placeholder",
      logGroupName: logGroupName ?? "placeholder",
      logStreamName: logStreamName ?? "placeholder",
      memoryLimitInMB: memoryLimitInMB ?? "placeholder",
      succeed(result) {
        callback(null, result);
      },
    };
  }
}
