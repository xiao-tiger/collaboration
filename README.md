# 协同编辑练习

最小的 Next.js App Router + TypeScript + Slate 项目。
通过 Custom Server 在同一个 Node.js 服务、同一个端口上运行 Next.js 和 WebSocket。
页面、SSR 和 API 路由交给 Next.js，`/ws` 的连接交给 `ws`；浏览器使用原生 WebSocket。
没有引入 Yjs、Automerge、slate-yjs 或其他协同算法库。

## 启动

依赖通过 pnpm 管理，使用 Node.js 22.21+ 和 pnpm 11。

```sh
pnpm install
```

一条命令启动页面和 WebSocket：

```sh
pnpm dev
```

打开 <http://127.0.0.1:3000>。页面自动连接同一地址的 `/ws`，例如 `ws://127.0.0.1:3000/ws`。
通过 HTTPS 访问时会自动使用 `wss://`。

修改 `server/` 中的代码会重启服务；页面代码继续由 Next.js 热更新。
服务重启后，刷新页面即可重新建立 WebSocket 连接。

可以通过环境变量修改监听地址和端口：

```sh
HOST=0.0.0.0 PORT=4000 pnpm dev
```

## 练习入口

- `src/components/Editor.tsx`：Slate 编辑器，已预留本地操作和远端消息的 TODO。
- `src/crdt/index.ts`：空的 CRDT 模块，算法由你手写。
- `server/index.ts`：统一启动入口，包含 HTTP 服务和 WebSocket echo，后续自行实现消息广播。
- `src/app/`：Next.js 页面；普通 HTTP 接口继续使用这里的 `route.ts`。
- `src/types/slate.d.ts`：Slate 文档类型，目前只有段落和文本。

当前只支持本地编辑和 WebSocket 连接，多个窗口之间还不会同步内容。
刷新会清空内容；持久化、重连、撤销和光标同步都还没有实现。

## 检查

```sh
pnpm typecheck
pnpm build
```

## 生产运行

```sh
pnpm build
pnpm start
```

生产默认监听 `0.0.0.0:3000`，也支持 `HOST` 和 `PORT`。
部署一个应用进程即可；`tsx` 是运行入口所需的生产依赖。
部署时需包含 `server/`、`.next/`、`package.json` 和生产依赖，另有 `public/` 或配置文件时也应包含。
使用自定义启动入口，不要改用 `next start` 或 `output: "standalone"`。

参考：[Slate 文档](https://docs.slatejs.org/)、[Next.js Custom Server](https://nextjs.org/docs/app/guides/custom-server)、[ws](https://github.com/websockets/ws)。
