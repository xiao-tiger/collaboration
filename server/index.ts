import { createServer } from "node:http";
import next from "next";
import WebSocket, { WebSocketServer } from "ws";
import type { CRDTOperation } from '../src/crdt'
import { parseMessage, type ServerMessage } from '../src/collaboration/protocol'

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? (dev ? "127.0.0.1" : "0.0.0.0");
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
await app.prepare();
const handleRequest = app.getRequestHandler();

// 页面、SSR 和 API 路由仍然由 Next.js 处理。
const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) response.writeHead(500);
    response.end("Internal Server Error");
  });
});

// 使用已有 HTTP 服务的连接，不再单独监听端口。
const wsServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

  // 只处理自己的 /ws；Next.js 会处理开发模式的热更新连接。
  if (pathname !== "/ws") return;

  wsServer.handleUpgrade(request, socket, head, (connection) => {
    wsServer.emit("connection", connection, request);
  });
});

wsServer.on("error", console.error);

// 所有的链接共享同一份文档的操作历史
const operationLog = new Map<string, CRDTOperation>()

wsServer.on("connection", (socket) => {
  console.log("客户端已连接");
  socket.on("error", console.error);


  const initial: ServerMessage = {
    type: 'sync',
    operations: [...operationLog.values()]
  }

  socket.send(JSON.stringify(initial))

  socket.on("message", (data, isBinary) => {
    const message = isBinary ? null : parseMessage(data.toString())

    // 客户端只能提交 ops，不能发送 sync
    if (!message || message.type !== 'ops') {
      socket.close(1008, 'Invalid message')
      return
    }

    const fresh: CRDTOperation[] = []

    for (const operation of message.operations) {
      const key = JSON.stringify([
        operation.type,
        operation.id.clientId,
        operation.id.counter
      ])

      if (operationLog.has(key)) continue

      operationLog.set(key, operation)
      fresh.push(operation)
    }

    if (fresh.length === 0) return

    const outgoing: ServerMessage = {
      type: 'ops',
      operations: fresh
    }

    const payload = JSON.stringify(outgoing)

    for (const client of wsServer.clients) {
      if (
        client !== socket &&
        client.readyState === WebSocket.OPEN
      ) {
        client.send(payload)
      }
    }
  });

  socket.on("close", () => console.log("客户端已断开"));
});

server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

server.listen(port, hostname, () => {
  console.log(`Next.js: http://${hostname}:${port}`);
  console.log(`WebSocket: ws://${hostname}:${port}/ws`);
});
