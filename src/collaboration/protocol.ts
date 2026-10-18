import type { CharId, CRDTOperation } from '@/crdt'

/**
 * | 消息 | 谁发送 | 内容 |
 * |---|---|---|
 * | `ops` | 客户端提交，服务端转发 | 本次新增的操作 |
 * | `sync` | 服务端发给新连接 | 已保存的全部历史操作 |
 * 
 */

export type OpsMessage = {
    type: 'ops'
    operations: CRDTOperation[]
}

export type SyncMessage = {
    type: 'sync'
    operations: CRDTOperation[]
}

export type ServerMessage = OpsMessage | SyncMessage

function isRecord(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
    )
}

function isCharId(value: unknown): value is CharId {
    return (
        isRecord(value) &&
        typeof value.clientId === 'string' &&
        value.clientId.length > 0 &&
        typeof value.counter === 'number' &&
        Number.isSafeInteger(value.counter) &&
        value.counter > 0
    )
}

function isOperation(value: unknown): value is CRDTOperation {
    if (!isRecord(value) || !isCharId(value.id)) return false

    if (value.type === 'delete') return true

    return (
        value.type === "insert" &&
        typeof value.value === "string" &&
        value.value.length === 1 &&
        (value.after === null || isCharId(value.after))
    ); 
}


export function parseMessage(text: string): ServerMessage | null {
    let value: unknown

    try {
        value = JSON.parse(text)
    } catch {
        return null
    }

    if (
        !isRecord(value) ||
        (value.type !== "ops" && value.type !== "sync") ||
        !Array.isArray(value.operations) ||
        !value.operations.every(isOperation)
    ) {
        return null;
    }

    return {
        type: value.type,
        operations: value.operations
    }
}

