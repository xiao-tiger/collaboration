import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";

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
wsServer.on("connection", (socket) => {
  console.log("客户端已连接");
  socket.on("error", console.error);

  socket.on("message", (data, isBinary) => {
    // 目前只是 echo，用来验证连接。广播和协同协议由你实现。
    socket.send(data, { binary: isBinary });
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
