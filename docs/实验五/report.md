# 实验五：测试工具链整合与缺陷修复报告

实验目标：在 Java/Maven 项目中整合并演示 **JUnit 单元测试**、**JUnit 集成测试**、**Jazzer 模糊测试**、**GitHub Actions CI**，并完成 **程序缺陷修复（≥3 项）**。本报告严格按 5 部分结构撰写，并为每部分预留截图位置与对应命令。

实验环境：Windows + JDK 17 + Maven。

被测核心：`src/main/java/RequestManagement/parser.java`（请求解析与分发）。

---

## 一、单元测试报告

### 1.1 测试范围

单元测试入口（示例）：

- `src/test/java/RequestManagement/ParserTest.java`
- `src/test/java/ResultManagement/ParseResultTest.java`
- `src/test/java/sharedmodel/EntryTest.java`
- `src/test/java/acounting_system/AppTest.java`

### 1.2 执行命令

仅运行单元测试（显式指定测试类，避免把集成/模糊测试混在一起，便于截图）：

```powershell
mvn -Dtest=ParserTest,ParseResultTest,EntryTest,AppTest test
```

### 1.3 结果与证据

- 预期：终端输出包含 `BUILD SUCCESS`，并显示对应测试类 `Failures: 0, Errors: 0`。
- 实际：

【截图位置：单元测试运行通过（终端输出含 BUILD SUCCESS / Failures=0）】

产物位置：

- Surefire 报告目录：`target/surefire-reports/`

---

## 二、集成测试报告

### 2.1 测试范围

集成测试入口：

- `src/test/java/acounting_system/IntegrationTest.java`

覆盖内容：注册/登录、增删改查等端到端流程（依赖数据库层）。

### 2.2 执行命令

```powershell
mvn -Dtest=IntegrationTest test
```

### 2.3 结果与证据

- 预期：`IntegrationTest` 运行通过，`Failures: 0, Errors: 0`。
- 实际：

【截图位置：集成测试运行通过（终端输出含 IntegrationTest + Failures=0）】

产物位置：

- Surefire 报告目录：`target/surefire-reports/`

---

## 三、模糊测试（Jazzer）报告

### 3.1 模糊测试入口与配置说明

短时 fuzz（10s）：

- `src/test/java/acounting_system/ParserFuzzTest.java`
- 注解：`@FuzzTest(maxDuration = "10s")`

关键说明：

- Jazzer 的 JUnit 集成在默认情况下会以“回归模式”运行 1 次；当设置 `-Djazzer.fuzz=true` 时进入真正的 fuzzing。
- 本实验为了证明“工具能发现崩溃并生成 crash artifact”，在 `parser.parseRequest` 中保留了演示开关：只有 **`-Djazzer.fuzz=true` 且 `-Dfuzz.demo.crash=true` 同时开启**时才触发植入崩溃。默认 `mvn test` 不会触发。

### 3.2 触发崩溃并记录用例（推荐用于截图）

执行命令（建议跳过 JaCoCo，避免覆盖率文件干扰截图路径与耗时）：

```powershell
mvn test -Dtest=ParserFuzzTest "-Djazzer.fuzz=true" "-Dfuzz.demo.crash=true" "-Djacoco.skip=true"
```

预期现象（终端关键字）：

- `Running acounting_system.ParserFuzzTest`
- `Instrumented RequestManagement.parser`
- `java.lang.RuntimeException: Fuzzing discovered implanted crash: ...`
- `Test unit written to: ...`（生成 crash artifact 文件）

【截图位置：Jazzer 运行日志（Instrumented...）】

【截图位置：Jazzer 发现崩溃 + Test unit written to...】

### 3.3 崩溃用例（artifact）说明

当发现崩溃时，Jazzer 会在当前工作目录输出一个 `crash-...` 文件（artifact）。

记录字段建议（把你机器上实际输出粘贴进来即可）：

- 崩溃异常类型：`java.lang.RuntimeException`
- 崩溃消息：`Fuzzing discovered implanted crash: ...`
- artifact 文件名：`crash-...`

【截图位置：项目根目录中生成的 crash-... 文件（文件管理器截图）】

---

## 四、CI（GitHub Actions）报告

### 4.1 工作流文件

工作流路径：`.github/workflows/ci.yml`

完整内容：

