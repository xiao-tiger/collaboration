import type { BaseEditor } from "slate";
import type { ReactEditor } from "slate-react";

type Paragraph = { type: "paragraph"; children: { text: string }[] };

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: Paragraph;
    Text: { text: string };
  }
}
