# 实验五：测试工具链整合（JUnit 单元/集成 + Jazzer 模糊测试 + JaCoCo 覆盖率）

## 1. 实验目的

- 使用标准测试框架完成单元测试与集成测试，并给出执行结果证据。
- 使用标准模糊测试工具 Jazzer（而非自定义随机测试）对输入解析逻辑进行模糊测试。
- 使用覆盖率分析工具 JaCoCo 生成覆盖率报告并给出关键指标。
- 将以上结果整合为可复现的实验报告（含命令、产物路径、截图清单）。

## 2. 被测对象

- 后端 Java Maven 项目（`pom.xml` 管理依赖与插件）。
- 主要关注模块：
  - `src/main/java/RequestManagement/parser.java`（请求解析/分发）
  - `src/main/java/RequestManagement/sqloperation.java`（H2 数据库操作）

## 3. 实验环境与工具

### 3.1 运行环境

- 操作系统：Windows
- Java：17（`pom.xml` 中 `maven.compiler.source/target=17`）
- 构建工具：Maven

### 3.2 测试与质量工具（版本来自 `pom.xml`）

- 单元/集成测试：
  - JUnit 4.13.2
  - JUnit 5.9.0（Jupiter + Vintage Engine 5.9.0）
  - Maven Surefire Plugin 3.2.5
- 模糊测试：
  - Jazzer JUnit 集成：`com.code-intelligence:jazzer-junit:0.22.1`
- 覆盖率：
  - JaCoCo Maven Plugin 0.8.11（HTML + XML + CSV）

> 备注：历史上曾出现 JUnit 版本不一致导致的运行期缺类（`TempDirFactory`）问题；当前已统一到 Jazzer 传递依赖兼容的 JUnit 5.9.0 / Platform 1.9.0。

## 4. 测试用例与入口

### 4.1 单元测试

- `src/test/java/RequestManagement/ParserTest.java`
- `src/test/java/ResultManagement/ParseResultTest.java`
- `src/test/java/sharedmodel/EntryTest.java`
- `src/test/java/acounting_system/AppTest.java`

### 4.2 集成测试

- `src/test/java/acounting_system/IntegrationTest.java`
  - 覆盖：注册/登录、增删改查等端到端流程（依赖 H2）。

### 4.3 模糊测试（Jazzer）

- 短时 fuzz（默认可随常规测试一起跑）：
  - `src/test/java/acounting_system/ParserFuzzTest.java`
  - 入口：`@FuzzTest(maxDuration = "10s")`
  - 策略：不吞异常，让 Jazzer 捕获并最小化触发崩溃的输入。

- 长时 fuzz（用于“至少运行 5 小时”证明，默认不随 `mvn test` 执行）：
  - `src/test/java/acounting_system/ParserFuzzLong.java`
  - 入口：`@FuzzTest(maxDuration = "5h")`
  - 说明：该类名不以 `*Test` 结尾，避免 Surefire 默认发现导致常规构建被阻塞；需手动指定运行。

> 迁移说明：`src/test/java/acounting_system/ParserFuzzLongTest.java` 已改为“迁移占位文件”（不包含可被 Surefire 默认发现的 `*Test` 测试类），防止误跑。

## 5. 执行过程与结果

### 5.1 一键执行（单元 + 集成 + 短时 fuzz + 覆盖率）

命令：

```powershell
mvn clean test
```

结果（终端摘要）：

- `Tests run: 31, Failures: 0, Errors: 0, Skipped: 0`
- `BUILD SUCCESS`

产物：

- Surefire 测试报告：`target/surefire-reports/`
- JaCoCo 覆盖率报告：`target/site/jacoco/index.html`

### 5.2 仅运行短时 fuzz

命令：

```powershell
mvn test -Dtest=ParserFuzzTest
```

说明：用于截图展示“使用 Jazzer 工具进行 fuzz”的运行日志与结果。

### 5.3 运行 5 小时 fuzz（证明材料）

命令（建议跳过 JaCoCo 以降低插桩开销）：

```powershell
mvn test -Dtest=ParserFuzzLong -Djacoco.skip=true
```

证据采集建议：

- 截图 1：开始运行时的命令与系统时间。
- 截图 2：运行中（中途任意时刻）仍在执行的状态（含时间）。
- 截图 3：结束时的 `BUILD SUCCESS` 或 Jazzer 报错/崩溃信息（含总耗时）。

若发现崩溃：

- 保存 Jazzer 输出的最小化输入（通常会打印导致问题的样本/回放信息）。
- 在报告中补充“复现步骤 + 复现命令 + 关键堆栈”。

## 6. 覆盖率结果（JaCoCo）

覆盖率数据来源：`target/site/jacoco/jacoco.csv`（由 JaCoCo 自动生成）。

### 6.1 总体覆盖率

- 指令覆盖率（Instruction）：78.10%（covered=1177, missed=330）
- 行覆盖率（Line）：73.53%（covered=250, missed=90）

### 6.2 分包覆盖率（Instruction / Line）

- `RequestManagement`：88.39% / 88.21%
- `sharedmodel`：98.10% / 100.00%
- `ResultManagement`：96.83% / 100.00%
- `communication`：0% / 0%（未被测试用例触达）
- `acounting_system`：0% / 0%（`Main` 未被测试用例触达）

> 可作为“选择两个子功能包覆盖率 ≥ 80%”的证据：例如 `RequestManagement` 与 `sharedmodel`。

## 7. CI 持续集成

- 工作流文件：`.github/workflows/ci.yml`
- 行为：在 push/PR 时执行 Maven 构建与测试（`mvn -B package`）。

## 8. 结论

- 单元测试 + 集成测试均通过，构建成功。
- 已使用 Jazzer（工具）完成模糊测试入口与运行路径：短时 fuzz 可在本地稳定执行。
- 已集成 JaCoCo 并产出可浏览的 HTML 报告与可计算的 CSV/XML。
- 5 小时 fuzz 已提供独立入口且不会阻塞默认构建；待实际运行满 5 小时并补齐截图证据（或发现崩溃并给出复现）。

## 9. 截图/证据清单（提交前自查）

- `mvn clean test` 终端输出（包含 `Tests run` 与 `BUILD SUCCESS`）。
- `mvn test -Dtest=ParserFuzzTest` 终端输出（展示 Jazzer 工具运行）。
- JaCoCo 报告首页：`target/site/jacoco/index.html`。
- JaCoCo 分包页面：
  - `target/site/jacoco/RequestManagement/index.html`
  - `target/site/jacoco/sharedmodel/index.html`
- 5h fuzz：开始/运行中/结束三张截图（或崩溃复现截图）。
- GitHub Actions：CI 运行成功页面截图（如课程要求）。