```yaml
name: Java CI with Maven

# 触发条件：push 到 main，或向 main 发起 PR 时自动运行
on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  build:
    # GitHub Actions 运行环境
    runs-on: ubuntu-latest

    steps:
    # 1) 拉取仓库代码
    - uses: actions/checkout@v4

    # 2) 配置 JDK 17（Temurin）并启用 Maven 依赖缓存
    - name: Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'
        cache: maven

    # 3) Maven 构建（package 阶段默认会执行测试）
    - name: Build with Maven
      run: mvn -B package --file pom.xml
```

### 4.2 关键配置解释（逐条）

- `on.push/pull_request`: 约束只对 `main` 分支 push/PR 触发。
- `runs-on: ubuntu-latest`: CI 在 Ubuntu runner 上执行。
- `setup-java@v4`: 安装 JDK 17（Temurin），并开启 Maven 缓存。
- `mvn -B package`: 运行 Maven 的 package 阶段（会自动执行测试）。

【截图位置：GitHub Actions 运行成功页面（job 全绿）】

---

## 五、程序修复报告（≥3 个缺陷）

本部分给出“缺陷现象 → 定位分析 → 修复方案 → 验证结果”，并记录 AI 辅助修复过程（用于截图）。

### 5.1 缺陷 1：模糊测试演示崩溃默认可能影响常规构建

- 现象：如果演示崩溃无条件触发，会导致默认测试/生产运行因为外部输入而崩溃。
- 定位：`src/main/java/RequestManagement/parser.java` 中崩溃触发条件。
- 修复：将崩溃触发改为“仅在 `-Djazzer.fuzz=true` 且 `-Dfuzz.demo.crash=true` 时触发”。
- 验证：默认 `mvn test` 不开启这两个属性时不会触发崩溃；单独 fuzz 命令可稳定生成 crash artifact。

【截图位置：修复前后对比（git diff 或代码片段）】

### 5.2 缺陷 2：请求字段包含空格导致 action 不匹配

- 现象：输入如 `"user,  login  ,pass"` 可能被识别为未知操作。
- 定位：`parseRequest` 对 `username/action` 未做 `trim()`。
- 修复：对 `username` 与 `action` 做 `trim()`。
- 验证：单测 `ParserTest.testActionTrimmed()` 通过。

【截图位置：testActionTrimmed 运行通过】

### 5.3 缺陷 3：add 金额解析遇到非数字会抛异常

- 现象：`add` 请求金额为非数字（如 `not_a_number`）时抛出 `NumberFormatException`，属于未预期异常。
- 定位：`handleAddRequest` 中 `Double.parseDouble(parts[2])` 未捕获异常。
- 修复：捕获 `NumberFormatException` 并返回 `ParseResult("add", false, "金额格式错误", null)`。
- 验证：单测 `ParserTest.testHandleAddRequestInvalidAmount()` 通过。

【截图位置：testHandleAddRequestInvalidAmount 运行通过】

### 5.4 AI 辅助修复过程记录（用于截图）

你可以按下面脚本截图（左侧为“我问”，右侧为“AI 回答”）：

（1）我问：`parser.parseRequest` 在 fuzz 下偶发崩溃，怎么定位？

AI 答：建议先从异常堆栈定位到具体分支；对输入做 `trim()`；对金额解析增加异常捕获；对 fuzz 演示崩溃加开关避免影响常规构建。

【截图位置：提问截图】

【截图位置：AI 建议截图】

（2）分析与采纳（示例写法）：

- 采纳：对 `action`/`username` `trim()`，理由：输入带空格是常见边界情况。
- 采纳：金额解析增加 `try/catch`，理由：避免未捕获异常导致服务中断。
- 采纳：崩溃演示加属性开关，理由：保证默认构建稳定，同时满足“崩溃证据”要求。

【截图位置：分析与采纳截图】

（3）最终修复结果验证命令：

```powershell
mvn clean test
```

【截图位置：最终全量测试 BUILD SUCCESS】

---

## 附：统一截图命令清单（可直接复制执行）

```powershell
# 1) 单元测试
mvn -Dtest=ParserTest,ParseResultTest,EntryTest,AppTest test

# 2) 集成测试
mvn -Dtest=IntegrationTest test

# 3) 模糊测试：生成崩溃 artifact（用于截图证据）
mvn test -Dtest=ParserFuzzTest "-Djazzer.fuzz=true" "-Dfuzz.demo.crash=true" "-Djacoco.skip=true"

# 4) 全量测试 + 覆盖率（生成 JaCoCo HTML 报告）
mvn clean test
```

JaCoCo 报告打开位置：`target/site/jacoco/index.html`

【截图位置：JaCoCo index.html 总览】
