import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startHealthServer, type BotHealthState } from "../src/services/healthServer.js";

const servers: ReturnType<typeof startHealthServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("health server", () => {
  it("reports readiness using the health endpoint", async () => {
    let state: BotHealthState = "starting";
    const server = startHealthServer(0, () => state);
    servers.push(server);
    if (!server.listening) await once(server, "listening");
    const port = (server.address() as AddressInfo).port;

    const starting = await fetch(`http://127.0.0.1:${port}/health`);
    expect(starting.status).toBe(503);

    state = "ready";
    const ready = await fetch(`http://127.0.0.1:${port}/health`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({ service: "nexavision", state: "ready" });
  });
});
