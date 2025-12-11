<div style="font-size:23px; line-height:2.2;">
<style>
table {
  width: 100%;
  table-layout: fixed;
  overflow-x: auto;
}
th, td {
  padding: 12px;
  text-align: left;
  white-space: normal;
  word-wrap: break-word;
}
</style>

# 软件缺陷分析实验报告

## 1. 概述 (Overview)
本报告总结了对 `server` 项目进行的全面代码缺陷分析结果。实验旨在对比不同分析工具在发现代码缺陷方面的能力。分析涵盖了 Java, JavaScript, HTML, 和 CSS 四种语言，采用了三种不同的分析方法：静态分析、形式化验证和大模型(LLM)分析。

## 2. 工具选择与检测过程 (Tool Selection & Process)

### 2.1 静态分析 (Static Analysis)
静态分析工具通过解析代码的语法树和控制流，在不运行代码的情况下查找常见的编程错误和风格违规。
*   **Java**: 使用 **SpotBugs** (集成在 Maven 中)。
    *   **配置**: 使用默认的 Maven 插件配置，目标是编译后的 `.class` 文件。
    *   **运行方式**: `mvn spotbugs:check`。
*   **JavaScript**: 使用 **ESLint**。
    *   **配置**: 使用标准推荐规则 (`eslint:recommended`)。
    *   **运行方式**: `eslint <file.js>`。
*   **HTML/CSS**: 使用 **HTMLHint** 和 **Stylelint**。
    *   **运行方式**: 命令行直接扫描资源文件。

### 2.2 形式化验证 (Formal Verification)
形式化验证工具使用数学方法（如模型检测）来证明代码在特定属性上的正确性。
*   **Java**: 使用 **JBMC** (Java Bounded Model Checker)。
    *   **原理**: 将 Java 字节码转换为逻辑公式，使用 SAT/SMT 求解器检查是否存在违反断言（如空指针、数组越界）的路径。
    *   **运行方式**: 针对特定类和方法，设置循环展开深度 (Unwind depth) 为 5。命令示例: `jbmc acounting_system.BuggyClass --function nullPointerMethod --unwind 5`
*   **JavaScript**: 使用 **Fakeium** (GitHub上发布的开源项目，动态JS分析环境)
    *   **运行方式**: 通过 Node.js 脚本 `node tools/fakeium/scan_project.js` 扫描项目中的所有 JS 文件

### 2.3 大模型分析 (LLM Analysis)

*   **工具**: **Gemini 3 Pro** 
*   **Prompt 策略**: "分析以下代码中的安全漏洞 (CWE)、逻辑错误和代码风格问题。请特别关注 SQL 注入、XSS 和资源泄漏。将结果以 JSON 格式输出，包含缺陷名称、位置、严重程度和 CWE 编号。"
*   **运行方式**: 将源代码作为上下文提供给 LLM，要求其生成结构化报告。

## 3. 缺陷检测结果与验证 (Findings & Verification)

为了评估工具能力，我们额外在项目中预埋了已知缺陷 **BuggyClass**。以下是各工具对缺陷的检测情况对比：

### 3.1 植入缺陷检测对比表

