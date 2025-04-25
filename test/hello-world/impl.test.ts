import { expect, it } from "vitest";

import { helloWorld } from "../../src/hello-world/impl";

it("returns hello world", () => {
  expect(helloWorld()).toBe("Hello World!");
});
