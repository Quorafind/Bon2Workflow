# Bon^2 Workflow

一个完全基于 Boninall 工作流的小插件。

长久以来，我一直涌现了非常多的细小的 Obsidian 改进想法，这些想法有些时候太小以至于不应该将它们单独为一个插件发布，但是我又时常需要这些小改进。

于是，我决定将这些小改进集成到一个插件中，这就是 bon2workflow。

在设想中，Bon^2 Workflow 会拥有非常多的糖果级的小功能。（倒也不一定是小功能）

## 文件浏览器

- 支持在选中的文件夹中搜索。右键点击文件夹并选择"在选中文件夹中搜索"即可在该文件夹中进行搜索。
- 支持在选中的文件中搜索。右键点击文件并选择"在选中文件中搜索"即可在该文件中进行搜索。
- 支持文件夹任务状态标记（根目录下的 TODO.md 文件中使用 `- [ ] 文件夹名称` 可以将文件夹标记为待办）
- 支持在状态栏显示总字符数/今日字符数。

## Callout

- 为 callout 图标添加一个下拉菜单，以更改 callout 类型。

### Text counter

- 支持在状态栏显示总字符数/今日字符数。

## Typst (大糖果 🍬)

一个为 Obsidian 打造的全面 Typst 集成工具箱，支持无缝的 Markdown 到 Typst 转换和文档导出。

### 功能特性

- **Markdown 到 Typst 转换**：智能地将 Markdown 笔记转换为 Typst 格式
  - **AST 模式**：使用 unified AST 解析器自动转换，完全支持 Obsidian 语法
  - **脚本模式**：使用 JavaScript 脚本自定义转换，支持沙箱化执行

- **内联 Typst 渲染**：直接在笔记中嵌入 Typst 代码块，实时 SVG 渲染
  ````
  ```typst
  #set text(font: "New Computer Modern")
  #align(center)[
    = Hello Typst
  ]
  ```
  ````

- **文档导出**：将转换后的文档导出为多种格式
  - PDF 导出（需要 Typst CLI）
  - PNG 导出（需要 Typst CLI）
  - SVG 导出（基于 WASM，未导入包时无需 CLI / 使用 CLI 如果需要使用外部包）

- **实时预览**：提供实时预览面板，编辑时自动更新
- **全局 API**：以编程方式访问 Typst 转换能力
  ```javascript
  // 将 Markdown 转换为 Typst
  const typst = await window.bon.typst.convertAsync("# Hello World");

  // 列出可用的脚本
  const scripts = window.bon.typst.listScripts();

  // 执行自定义脚本
  const result = window.bon.typst.executeScript("my-script", content);
  ```

- **自定义脚本管理**：创建和管理自定义转换脚本
  - 内置脚本编辑器，支持语法高亮
  - 基于 frontmatter 的脚本选择
- **Typst CLI 集成**：自动检测并集成 Typst CLI 以支持高级功能

### 配置选项

- **触发标签**：定义自动启用 Typst 转换的标签
- **自动编译**：文件变化时自动编译为 PDF/PNG
- **转换模式**：在基于 AST 或基于脚本的转换之间选择
- **脚本映射**：将目录映射到特定的转换脚本
- **最大嵌入深度**：控制嵌入内容的处理深度

### 使用方法

1. 在插件设置中启用 Typst
2. 在笔记的 frontmatter 中添加触发标签（例如：`tags: ["bon-typst"]`）
3. 正常编辑 Markdown 内容
4. 查看实时预览或导出为 PDF/PNG/SVG
5. （可选）为特殊转换需求创建自定义脚本
6. 通过 `typst-script: <script-name>` 选择脚本
