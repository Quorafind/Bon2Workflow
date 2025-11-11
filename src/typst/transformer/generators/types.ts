import type { Content } from "mdast";

export type RenderChildren = (children: Content[]) => string;
