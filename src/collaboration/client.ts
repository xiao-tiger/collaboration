import { createTextCRDT } from '../crdt'
import { parseMessage, type OpsMessage, type ServerMessage } from './protocol'

export function connectDocument(
    url: string,
    onRemoteText: (text: string) => void,
    onStatus: (status: string) => void
) {
    const crdt = createTextCRDT(crypto.randomUUID())
    const socket = new WebSocket(url)

    let ready = false
    let disposed = false
    let remotePaused = false
    const deferred: ServerMessage[] = []

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

        // for (const operation of message.operations) {
        //     crdt.apply(operation)
        // }

        // onRemoteText(crdt.getText())

        if (remotePaused && message.type === 'ops') {
            deferred.push(message)
            return
        }

        receive(message)
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

    function receive(message: ServerMessage) {
        for (const operation of message.operations) {
            crdt.apply(operation)
        }

        onRemoteText(crdt.getText())

        if (message.type === 'sync') {
            ready = true
            onStatus('已同步')
        }
    }

    return {
        insert: (offset: number, text: string) =>
            edit("insert", offset, text),

        remove: (offset: number, text: string) =>
            edit("delete", offset, text),

        getText: crdt.getText,

        getVisibleChars: crdt.getVisibleChars,

        isReady: () => {
            return !disposed && ready && socket.readyState === WebSocket.OPEN
        },

        pauseRemote() {
            remotePaused = true
        },

        resumeRemote() {
            remotePaused = false

            while (
                !disposed &&
                !remotePaused &&
                deferred.length > 0
            ) {
                receive(deferred.shift()!)
            }
        },

        close() {
            disposed = true;
            ready = false;
            deferred.length = 0

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