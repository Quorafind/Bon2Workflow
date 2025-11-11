# Typst 代码块渲染功能 - 执行计划

## 📋 任务概述

**目标**：在 Obsidian 中支持直接内嵌 typst 代码块并实时渲染为 SVG

**技术方案**：使用 `@myriaddreamin/typst.ts` WASM 库实现客户端渲染

---

## 🎯 核心需求

1. ✅ 阅读模式中渲染 typst 代码块为 SVG
2. ✅ 编辑模式实时预览（可选，后期实现）
3. ✅ 缓存编译结果提升性能
4. ✅ 友好的错误处理和显示

---

## 🏗️ 架构设计

```
TypstWasmRenderer (核心渲染引擎)
    ↓
    ├─→ 阅读模式: registerMarkdownCodeBlockProcessor('typst')
    └─→ 编辑模式: CodeMirror 扩展 (可选)
```

### 新增文件

- `src/typst/typstCache.ts` - 编译结果缓存管理
- `src/typst/typstWasmRenderer.ts` - WASM 渲染引擎
- `src/typst/typstCodeBlockProcessor.ts` - 代码块处理器

### 修改文件

- `src/main.ts` - 注册代码块处理器
- `src/typst/typstSettings.ts` - 扩展设置项
- `src/typst/typstSettingTab.ts` - 添加设置界面
- `styles.css` - 添加样式

---

## 📦 实施步骤

### 阶段 1：环境准备
- [x] 安装 `@myriaddreamin/typst.ts` 依赖

### 阶段 2：核心引擎
- [ ] 实现 `TypstCache` 类（LRU 缓存）
- [ ] 实现 `TypstWasmRenderer` 类（WASM 编译器）

### 阶段 3：代码块处理器
- [ ] 创建 `createTypstCodeBlockProcessor` 函数
- [ ] 在 `main.ts` 中注册处理器

### 阶段 4：设置界面
- [ ] 扩展 `TypstSettings` 接口
- [ ] 添加设置项 UI

### 阶段 5：集成
- [ ] 在主插件类中初始化渲染器
- [ ] 处理加载和卸载逻辑

### 阶段 6：样式优化
- [ ] 添加 CSS 样式
- [ ] 优化错误显示

### 阶段 7：测试验证
- [ ] 创建测试文件
- [ ] 手动测试所有场景

---

## 🔑 关键技术点

1. **缓存策略**：使用 SHA-256 哈希代码内容作为缓存键
2. **错误处理**：捕获编译错误并格式化显示
3. **性能优化**：LRU 缓存 + 防抖编译
4. **样式适配**：使用 CSS 变量适配主题

---

## ⚠️ 注意事项

- WASM 首次加载需要时间，需要处理加载状态
- 字体支持可能需要额外配置
- 缓存大小需要合理设置避免内存溢出

---

## 📊 预期成果

- 用户可在 Markdown 中使用 typst 代码块
- 代码块自动渲染为 SVG（矢量图）
- 编译结果缓存，重复访问无延迟
- 编译错误友好展示

---

**创建时间**: 2025-11-11
**负责人**: AI Assistant
**状态**: 执行中
