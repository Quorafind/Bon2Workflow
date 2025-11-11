# Typst Script Development Guide

This document provides detailed development guidance for Typst script developers targeting the Bon-Workflow plugin.

---

## 📚 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Script System Architecture](#script-system-architecture)
4. [Injected Global Methods](#injected-global-methods)
5. [Script Writing Guide](#script-writing-guide)
6. [Complete Examples](#complete-examples)
7. [Debugging Tips](#debugging-tips)
8. [FAQ](#faq)

---

## Overview

### What is a Typst Script?

A Typst script is a custom converter written in JavaScript. It allows you to implement **complex, custom logic** in the Markdown → Typst conversion process.

### Why use scripts?

**Built-in AST converter is suitable for:**
- ✅ Standard Markdown syntax conversion
- ✅ Basic formatting

**Custom scripts are suitable for:**
- ✅ Complex document structures (e.g., patent reports, Cornell notes)
- ✅ YAML metadata processing
- ✅ Custom table layouts
- ✅ Special business logic

### Key Advantages

- **Preprocessor + AST hybrid mode:** Scripts handle business logic, calling the built-in AST as needed for standard Markdown.
- **No need to reinvent the wheel:** Reuse the plugin's built-in Markdown conversion capabilities.
- **Fully controllable:** Generate any complexity of Typst code as needed.

---

## Quick Start

### 1. Create Script Files

Place your script files in the `typst-scripts/` folder under your vault root:

```
your-vault/
├── typst-scripts/
│   ├── default.js          # Default script (created automatically)
│   ├── cornell-notes.js    # Cornell note script
│   └── patent-report.js    # Patent report script
└── your-note.md
```

### 2. Basic Script Structure

```javascript
/**
 * Script Name: Example Script
 * Description: Convert Markdown to Typst
 */
async function transform(content) {
    // 1. Process input
    const processed = processYourLogic(content);

    // 2. Call built-in converter (optional)
    const typstPart = await convertToTypst(processed);

    // 3. Return Typst code
    return typstPart;
}
```

### 3. Specify Script in Markdown

**Method 1: Specify in Frontmatter**
```yaml
---
tags: [bon-typst]
typst-script: cornell-notes  # Use cornell-notes.js
---

# Your content
```

**Method 2: Directory Mapping**
Configure directory mapping in plugin settings:
```
projects/patents/ → patent-report
notes/learning/   → cornell-notes
```

**Method 3: No specification (default)**
If no script is specified, the built-in AST converter is used automatically.

---

## Script System Architecture

### Execution Flow

```
┌─────────────────────────────────────────────────┐
│  Markdown File                                 │
│  ─────────────────────────                     │
│  ---                                           │
│  typst-script: your-script                     │
│  ---                                           │
│  ## Title                                      │
│  Content...                                    │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│  Script System                                  │
│  ────────────                                   │
│  1. Load typst-scripts/your-script.js           │
│  2. Create sandbox environment                  │
│  3. Inject convertToTypst() function            │
│  4. Run transform(content)                      │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│  Your Script (your-script.js)                   │
│  ──────────────────────────                     │
│  async function transform(content) {            │
│      // Parse YAML                              │
│      const data = parseYAML(content);           │
│                                                 │
│      // Build custom structure                  │
│      let typst = generateTable(data);           │
│                                                 │
│      // Call injected method for Markdown       │
│      const cell = await convertToTypst(data.x); │
│                                                 │
│      return typst;                              │
│  }                                              │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│  Typst Code                                     │
│  ──────────                                     │
│  #table(                                        │
│    columns: (30%, 70%),                         │
│    [*Title*], [Content],                        │
│  )                                              │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│  Output Compilation                             │
│  ────────────────                               │
│  - CLI: produce PDF/PNG/SVG                     │
│  - WASM: instant preview (no external deps)      │
└─────────────────────────────────────────────────┘
```

### Mode Switching Logic

```javascript
// Inside plugin (automatic)
if (frontmatter["typst-script"] || directoryMapping[folderPath]) {
    // Use script mode
    executeScript(scriptName, markdown);
} else {
    // Use built-in AST mode
    useBuiltinAstConverter(markdown);
}
```

---

## Injected Global Methods

### `convertToTypst(markdown: string): Promise<string>`

**Purpose:** Converts Markdown content to Typst format (via built-in AST converter)

**Use cases:**
- Handle standard Markdown syntax (headings, bold, italic, links, etc.)
- Handle Obsidian-specific syntax (Wiki links, highlights)
- Handle code blocks, lists, blockquotes, etc.

**Parameters:**
- `markdown` (string): The Markdown content to convert

**Return:**
- `Promise<string>`: The converted Typst code

**Example:**

```javascript
async function transform(content) {
    // Scenario 1: Convert entire Markdown document
    const typst = await convertToTypst(content);
    return typst;

    // Scenario 2: Convert part of the content
    const intro = extractIntro(content);
    const introTypst = await convertToTypst(intro);

    // Scenario 3: Convert table cell
    const cell1 = await convertToTypst("**Bold** and *Italic*");
    // Returns: *Bold* and _Italic_

    // Scenario 4: Handle lists
    const listMd = "- Item1\n- Item2\n- Item3";
    const listTypst = await convertToTypst(listMd);

    return `#table([${cell1}], [${listTypst}])`;
}
```

**Supported Markdown syntax:**

| Markdown         | Typst Output         | Notes                |
|------------------|---------------------|----------------------|
| `# Heading`      | `= Heading`         | All heading levels   |
| `**bold**`       | `*bold*`            | Bold                 |
| `*italic*`       | `_italic_`          | Italic               |
| `` `code` ``     | `` `code` ``        | Inline code          |
| `[link](url)`    | `#link("url")[link]`| Hyperlink            |
| `![img](url)`    | `#image("url")`     | Image                |
| `==highlight==`  | `#highlight[highlight]`| Obsidian highlight |
| `[[Wiki Link]]`  | `Wiki Link`         | Obsidian wiki link   |
| `- [ ] Task`     | `☐ Task`            | Task list            |

**Notes:**

1. **Special character escaping:** `convertToTypst()` handles most special characters, but `<` and `>` may need postprocessing.
   ```javascript
   function postProcessTypst(typst) {
       return typst
           .replace(/([^\\])</g, "$1\\<")
           .replace(/([^\\])>/g, "$1\\>");
   }

   const result = postProcessTypst(await convertToTypst(content));
   ```

2. **Async usage required:** Must use `await`
   ```javascript
   // ❌ Incorrect
   const typst = convertToTypst(content);

   // ✅ Correct
   const typst = await convertToTypst(content);
   ```

3. **Batch calls:** Can use in a loop
   ```javascript
   const results = [];
   for (const item of items) {
       const typst = await convertToTypst(item);
       results.push(typst);
   }
   ```

---

## Script Writing Guide

### 1. Script Template

```javascript
/**
 * Script name
 * Description
 * @param {string} content - Markdown file content
 * @returns {Promise<string>} - Typst formatted content
 */
async function transform(content) {
    // ============ Utility Functions ============

    function parseYAML(text) {
        // Parse YAML frontmatter
    }

    function extractSection(text, sectionName) {
        // Extract specific section
    }

    function escapeTypst(text) {
        // Escape Typst special characters
        if (!text) return "";
        return text
            .replace(/\\/g, "\\\\")
            .replace(/#/g, "\\#")
            .replace(/\*/g, "\\*")
            .replace(/_/g, "\\_")
            .replace(/</g, "\\<")
            .replace(/>/g, "\\>");
    }

    // ============ Main Logic ============

    try {
        // 1. Parse input
        const data = parseYAML(content);

        // 2. Business logic
        const sections = extractSections(content);

        // 3. Convert Markdown syntax (as needed)
        const processedSections = [];
        for (const section of sections) {
            const typst = await convertToTypst(section);
            processedSections.push(typst);
        }

        // 4. Generate Typst document
        let typstContent = `
#set page(paper: "a4")
#set text(size: 10pt, lang: "zh")

// Your custom structure
${processedSections.join("\n\n")}
`;

        return typstContent;

    } catch (error) {
        throw new Error(`Conversion failed: ${error.message}`);
    }
}
```

### 2. Best Practices

#### ✅ DO - Recommended

**1. Use `async/await`**
```javascript
async function transform(content) {
    const result = await convertToTypst(content);
    return result;
}
```

**2. Clear error handling**
```javascript
try {
    const result = await convertToTypst(content);
    return result;
} catch (error) {
    throw new Error(`Conversion failed: ${error.message}`);
}
```

**3. Reuse built-in converter**
```javascript
// ✅ Good: reuse built-in conversion
const markdownPart = "**Important**: Content here";
const typstPart = await convertToTypst(markdownPart);

// ❌ Bad: manually reimplementing
const typstPart = markdownPart.replace(/\*\*(.+?)\*\*/g, "*$1*");
```

**4. Modularize utility functions**
```javascript
// Define utilities separately
function parseYAML(text) { /* ... */ }
function extractSection(text, name) { /* ... */ }
function escapeTypst(text) { /* ... */ }

// Main logic is clear
async function transform(content) {
    const data = parseYAML(content);
    const section = extractSection(content, "Notes");
    const typst = await convertToTypst(section);
    return escapeTypst(typst);
}
```

**5. Use template strings**
```javascript
// ✅ Readable
const typst = `
#table(
  columns: (30%, 70%),
  [${title}], [${content}]
)
`;

// ❌ Unmaintainable
const typst = "#table(\n  columns: (30%, 70%),\n  [" + title + "], [" + content + "]\n)";
```

#### ❌ DON'T - Avoid

**1. Don't use synchronous version**
```javascript
// ❌ Wrong: transform must be async
function transform(content) {
    return convertToTypst(content);  // Returns a Promise, not a string!
}

// ✅ Correct
async function transform(content) {
    return await convertToTypst(content);
}
```

**2. Don't access global objects**
```javascript
// ❌ Wrong: globals unavailable in sandbox
const fs = require('fs');
window.alert('Hello');
global.myVar = 123;

// ✅ Correct: use only injected functions
const typst = await convertToTypst(content);
```

**3. Don't forget special character escaping**
```javascript
// ❌ Wrong: < > not escaped may cause Typst compile error
return `[Fineness<15um]`;

// ✅ Correct: escape special characters
return `[Fineness\\<15um]`;
```

**4. Don't use forEach + async**
```javascript
// ❌ Wrong: forEach doesn't support async properly
items.forEach(async (item) => {
    await convertToTypst(item);  // Won't run as expected
});

// ✅ Correct: use for...of
for (const item of items) {
    await convertToTypst(item);
}

// ✅ Correct: use Promise.all (parallel)
await Promise.all(items.map(item => convertToTypst(item)));
```

### 3. Common Patterns

#### Pattern 1: Table Generation

```javascript
async function transform(content) {
    const rows = parseRows(content);

    let tableRows = [];
    for (const row of rows) {
        const cell1 = await convertToTypst(row.col1);
        const cell2 = await convertToTypst(row.col2);
        tableRows.push(`[${cell1}], [${cell2}]`);
    }

    return `
#table(
  columns: (30%, 70%),
  ${tableRows.join(",\n  ")}
)
`;
}
```

#### Pattern 2: Conditional Conversion

```javascript
async function transform(content) {
    const sections = parseSections(content);

    let result = "";
    for (const section of sections) {
        if (section.useMarkdown) {
            // Use built-in converter
            result += await convertToTypst(section.content);
        } else {
            // Use raw content
            result += escapeTypst(section.content);
        }
    }

    return result;
}
```

#### Pattern 3: Nested Structure

```javascript
async function transform(content) {
    const chapters = parseChapters(content);

    let typst = "";
    for (const chapter of chapters) {
        typst += `\n= ${escapeTypst(chapter.title)}\n\n`;

        for (const section of chapter.sections) {
            const sectionTypst = await convertToTypst(section.content);
            typst += `== ${escapeTypst(section.subtitle)}\n${sectionTypst}\n\n`;
        }
    }

    return typst;
}
```

---

## Complete Examples

### Example 1: Cornell Note Script

**Purpose:** Convert structured notes to a Cornell note format

**Input Markdown:**
```markdown
---
title: Study Notes
typst-script: cornell-notes
---

## Cues
- Keyword1
- Question?

## Notes
Detailed notes, supports **bold** and *italic*.

## Summary
This is the summary.
```

**Script Implementation:**
```javascript
async function transform(content) {
    // Extract all three sections
    const cues = extractSection(content, "Cues");
    const notes = extractSection(content, "Notes");
    const summary = extractSection(content, "Summary");

    // Convert Markdown
    const cuesTypst = await convertToTypst(cues);
    const notesTypst = await convertToTypst(notes);
    const summaryTypst = await convertToTypst(summary);

    // Generate table
    return `
#table(
  columns: (30%, 70%),

  // Header row
  table.cell(fill: rgb("#f0f0f0"), [*Cues*]),
  table.cell(fill: rgb("#f0f0f0"), [*Notes*]),

  // Content row
  [${cuesTypst}],
  [${notesTypst}],

  // Summary row (colspan)
  table.cell(colspan: 2, fill: rgb("#f8f8f8"), [
    *Summary*
    ${summaryTypst}
  ])
)
`;
}
```

### Example 2: Patent Report Script

**Purpose:** Parse YAML metadata to generate a complex patent search record table

**Features:**
- Parses YAML frontmatter
- Dynamically generates table rows
- Handles multiple comparison files
- Reuses Markdown conversion capability

**Full code:** See `typst-scripts/patent-report.js`

---

## Debugging Tips

### 1. Use console.log (development only)

```javascript
async function transform(content) {
    console.log("Input content:", content);

    const result = await convertToTypst(content);
    console.log("Converted result:", result);

    return result;
}
```

**View logs:**  
Open Obsidian Dev Tools (Ctrl+Shift+I) and check the Console panel.

### 2. Error Prompt

```javascript
async function transform(content) {
    try {
        if (!content) {
            throw new Error("Input content is empty");
        }

        const sections = extractSections(content);
        if (sections.length === 0) {
            throw new Error("No sections found, check Markdown format");
        }

        return await convertToTypst(content);

    } catch (error) {
        // Provide detailed error info
        throw new Error(`[Cornell Note Script] ${error.message}`);
    }
}
```

### 3. Incremental Development

**Step 1: Just return raw content**
```javascript
async function transform(content) {
    return content;  // Test if script is being called
}
```

**Step 2: Test convertToTypst**
```javascript
async function transform(content) {
    const result = await convertToTypst(content);
    return result;  // Test conversion result
}
```

**Step 3: Add business logic step by step**
```javascript
async function transform(content) {
    const sections = extractSections(content);  // First test parsing
    console.log("Extracted sections:", sections);

    const result = await convertToTypst(sections[0]);
    return result;
}
```

### 4. Check Output Typst Code

After conversion, check the generated `.typ` file for:
- Correct syntax
- Properly escaped special characters
- Structure as intended

---

## Frequently Asked Questions

### Q1: The script isn't running, only default conversion happens?

**Possible causes:**
1. Typo in the `typst-script` frontmatter field
2. Script file does not exist or filename mismatch
3. Script file is not in the `typst-scripts/` directory

**Solution:**
```markdown
---
tags: [bon-typst]
typst-script: cornell-notes  # Make sure it's correct, no .js suffix
---
```

Check file path:
```
your-vault/
└── typst-scripts/
    └── cornell-notes.js  # Name must match!
```

---

### Q2: Compile error "unclosed label" or "unknown syntax"

**Possible cause:**  
Special characters `<` `>` not escaped

**Solution:**  
Add post-processing function:

```javascript
function postProcessTypst(typst) {
    const ESCAPED_LT = "___LT___";
    const ESCAPED_GT = "___GT___";

    return typst
        .replace(/\\</g, ESCAPED_LT)
        .replace(/\\>/g, ESCAPED_GT)
        .replace(/</g, "\\<")
        .replace(/>/g, "\\>")
        .replace(new RegExp(ESCAPED_LT, "g"), "\\<")
        .replace(new RegExp(ESCAPED_GT, "g"), "\\>");
}

// Usage
const typst = postProcessTypst(await convertToTypst(content));
```

---

### Q3: `convertToTypst` returns `[object Promise]`

**Possible cause:**  
Forgot to use `await`

**Incorrect:**
```javascript
function transform(content) {  // ❌ Not async
    const typst = convertToTypst(content);  // ❌ Missing await
    return typst;
}
```

**Correct:**
```javascript
async function transform(content) {  // ✅ async
    const typst = await convertToTypst(content);  // ✅ await
    return typst;
}
```

---

### Q4: How do I handle Chinese fonts?

**Problem:**  
Typst may not include Chinese fonts by default

**Solution:**  
Remove the `font` parameter so Typst uses the default font:

```javascript
// ❌ May cause missing font
#set text(font: "STSong", size: 10pt, lang: "zh")

// ✅ Use default font
#set text(size: 10pt, lang: "zh")
```

Or install the font on your system.

---

### Q5: How do I access file metadata in the script?

**A:** Scripts only receive the `content` string (full Markdown including frontmatter).

To access metadata, parse YAML in the script:

```javascript
function parseYAML(text) {
    const match = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) return {};

    const yaml = match[1];
    const metadata = {};

    yaml.split("\n").forEach(line => {
        if (line.includes(":")) {
            const [key, value] = line.split(":");
            metadata[key.trim()] = value.trim();
        }
    });

    return metadata;
}
```

---

### Q6: How do I debug script execution?

**Method 1: Use console.log**
```javascript
async function transform(content) {
    console.log("Script started");
    console.log("Input content length:", content.length);

    const result = await convertToTypst(content);

    console.log("Conversion done, output length:", result.length);
    return result;
}
```

**Method 2: Check generated .typ file**
Open the generated `.typ` file and check its content.

**Method 3: Use WASM Preview**
In WASM preview mode, you get instant rendered output without waiting for CLI compile.

---

### Q7: Why is my script slow?

**Possible causes:**
1. Repeated `convertToTypst()` calls on large content
2. Complex regular expressions or loops

**Optimization advice:**

**1. Batch processing**
```javascript
// ❌ Slow: process one by one
for (const item of items) {
    const typst = await convertToTypst(item);
    results.push(typst);
}

// ✅ Fast: combine and process (if suitable)
const combined = items.join("\n\n");
const typst = await convertToTypst(combined);
```

**2. Only convert necessary parts**
```javascript
// ❌ Convert the whole document
const typst = await convertToTypst(content);

// ✅ Only convert the section needing Markdown treatment
const section = extractSection(content, "Notes");
const typst = await convertToTypst(section);
```

---

## Reference Resources

### Typst Syntax Reference

- **Official docs:** https://typst.app/docs/
- **Standard library:** https://typst.app/docs/reference/
- **Examples:** https://typst.app/docs/examples/

### Useful Typst Code Snippets

**Table:**
```typst
#table(
  columns: (1fr, 2fr),
  [Col1], [Col2],
  [Content1], [Content2]
)
```

**Page settings:**
```typst
#set page(
  paper: "a4",
  margin: (left: 2cm, right: 2cm, top: 2cm, bottom: 2cm)
)
```

**Text style:**
```typst
#set text(size: 10pt, lang: "zh")
#set par(justify: true, leading: 0.65em)
```

**Header & Footer:**
```typst
#set page(
  header: [Title],
  footer: [#context counter(page).display("1")]
)
```

---

## Summary

- ✅ **Scripts must be async functions** - `async function transform(content)`
- ✅ **Use the injected `convertToTypst()`** - Reuse built-in Markdown conversion logic
- ✅ **Handle special characters** - Escape `<` `>` and other Typst special chars
- ✅ **Clear error reporting** - Provide helpful error info
- ✅ **Modular design** - Separate utility functions from main logic

Happy scripting! 🚀
