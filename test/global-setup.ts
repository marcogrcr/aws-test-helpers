import { downOne, upOne } from "docker-compose";

export async function setup() {
  console.log("Starting localstack...");
  await upOne("localstack", { commandOptions: ["--wait"] });
  console.log("localstack started!");
}

export async function teardown() {
  console.log("Stopping localstack...");
  await downOne("localstack");
  console.log("localstack stopped!");
}
