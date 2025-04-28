import path from "node:path";
import { fileURLToPath } from "node:url";

import { CommanderError } from "commander";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runLambda } from "../../../../src/bin/run-lambda/cli";
import { SqsLambdaHelper } from "../../../../src/lambda/sqs";
import { modulePath as nonFunctionHandlerModulePath } from "../modules/lambda/non-function";
import {
  handler,
  modulePath as okHandlerModulePath,
} from "../modules/lambda/ok";
import { modulePath as nonLoggerModulePath } from "../modules/logger/non-logger";
import logger, { modulePath as okLoggerModulePath } from "../modules/logger/ok";

vi.mock("../../../../src/lambda/sqs");

const BASE_ARGV = {
  node: "module",
  sqs: "",
};

const DEFAULT_ARGV = {
  ...BASE_ARGV,
  "-b": "2",
  "-e": "https://example.com",
  "-h": okHandlerModulePath,
  "-l": okLoggerModulePath,
  "-q": "queue-name",
  "-t": "3",
} as const;

function toArgs(args: Record<string, string>): readonly string[] {
  return Object.entries(args)
    .map(([key, value]) => (value ? [key, value] : [key]))
    .flat();
}

function toPath(...components: string[]): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), ...components);
}

// TODO: unit test the refactored modules independently (e.g. src/bin/run-lambda/util/*)
describe("run-lambda sqs", () => {
  describe("with no options", () => {
    it("throws error", async () => {
      const actual = runLambda(toArgs(BASE_ARGV), true);

      await expect(actual).rejects.toThrow(CommanderError);
    });
  });

  describe("with options from arguments", () => {
    it("invokes SqsLambdaHelper.runSqsLambda", async () => {
      await runLambda(toArgs(DEFAULT_ARGV), true);

      expect(SqsLambdaHelper.runSqsLambda).toHaveBeenCalledWith({
        abortSignal: expect.any(AbortSignal),
        batchSize: 2,
        endpoint: "https://example.com",
        handler,
        logger,
        queue: { name: "queue-name" },
        timeout: 3,
      });
    });
  });

  describe("with options from config file", () => {
    it("obtains options from config file", async () => {
      await runLambda(
        toArgs({
          ...BASE_ARGV,
          "-c": toPath("config", "ok.json"),
        }),
        true,
      );

      expect(SqsLambdaHelper.runSqsLambda).toHaveBeenCalledWith({
        abortSignal: expect.any(AbortSignal),
        batchSize: 2,
        endpoint: "https://example.com",
        handler,
        logger,
        queue: { name: "queue-name" },
        timeout: 3,
      });
    });

    describe("invalid file", () => {
      it("throws error", async () => {
        const actual = runLambda(
          toArgs({
            ...BASE_ARGV,
            "-c": toPath("config", "invalid.json"),
          }),
          true,
        );

        await expect(actual).rejects.toThrow(CommanderError);
      });
    });
  });

  describe("with environment variables", () => {
    let tmp: NodeJS.ProcessEnv;
    beforeAll(() => {
      tmp = process.env;
      process.env = {
        ...tmp,
        BATCH_SIZE: "3",
        ENDPOINT: "http://localhost",
        HANDLER: okHandlerModulePath,
        LOGGER: okLoggerModulePath,
        QUEUE_NAME: "other-queue",
        TIMEOUT: "4",
      };
    });

    afterAll(() => {
      process.env = tmp;
    });

    describe("with options from arguments", () => {
      it("reads values from environment variables", async () => {
        await runLambda(
          toArgs({
            ...BASE_ARGV,
            "-b": "env:BATCH_SIZE",
            "-e": "env:ENDPOINT",
            "-h": "env:HANDLER",
            "-l": "env:LOGGER",
            "-q": "env:QUEUE_NAME",
            "-t": "env:TIMEOUT",
          }),
          true,
        );

        expect(SqsLambdaHelper.runSqsLambda).toHaveBeenCalledWith({
          abortSignal: expect.any(AbortSignal),
          batchSize: 3,
          endpoint: "http://localhost",
          handler,
          logger,
          queue: { name: "other-queue" },
          timeout: 4,
        });
      });
    });

    describe("with options from config file", () => {
      it("reads values from environment variables", async () => {
        await runLambda(
          toArgs({
            ...BASE_ARGV,
            "-c": toPath("config", "env-var.json"),
          }),
          true,
        );

        expect(SqsLambdaHelper.runSqsLambda).toHaveBeenCalledWith({
          abortSignal: expect.any(AbortSignal),
          batchSize: 3,
          endpoint: "http://localhost",
          handler,
          logger,
          queue: { name: "other-queue" },
          timeout: 4,
        });
      });
    });

    describe("non-existent environment variable", async () => {
      it("throws error", async () => {
        const actual = runLambda(
          toArgs({
            ...DEFAULT_ARGV,
            "-b": "env:NON_EXISTENT",
          }),
          true,
        );

        await expect(actual).rejects.toThrow(CommanderError);
      });
    });
  });

  describe.each([
    {
      testCase: "invalid batch size",
      args: { "-b": "text" },
    },
    {
      testCase: "invalid endpoint",
      args: { "-e": "text" },
    },
    {
      testCase: "non-existent handler module",
      args: { "-h": "non-existent" },
    },
    {
      testCase: "non-function handler",
      args: { "-h": nonFunctionHandlerModulePath },
    },
    {
      testCase: "non-existent logger module",
      args: { "-l": "non-existent" },
    },
    {
      testCase: "non-logger default export",
      args: { "-l": nonLoggerModulePath },
    },
    {
      testCase: "invalid timeout",
      args: { "-t": "text" },
    },
  ])("$testCase", ({ args }) => {
    it("throws error", async () => {
      const actual = runLambda(
        toArgs({
          ...DEFAULT_ARGV,
          ...args,
        }),
        true,
      );

      await expect(actual).rejects.toThrow(CommanderError);
    });
  });
});
