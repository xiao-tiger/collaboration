import { Editor, Node, type Operation } from 'slate'
import type { VisibleChar } from '../crdt'
import type { connectDocument } from './client'

type Session = ReturnType<typeof connectDocument>

export function withCollaboration(editor: Editor) {
    const originalApply = editor.apply

    let session: Session | null = null
    let visible: VisibleChar[] = []

    let applyingRemote = false

    editor.insertBreak = () => {}
    editor.insertSoftBreak = () => {}

    editor.insertData = (data) => {
        const text = data.getData('text/plain').replace(/\r\n|\r|\n/g, ' ')
        editor.insertText(text)
    }

    editor.apply = (operation) => {
        if (
            applyingRemote ||
            (
                operation.type !== "insert_text" &&
                operation.type !== "remove_text"
            )
        ) {
            originalApply(operation);
            return;
        }

        if (!session?.isReady()) return

        if (
            operation.path.length !== 2 ||
            operation.path[0] !== 0 ||
            operation.path[1] !== 0
        ) {
            throw new Error("当前只支持一个段落中的单个文本节点");
        }

        if (Node.string(editor) !== session.getText()) {
            throw new Error("Slate 与 CRDT 已不同步");
        }

        if (operation.type === "insert_text") {
            session.insert(operation.offset, operation.text);
        } else {
            session.remove(operation.offset, operation.text);
        }

        originalApply(operation);

        // 本地修改后，也要更新快照。
        visible = session.getVisibleChars();
    }

    function  receive(next: VisibleChar[]) {
        const nextKeys = new Set(next.map(char => char.key))
        const kept: VisibleChar[] = []
        const patches: Operation[] = []

        let offset = 0

        // 第一步：删除新文档中已经不存在的字符。
        for (const char of visible) {
            if (nextKeys.has(char.key)) {
                kept.push(char)
                offset++
            } else {
                patches.push({
                    type: 'remove_text',
                    path: [0, 0],
                    offset,
                    text: char.value
                })
            }
        }

        // 第二步：在保留下来的字符之间插入新字符。
        let index = 0
        for (let offset = 0; offset < next.length; offset++) {
            const char = next[offset]

            if (kept[index]?.key === char.key) {
                index++
            } else {
                patches.push({
                    type: 'insert_text',
                    path: [0, 0],
                    offset,
                    text: char.value
                })
            }
        }

        if (index !== kept.length) {
            throw new Error('已有字符的相对顺序意外改变')
        }

        applyingRemote = true

        try {
            Editor.withoutNormalizing(editor, () => {
                for (const patch of patches) {
                    editor.apply(patch)
                }
            })

            visible = next
        } finally {
            applyingRemote = false
        }

    }

    return {
        editor,

        receive,

        attach(next: Session | null) {
            session = next
        }
    }
}

