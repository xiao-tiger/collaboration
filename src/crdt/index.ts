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

export function createTextCRDT(clientId: string) {
    let counter = 0
    const nodes: CharNode[] = []

    function visibleNodes() {
        return nodes.filter(node => !node.deleted)
    }

    function insert(offset: number, text: string): CRDTOperation[] {
        const visible = visibleNodes()

        if (!Number.isInteger(offset) || offset < 0 || offset > visible.length) {
            throw new RangeError('插入位置超出文档范围')
        }


        // 找到插入位置的左边的可见字符
        let previous: CharNode | null = visible[offset - 1] ?? null
        // 可见文本的位置，转换成内部数组的位置
        let position = previous ? nodes.indexOf(previous) + 1 : 0

        const operations: CRDTOperation[] = []

        for (let i = 0; i < text.length; i++) {
            counter += 1

            const node: CharNode = {
                id: { clientId, counter },
                after: previous ? previous.id : null,
                value: text[i],
                deleted: false
            }

            nodes.splice(position, 0, node)
            operations.push({
                type: 'insert',
                id: node.id,
                after: node.after,
                value: node.value
            })

            previous = node
            position += 1
        }

        return operations
    }

    function remove(offset: number, text: string): CRDTOperation[] {
        const visible = visibleNodes()

        if (!Number.isInteger(offset) || offset < 0 || offset + text.length > visible.length) {
            throw new RangeError('删除位置超出文档范围')
        }

        // 待删除的可见字符
        const targets = visible.slice(offset, offset + text.length)

        if (targets.map(node => node.value).join('') !== text) {
            throw new Error('删除内容不匹配：Slate 与 CRDT 已不同步')
        }

        return targets.map(node => {
            node.deleted = true

            return {
                type: 'delete',
                id: node.id
            }
        })
    }

    function getText() {
        return visibleNodes().map(node => node.value).join('')
    }

    return { insert, remove, getText }
}