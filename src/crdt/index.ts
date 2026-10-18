// 你的 CRDT 实现从这里开始。
// 数据结构、操作协议和合并规则留给你自行设计。
export {};


export type CharId = {
    clientId: string;
    counter: number;
}

type CharNode = {
    id: CharId;
    after: CharId | null;  // 创建字符的时候，指定在谁后面
    value: string;
    deleted: boolean;
}

export type CRDTOperation = {
    type: 'insert',
    value: string,
    id: CharId,
    after: CharId | null
} | {
    type: 'delete',
    id: CharId
}

function idKey(id: CharId | null): string {
    return id === null ? 'ROOT' : `[${id.clientId}:${id.counter}]`
}

// 同一前驱下：counter 大的在前；相同时 clientId 小的在前面
function compareId(a: CharId, b: CharId): number {
    if (a.counter !== b.counter) return b.counter - a.counter
    if (a.clientId === b.clientId) return 0
    return a.clientId < b.clientId ? -1 : 1
}


export function createTextCRDT(clientId: string) {
    let counter = 0
    const nodes = new Map<string, CharNode>()

    // 本地和远端操作共用这个入口
    function apply(operation: CRDTOperation) {
        counter = Math.max(counter, operation.id.counter)
        const key = idKey(operation.id)

        if (operation.type === 'insert') {
            // 已经收到过，不能重复插入或恢复已删除节点
            if (nodes.has(key)) return

            if (
                operation.after !== null 
                && !nodes.has(idKey(operation.after))
            ) {
                throw new Error('插入的前驱尚未收到：第四章节加入等待队列')
            }

            nodes.set(key, {
                id: { ...operation.id },
                after: operation.after ? { ...operation.after } : null,
                value: operation.value,
                deleted: false,
            })

            return 
        }

        const target = nodes.get(key)
        if (!target) {
            throw new Error("删除的目标尚未收到：第四章加入等待队列");
        }
        target.deleted = true
    }

    function visibleNodes() {
        // 将拥有同一个 after 的节点归为一组
        const children = new Map<string, CharNode[]>()

        for (const node of nodes.values()) {
            const parentKey = idKey(node.after)
            const siblings = children.get(parentKey) ?? []

            siblings.push(node)
            children.set(parentKey, siblings)
        }

        // 每一组分别排序
        for (const siblings of children.values()) {
            siblings.sort((a, b) => compareId(a.id, b.id))
        }

        const visible: CharNode[] = []

        // 栈从末尾取元素，所以按相反顺序放进去。
        const stack = [...(children.get(idKey(null)) ?? [])].reverse()

        while (stack.length > 0) {
            const node = stack.pop()!

            if (!node?.deleted) {
                visible.push(node)
            }

            // 节点即使被删除，也必须继续访问它下面的分支。
            const next = children.get(idKey(node.id)) ?? []

            for (let i = next.length - 1; i >= 0; i--) {
                stack.push(next[i])
            }
        }

        return visible
    }

    function insert(offset: number, text: string): CRDTOperation[] {
        const visible = visibleNodes()

        if (
            !Number.isInteger(offset) 
            || offset < 0 
            || offset > visible.length
        ) {
            throw new RangeError('插入位置超出文档范围')
        }

        let after: CharId | null = visible[offset - 1]?.id ?? null
        const operations: CRDTOperation[] = []

        for (let i = 0; i < text.length; i++) {
            counter += 1

            const operation: CRDTOperation = {
                type: 'insert',
                id: { clientId, counter },
                after: after ? { ...after } : null,
                value: text[i]
            }
            apply(operation)
            operations.push(operation)
        
            // 连续插入时，下一个字符跟在当前字符后面。
            after = operation.id
        }

        return operations
    }

    function remove(offset: number, text: string): CRDTOperation[] {
        const visible = visibleNodes()

        if (
            !Number.isInteger(offset) 
            || offset < 0 
            || offset + text.length > visible.length
        ) {
            throw new RangeError('删除位置超出文档范围')
        }

        // 待删除的可见字符
        const targets = visible.slice(offset, offset + text.length)

        if (targets.map(node => node.value).join('') !== text) {
            throw new Error('删除内容不匹配：Slate 与 CRDT 已不同步')
        }

        return targets.map((node) => {
            const operation: CRDTOperation = {
                type: 'delete',
                id: { ...node.id }
            }

            apply(operation)
            return operation
        })
    }

    function getText() {
        return visibleNodes().map(node => node.value).join('')
    }

    return { insert, remove, getText, apply }
}

