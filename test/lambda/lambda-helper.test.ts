import { describe, expect, it } from "vitest";

import {
  type InvokeLambdaInput,
  LambdaHelper,
} from "../../src/lambda/lambda-helper";

describe("LambdaHelper", () => {
  describe("invokeLambda", () => {
    it("invokes handler with expected input", async () => {
      const context: InvokeLambdaInput<void, void>["context"] = {
        awsRequestId: "aws-request-id",
        clientContext: {
          Custom: "custom",
          client: {
            appPackageName: "app-package-name",
            appTitle: "app-title",
            appVersionCode: "appVersionCode",
            appVersionName: "appVersionName",
            installationId: "installationId",
          },
          env: {
            locale: "locale",
            make: "make",
            model: "model",
            platform: "platform",
            platformVersion: "platform-version",
          },
        },
        functionName: "function-name",
        functionVersion: "function-version",
        identity: {
          cognitoIdentityId: "cognito-identity-id",
          cognitoIdentityPoolId: "cognito-identity-pool-id",
        },
        invokedFunctionArn: "invoked-function-arn",
        logGroupName: "log-group-name",
        logStreamName: "log-stream-name",
      };
      const actual = await LambdaHelper.invokeLambda({
        context,
        event: "event",
        async handler(event, context) {
          return {
            event,
            context,
            remainingTimeInMillis: context.getRemainingTimeInMillis(),
          };
        },
        timeout: 2,
      });

      expect(actual).toMatchObject({
        result: {
          context,
          event: "event",
        },
      });

      const remainingTimeInMillis =
        actual.success && actual.result?.remainingTimeInMillis;
      expect(remainingTimeInMillis).toBeGreaterThan(1000);
      expect(remainingTimeInMillis).toBeLessThanOrEqual(2000);
    });

    describe("async handler", () => {
      describe("successful invocation", () => {
        it("returns succesful invocation", async () => {
          const actual = await LambdaHelper.invokeLambda({
            event: "event",
            async handler() {
              return "result";
            },
            timeout: 1,
          });

          expect(actual).toStrictEqual({
            result: "result",
            success: true,
          });
        });
      });

      describe("failed invocation", () => {
        it("returns failed invocation", async () => {
          const error = new Error("error");
          const actual = await LambdaHelper.invokeLambda({
            event: "event",
            async handler() {
              throw error;
            },
            timeout: 1,
          });

          expect(actual).toStrictEqual({
            error,
            success: false,
            timeout: false,
          });
        });
      });
    });

    describe("callback handler", () => {
      describe("successful invocation", () => {
        it("returns succesful invocation", async () => {
          const actual = await LambdaHelper.invokeLambda({
            event: "event",
            handler(event, context, callback) {
              callback(null, "result");
            },
            timeout: 1000,
          });

          expect(actual).toStrictEqual({
            result: "result",
            success: true,
          });
        });
      });

      describe("failed invocation", () => {
        it("returns failed invocation", async () => {
          const error = new Error("error");
          const actual = await LambdaHelper.invokeLambda({
            event: "event",
            handler(event, context, callback) {
              callback(error);
            },
            timeout: 1000,
          });

          expect(actual).toStrictEqual({
            error,
            success: false,
            timeout: false,
          });
        });
      });

      describe("timed out invocation", () => {
        it("returns timed out invocation", async () => {
          const actual = await LambdaHelper.invokeLambda({
            event: "event",
            handler() {},
            timeout: 0.001,
          });

          expect(actual).toStrictEqual({
            error: undefined,
            success: false,
            timeout: true,
          });
        });
      });
    });

    describe("legacy callbacks", () => {
      describe("done", () => {
        describe("successful invocation", () => {
          it("returns successful invocation", async () => {
            const actual = await LambdaHelper.invokeLambda({
              event: "event",
              handler(event, context) {
                context.done(undefined, "result");
              },
              timeout: 1000,
            });

            expect(actual).toStrictEqual({
              result: "result",
              success: true,
            });
          });
        });

        describe("failed invocation", () => {
          it("returns failed invocation", async () => {
            const error = new Error("error");
            const actual = await LambdaHelper.invokeLambda({
              event: "event",
              handler(event, context) {
                context.done(error);
              },
              timeout: 1000,
            });

            expect(actual).toStrictEqual({
              error,
              success: false,
              timeout: false,
            });
          });
        });
      });

      describe("fail", () => {
        it("returns failed invocation", async () => {
          const error = new Error("error");
          const actual = await LambdaHelper.invokeLambda({
            event: "event",
            handler(event, context) {
              context.fail(error);
            },
            timeout: 1000,
          });

          expect(actual).toStrictEqual({
            error,
            success: false,
            timeout: false,
          });
        });
      });

      describe("succeed", () => {
        it("returns successful invocation", async () => {
          const actual = await LambdaHelper.invokeLambda({
            event: "event",
            handler(event, context) {
              context.succeed("result");
            },
            timeout: 1000,
          });

          expect(actual).toStrictEqual({
            result: "result",
            success: true,
          });
        });
      });
    });

    describe("handler throws", () => {
      it("returns failed invocation", async () => {
        const error = new Error("error");
        const actual = await LambdaHelper.invokeLambda({
          event: "event",
          handler() {
            throw error;
          },
          timeout: 1000,
        });

        expect(actual).toStrictEqual({
          error,
          success: false,
          timeout: false,
        });
      });
    });
  });
});
