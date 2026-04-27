import { Hatchet } from "@hatchet-dev/typescript-sdk";

export type HatchetRuntimeClient = ReturnType<typeof Hatchet.init>;

let client: HatchetRuntimeClient | undefined;

export function getHatchetClient(): HatchetRuntimeClient {
  client ??= Hatchet.init();
  return client;
}
