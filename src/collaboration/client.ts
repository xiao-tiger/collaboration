import { createTextCRDT } from '../crdt'
import { parseMessage, type OpsMessage } from './protocol'

export function connectDocument(
    url: string,
    onRemoteText: (text: string) => void,
    onStatus: (status: string) => void
) {
    const crdt = createTextCRDT(crypto.randomUUID())
    const socket = new WebSocket(url)

    let ready = false
    let disposed = false

    onStatus('连接中')

    socket.onopen = () => {
        if (!disposed) onStatus("正在同步");
    }

    socket.onmessage = (event) => {
        if (disposed) return

        const message = typeof event.data === 'string' 
            ? parseMessage(event.data)
            : null

        // 第一个消息必须是 sync，之后只能接收 ops。
        if (
            !message ||
            (!ready && message.type !== "sync") ||
            (ready && message.type === "sync")
        ) {
            socket.close(1008, "Unexpected message");
            return;
        }

        for (const operation of message.operations) {
            crdt.apply(operation)
        }

        onRemoteText(crdt.getText())

        if (message.type === 'sync') {
            ready = true
            onStatus('已同步')
        }
    }

    socket.onclose = () => {
        ready = false

        if (!disposed) {
            onStatus('已断开，请刷新重试')
        }
    }

    socket.onerror = () => {
        if (!disposed) onStatus('链接失败')
    }

    function edit(
        type: 'insert' | 'delete',
        offset: number,
        text: string
    ) {
        // 先检查，再修改本地文档。
        if (
            disposed ||
            !ready ||
            socket.readyState !== WebSocket.OPEN
        ) {
            throw new Error("初始同步尚未完成或连接已断开");
        }

        const operations = type === 'insert'
            ? crdt.insert(offset, text)
            : crdt.remove(offset, text)

        if (operations.length === 0) return;

        const message: OpsMessage = {
            type: 'ops',
            operations
        }

        socket.send(JSON.stringify(message))
    }

    return {
        insert: (offset: number, text: string) =>
            edit("insert", offset, text),

        remove: (offset: number, text: string) =>
            edit("delete", offset, text),

        getText: crdt.getText,

        close() {
            disposed = true;
            ready = false;

            if (socket.readyState === WebSocket.CONNECTING) {
                socket.addEventListener(
                    "open",
                    () => socket.close(),
                    { once: true },
                );
            } else {
                socket.close();
            }
        },
    }
}