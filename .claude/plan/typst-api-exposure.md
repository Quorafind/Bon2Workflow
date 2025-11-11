# Typst API 暴露功能实施计划

## 任务概述

**目标**: 为 Bon-Workflow 插件添加全局 API，通过 `window.bon.typst.convert()` 暴露 Typst 转换能力

**开始时间**: 2025-11-11
**预计工作量**: 3-4 小时
**风险等级**: 🟢 低风险

---

## 需求背景

用户需要在自定义脚本中调用 Typst 转换功能，实现只需要设置布局，然后直接调用函数就能生成完整的 typst 内容。

**关键需求**:
1. 暴露转换能力（而非转换器实例）
2. 支持同步和异步两种调用方式
3. 支持配置选项（transformMode、scriptName、maxEmbedDepth 等）
4. 遵循现有的错误处理和日志机制
5. 提供完整的 TypeScript 类型定义

---

## 技术方案

采用**方案 2：标准化 API 层**

**核心改动**:
- 新增: `src/typst/api.ts` - 标准化 API 封装层
- 新增: `src/typst/types.ts` - 公共类型定义
- 新增: `src/types/window.d.ts` - 全局类型声明
- 修改: `src/main.ts` - 注册全局 API
- 修改: `src/typst/typstConverter.ts` - 提取可复用转换方法

---

## 实施步骤

### 阶段 1: 类型定义和接口设计

#### 1.1 创建 `src/typst/types.ts`
- 定义 `ConvertOptions` 接口
- 定义 `TypstAPIInterface` 接口
- 添加完整的 JSDoc 注释

#### 1.2 创建 `src/types/window.d.ts`
- 声明全局 `window.bon.typst` 类型扩展
- 确保 TypeScript 类型提示正确

### 阶段 2: API 封装层实现

#### 2.1 创建 `src/typst/api.ts`
- 实现 `TypstAPI` 类
- 实现 `convert()` 同步方法
- 实现 `convertAsync()` 异步方法
- 实现 `listScripts()` 辅助方法

### 阶段 3: 提取可复用逻辑

#### 3.1 重构 `src/typst/typstConverter.ts`
- 提取 `convertMarkdown()` 公共方法
- 重构 `convertFile()` 使用新方法
- 保持向后兼容

### 阶段 4: 全局 API 注册

#### 4.1 修改 `src/main.ts`
- 导入 `TypstAPI` 类
- 在 `initializeTypstFeatures()` 中初始化 API
- 在 `onload()` 中注册全局 API
- 在 `unloadTypstFeatures()` 中清理 API

### 阶段 5: 错误处理和边界情况

#### 5.1 完善错误处理
- 添加输入验证
- 统一错误消息格式
- 添加调试日志

### 阶段 6: 文档和注释

#### 6.1 添加 JSDoc 注释
- 为所有公共方法添加完整文档
- 提供使用示例

### 阶段 7: 测试和验证

#### 7.1 手动测试
- 测试同步转换
- 测试异步转换
- 测试配置选项
- 测试边界情况
- 验证现有功能不受影响

---

## 验收标准

1. ✅ `window.bon.typst.convert()` 可正常调用并返回 typst 字符串
2. ✅ `window.bon.typst.convertAsync()` 支持文件和字符串输入
3. ✅ `window.bon.typst.listScripts()` 返回可用脚本列表
4. ✅ 配置选项正常工作
5. ✅ 现有转换功能不受影响
6. ✅ 所有新增代码有 TypeScript 类型定义
7. ✅ 公共方法有完整的 JSDoc 注释
8. ✅ 错误处理统一且明确

---

## 风险控制

| 风险点 | 缓解措施 |
|--------|----------|
| TypstConverter 重构破坏现有功能 | 保持现有方法签名不变，仅提取内部逻辑 |
| 全局 API this 上下文错误 | 使用 `.bind()` 绑定上下文 |
| 错误传播导致插件崩溃 | 所有 API 调用都用 try-catch 包裹 |

---

## 执行日志

- 2025-11-11: 计划创建完成，开始执行
