"use client";

import { useEffect, useRef, useState } from "react";
import { createEditor, type Descendant } from "slate";
import { Editable, Slate, withReact } from "slate-react";
import { createTextCRDT } from '@/crdt'

const initialValue: Descendant[] = [
  { type: "paragraph", children: [{ text: "" }] },
];

export default function Editor() {
  // const [editor] = useState(() => withReact(createEditor()));

  const [editor] = useState(() => {
    const editor = withReact(createEditor());
    const originalApply = editor.apply;

    let crdt: ReturnType<typeof createTextCRDT> | null = null

    // 本章限定单段落纯文本：回车不新增段落
    editor.insertBreak = () => {}
    editor.insertSoftBreak = () => {}

    // 粘贴时使用纯文本，多行内容合并为一行。
    editor.insertData = (data) => {
      const text = data.getData('text/plain').replace(/\r\n|\r|\n/g, ' ')
      editor.insertText(text)
    }


    editor.apply = (operation) => {
      console.log("[Slate] 操作：", operation);
      if (operation.type === 'remove_text' || operation.type === 'insert_text') {

        if (
          operation.path.length !== 2 || 
          operation.path[0] !== 0 || 
          operation.path[1] !== 0
        ) {
          throw new Error("本章只支持第一个段落中的单个文本节点");
        }

        // 第一次编辑时创建；之后一直使用同一个副本
        if (!crdt) {
          crdt = createTextCRDT(crypto.randomUUID())
        }

        const operations = operation.type === 'insert_text'
          ? crdt.insert(operation.offset, operation.text)
          : crdt.remove(operation.offset, operation.text);

        originalApply(operation);

        console.log('[CRDT] 生成操作：', operations);
        console.log('[CRDT] 文本：', crdt.getText());

        return
      }

      originalApply(operation);
    }

    return editor
  })




  const [status, setStatus] = useState("连接中");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socketUrl = new URL("/ws", window.location.href);
    socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.onopen = () => setStatus("已连接");
    socket.onclose = () => setStatus("已断开");
    socket.onerror = () => setStatus("连接失败，请刷新页面重试");
    socket.onmessage = (event) => {
      console.log("[WebSocket] 收到消息：", event.data);
      // TODO: 在这里接入你自己的 CRDT 合并逻辑，再更新 Slate。
    };

    return () => {
      socketRef.current = null;
      socket.onopen = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;

      // React 开发模式会重复执行 effect，等待握手完成后再关闭。
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener("open", () => socket.close(), { once: true });
      } else {
        socket.close();
      }
    };
  }, []);

  return (
    <>
      <p className="connection" role="status">WebSocket：{status}</p>
      <Slate
        editor={editor}
        initialValue={initialValue}
        onChange={() => {
          // TODO: 从 editor.operations 获取操作，转换为你定义的 CRDT 操作。
          // TODO: 通过 socketRef.current 发送消息；处理本地与远端操作的区分。
        }}
      >
        <Editable
          className="editor"
          aria-label="文档内容"
          placeholder="从这里开始输入…"
          renderElement={({ attributes, children }) => (
            <p {...attributes}>{children}</p>
          )}
        />
      </Slate>
    </>
  );
}