| 缺陷类型 | 所在文件 | 静态分析 (SpotBugs/ESLint) | 形式化验证 (JBMC) | LLM 分析 (Gemini 3 Pro) | 
| :--- | :--- | :--- | :--- | :--- | 
| **空指针解引用 (NPE)** | **BuggyClass.java** |  **检测到**  |  **检测到** |  **检测到** | 
| **资源泄漏 (未关闭流)** | **BuggyClass.java** |  **检测到** |  未报告 |  **检测到** | 
| **无限循环** | **BuggyClass.java** |  未报告 |  **检测到**  |  **检测到** | 
| **SQL 注入** | **sqloperation.java** |  未报告 |  未报告 |  **检测到** (CWE-89) | 
| **硬编码凭证** | **sqloperation.java** |  **检测到**  |  未报告 |  **检测到** (CWE-798) | 
| **XSS (innerHTML)** | **app.js** |  未报告 |  未报告 |  **检测到** (CWE-79) | 
| **明文传输 (HTTP)** | **proxy/*.js** |  未报告 |  未报告 |  **检测到** (CWE-319) | 

### 3.2 误报情况评估 (False Positive Analysis)

*   **ESLint (高误报率)**:
    *   **现象**: 报告了大量 `no-undef` 错误（如 `Buffer`, `process`, `setTimeout` 未定义）。
    *   **原因**: 工具配置未指定 `Node.js` 运行环境，导致无法识别 Node 全局变量。这是配置问题而非工具缺陷，但也反映了静态工具对环境配置的高度依赖。
*   **SpotBugs (低误报率)**:
    *   **现象**: 报告了一些 "NM_CLASS_NAMING_CONVENTION" (类名不符合 PascalCase 约定)。
    *   **原因**: 这通常被视为风格问题而非 Bug，但在某些项目中是意图之中的。总体准确度较高。
*   **HTMLHint (低误报率)**:
    *   **现象**: 未报告任何误报。
    *   **原因**: HTML 代码结构简单，工具配置合适，未产生误报。
*   **Stylelint (高误报率)**:
    *   **现象**: 报告了大量 "no vendor-prefix"错误，涉及 -webkit- 和 -moz- 等前缀。
    *   **原因**: 虽然现代浏览器支持无前缀属性，但为兼容旧版浏览器仍需使用 vendor prefixes。工具默认规则视其为多余，导致高误报。这是兼容性与现代标准的权衡。
*   **JBMC (高误报率)**:
    *   **现象**: 报告了大量 "Formal-Verification-Failure"，包括理论上的空指针检查和循环展开失败。
    *   **原因**: 形式化验证假设所有可能的输入路径，导致报告许多在实际运行中不会发生的潜在违规。这些是理论上的失败，对开发者来说是噪音，需要人工过滤。

## 4. 工具能力评价与比较 (Evaluation & Comparison)

| 维度 | 静态分析 (Static) | 形式化验证 (Formal) | LLM 分析 |
| :--- | :--- | :--- | :--- |
| **检测速度** | **快**  |  **慢**  |  **快**  |
| **配置难度** | **中** | **中**| **低** |
| **语法/风格检查** |  **优秀** |  **不关注** |  **良好** |
| **逻辑正确性** |  **弱** (简单控制流) |  **最强** (数学证明) |  **强** (语义理解) |
| **安全漏洞 (SAST)** |  **一般** (需特定插件) |  **弱** (主要关注内存安全) |  **优秀** (SQLi, XSS, 业务逻辑) |
| **误报率** | **中**  | **高** (需人工过滤理论违规) | **低** (但在未知库上可能幻觉) |

### 4.1 综合评价
*   **静态分析**: 最适合集成到 CI/CD 流水线中，作为第一道防线，拦截低级错误和风格问题。
*   **形式化验证**: 不适合全项目扫描，但对于核心算法、并发控制或高可靠性模块，它是唯一能提供“无Bug证明”的工具。
*   **LLM 分析**: 它弥补了传统工具在“理解代码意图”上的短板，能发现 SQL 注入、架构设计缺陷等高层级问题，且能提供修复建议。

## 5. 结论 (Conclusion)

### 5.1 项目缺陷总结
`server` 项目目前存在较高的安全风险，主要是 **SQL 注入** 和 **明文传输** 问题。代码健壮性方面，存在 **空指针异常** 和 **资源泄漏** 的隐患。

### 5.2 工具组合
对于类似的中小型 Web 项目，采用以下工具组合较为合理

1.  **日常开发 (Pre-commit/IDE)**:
    *   启用 **ESLint** (配置好 Node/Browser 环境) 和 **SpotBugs**。
    *   **目的**: 实时修复语法错误和风格问题，保持代码整洁。

2.  **代码审查 (Code Review)**:
    *   引入 **LLM 辅助审查**。
    *   **目的**: 重点检查安全漏洞 (SQLi, XSS) 和业务逻辑闭环，解释复杂代码段。

3.  **核心模块加固**:
    *   仅对复杂算法或 `ReceiveService` 中的并发逻辑尝试 **JBMC** 验证。
    *   **目的**: 确保核心逻辑在边界条件下的绝对正确性。

通过这种分层策略，可以在保证开发效率的同时，最大化代码的质量和安全性。

</div>

