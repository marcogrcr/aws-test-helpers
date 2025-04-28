# aws-test-helpers

Provides helpers for testing AWS functionality.

## Getting started

Import the desired helper. For example:

```ts
import { SqsHelper } from "aws-test-helpers/sqs";

interface Email {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

const { messages } = await SqsHelper.getJsonMessages<Email>({
  endpoint: "http://127.0.0.1:4566", // localstack
  queueUrl: "...",
});

for (const { Object: email } of messages) {
  console.info("Subject:", email.subject);
  console.info("From:", email.from);
  console.info("To:", email.to);
  console.info(email.body);
}
```

See [package.json] for all available functionality in `exports`.

### Helpers

- `aws-test-helpers/lambda`: Invokes Lambda handlers locally.
- `aws-test-helpers/lambda/sqs`: Polls an SQS queue and invokes a Lambda handler.
- `aws-test-helpers/sqs`: Provides various SQS-related methods like upserting a queue, getting messages in batches and
  automatically parsing messages in JSON format.

### Logging

Some helpers methods accept a `Logger` instance. The following loggers are provided out-of-the-box:

- `aws-test-helpers/logger`:
  - `NoLogger`: disables logging.
  - `ConsoleLogger`: logs using the `console`.
- `logger/lambda-powertools-logger`: Wraps a [@aws-lambda-powertools/logger] logger.

## CLI

The package also exposes CLI commands. Invoke commands with the `--help` argument to learn more.

See [package.json] for all available commands in `bin`.

### run-lambda

Invokes a Lambda handler.

#### run-lambda sqs

Polls an SQS queue and invokes a Lambda handler.

For example, given the following Lambda handler:

```ts
// src/log-messages.ts
import type { SQSHandler } from "aws-lambda";

export const handler: SQSHandler = async (event) => {
  console.log("Got messages:", event.Messages);
};
```

and the following [.env] file:

```ini
AWS_REGION='us-east-1'
AWS_ACCESS_KEY_ID='fake'
AWS_SECRET_ACCESS_KEY='fake'
ENDPOINT='http://127.0.0.1:4566' # localstack
```

You can run it locally as follows:

```sh
npx run-lambda sqs \
--batch-size '10' \
--endpoint 'env:ENDPOINT' \ # you can reference .env variables with 'env:XXX'
--handler 'src/log-messages.ts' \
--queue-name 'my-queue' \
--timeout '30'
```

Alternatively, you can specify a `.json` config file:

```jsonc
// config/run-sqs-lambda.json
{
  "batchSize": 10,
  "endpoint": "env:ENDPOINT",
  "handler": "src/log-messages.ts",
  "queueName": "my-queue",
  "timeout": 30,
}
```

```sh
npx run-lambda sqs --config-file config/run-sqs-lambda.json
```

[.env]: https://www.npmjs.com/package/dotenv
[@aws-lambda-powertools/logger]: https://www.npmjs.com/package/@aws-lambda-powertools/logger
[package.json]: ./package.json
