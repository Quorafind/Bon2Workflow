# Bon^2 Workflow

A plugin for Obsidian, based on Boninall's workflow.

[中文文档](README_CN.md)

Over time, I have had many small ideas for improving Obsidian. Sometimes these ideas are too small to warrant publishing as standalone plugins, but I still frequently need these minor improvements.

So, I decided to integrate these small improvements into one plugin, and that's what Bon^2 Workflow is.

In my imagination, Bon^2 Workflow will have a lot of candy-level small features. (Sometimes not small features)

## File Explorer

- Supports searching within selected folders. Right-click a folder and select "Search in selected folder" to search within it.
- Supports searching within selected files. Right-click a file and select "Search in selected file" to search within it.
- Supports folder task status marking (Adding `- [ ] folder name` in the root TODO.md file will mark that folder as a TODO)
- Supports total character count/daily character count in the status bar.

## Callout

- Add a dropdown to the callout icon to change the callout type.

### Text counter

- Supports total character count/daily character count in the status bar.

## Typst (Big Candy 🍬)

A comprehensive Typst integration toolbox for Obsidian, enabling seamless Markdown-to-Typst conversion and document export.

### Features

- **Markdown to Typst Conversion**: Convert your Markdown notes to Typst format with intelligent transformation
  - **AST Mode**: Automatic conversion using unified AST parser with full Obsidian syntax support
  - **Script Mode**: Customizable transformation using JavaScript scripts with sandboxed execution

- **Inline Typst Rendering**: Embed Typst code blocks directly in your notes with real-time SVG rendering
  ````
  ```typst
  #set text(font: "New Computer Modern")
  #align(center)[
    = Hello Typst
  ]
  ```
  ````

- **Document Export**: Export your converted documents to multiple formats
  - PDF export (requires Typst CLI)
  - PNG export (requires Typst CLI)
  - SVG export (WASM-based, no CLI required if no package imported / use CLI if you want to use external packages)
- **Live Preview**: Real-time preview pane with automatic updates as you edit
- **Global API**: Access Typst conversion capabilities programmatically
  ```javascript
  // Convert Markdown to Typst
  const typst = await window.bon.typst.convertAsync("# Hello World");

  // List available scripts
  const scripts = window.bon.typst.listScripts();

  // Execute custom script
  const result = window.bon.typst.executeScript("my-script", content);
  ```

- **Custom Script Management**: Create and manage custom transformation scripts
  - Built-in script editor
  - Frontmatter-based script selection
- **Typst CLI Integration**: Automatic detection and integration with Typst CLI for advanced features

### Configuration

- **Trigger Tags**: Define tags that automatically enable Typst conversion for specific notes
- **Auto-compile**: Automatically compile to PDF/PNG when files change
- **Transform Mode**: Choose between AST-based or script-based transformation
- **Script Mappings**: Map folders to specific transformation scripts
- **Max Embed Depth**: Control the depth of embedded content processing

### Usage

1. Enable Typst in plugin settings
2. Add trigger tags to your note's frontmatter (e.g., `tags: ["bon-typst"]`)
3. Edit your Markdown content normally
4. View the live preview or export to PDF/PNG/SVG
5. (Optional) Create custom scripts for specialized transformation needs
6. Use `typst-script: <script-name>` in frontmatter to use a custom script
