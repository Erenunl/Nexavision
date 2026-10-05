import { createServer, type Server } from "node:http";

export type BotHealthState = "starting" | "ready" | "failed";

export function startHealthServer(
  port: number,
  getState: () => BotHealthState,
): Server {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Geçersiz HTTP portu: ${port}`);
  }

  const server = createServer((request, response) => {
    const state = getState();
    response.setHeader("content-type", "application/json; charset=utf-8");

    if (request.url === "/health") {
      response.statusCode = state === "ready" ? 200 : 503;
      response.end(JSON.stringify({ service: "nexavision", state }));
      return;
    }
    if (request.url === "/") {
      response.statusCode = 200;
      response.end(JSON.stringify({ service: "nexavision", state }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`HTTP sağlık sunucusu 0.0.0.0:${port} üzerinde hazır.`);
  });
  return server;
}
