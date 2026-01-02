# 实验五 实验报告

## 一、单元测试报告

### 1. 测试目的
验证 `RequestManagement.parser` 和 `ResultManagement.ParseResult` 类的核心功能是否正确，包括请求解析、参数校验、结果对象构建及字符串转换。

### 2. 测试对象
- **子功能 1: 请求解析 (Request Parsing)**
    - 对应类: `RequestManagement.parser`
    - 测试内容: 验证 `parseRequest` 方法对各种 Action (add, register, login, search, list, delete, clear) 的分发逻辑，以及参数校验和异常处理。
- **子功能 2: 数据模型与结果封装 (Data Model & Result Encapsulation)**
    - 对应类: `ResultManagement.ParseResult` 和 `sharedmodel.Entry`
    - 测试内容: 验证 `ParseResult` 的 `toString` 序列化逻辑，以及 `Entry` 对象的构造和字符串表示。

### 3. 测试环境
- 操作系统: Windows
- 编程语言: Java 17
- 测试框架: JUnit 4.11
- 构建工具: Maven

### 4. 测试用例与结果

#### 4.1 ParserTest (针对 parser.java)
共执行 15 个测试用例，覆盖了所有主要分支。

| 测试用例 | 输入 | 预期输出 | 结果 |
| :--- | :--- | :--- | :--- |
| testParseRequestNull | null | action="unknown", success=false, message="空请求" | 通过 |
| testParseRequestEmpty | "   " | action="unknown", success=false, message="空请求" | 通过 |
| testParseRequestInvalidFormat | "user" | action="unknown", success=false, message="请求格式错误" | 通过 |
| testHandleAddRequestSuccess | "user,add,..." | action="add", success=true | 通过 |
| testHandleAddRequestInsufficientParams | "user,add,100" | action="add", success=false, message="参数不足" | 通过 |
| testHandleRegisterRequestSuccess | "user,register,pass" | action="register", success=true | 通过 |
| testHandleLoginRequestSuccess | "user,login,pass" | action="login", success=true | 通过 |
| testHandleLoginRequestUserNotFound | "user,login,pass" (Mock userExists=false) | action="login", success=false, message="用户名不存在" | 通过 |
| testUnknownAction | "user,unknown,..." | action="unknown", success=false | 通过 |
| testHandleSearchRequest | "user,search,..." | action="search", success=true, entries=MockList | 通过 |
| testHandleListRequest | "user,list" | action="list", success=true, entries=MockList | 通过 |
| testHandleDeleteRequestSuccess | "user,delete,123" | action="delete", success=true | 通过 |
| testHandleDeleteRequestInvalidId | "user,delete,abc" | action="delete", success=false, message="记录ID无效" | 通过 |
| testHandleDeleteRequestMissingId | "user,delete" | action="delete", success=false, message="缺少要删除的记录ID" | 通过 |
| testHandleClearRequest | "user,clear" | action="clear", success=true | 通过 |

#### 4.2 ParseResultTest & EntryTest
共执行 10 个测试用例。

| 测试类 | 测试用例 | 说明 | 结果 |
| :--- | :--- | :--- | :--- |
| ParseResultTest | testToStringSuccess | 验证完整对象的字符串序列化 | 通过 |
| ParseResultTest | testToStringFailure | 验证失败对象的序列化 | 通过 |
| ParseResultTest | testToStringNullMessage | 验证 null message 处理 | 通过 |
| ParseResultTest | testToStringEscapedMessage | 验证特殊字符转义 | 通过 |
| EntryTest | testConstructorFull | 验证全参构造 | 通过 |
| EntryTest | testConstructorWithoutId | 验证无 ID 构造 | 通过 |
| EntryTest | testTypeNormalizationNull | 验证 type 为 null 时默认为 expense | 通过 |
| EntryTest | testTypeNormalizationEmpty | 验证 type 为空字符串时默认为 expense | 通过 |
| EntryTest | testToStringFull | 验证 Entry 对象的字符串格式 | 通过 |
| EntryTest | testToStringNullFields | 验证 Entry 字段为 null 时的处理 | 通过 |

### 5. 测试覆盖率说明
本次测试针对 `parser` 类进行了全面的逻辑覆盖，包括正常路径和异常路径（如参数不足、格式错误、ID无效等）。同时对数据模型 `Entry` 和结果对象 `ParseResult` 进行了细致的边界测试（如 null 值处理）。总测试用例数达到 25 个，远超要求的 10 个，且覆盖了核心业务逻辑。

---

## 二、集成测试报告

### 1. 测试目的
验证 `parser` 与 `sqloperation` (使用 H2 数据库) 结合后的实际工作流程，确保数据能正确写入数据库并被查询出来。

### 2. 测试方法
采用自顶向下的测试方法，通过 `parser.parseRequest` 接口输入模拟的客户端请求字符串，验证系统是否能正确操作数据库并返回预期的 `ParseResult`。测试过程中使用临时目录作为数据库路径，避免污染生产环境数据。

### 3. 测试用例与结果

#### 3.1 IntegrationTest
共执行 4 组集成测试流程。

| 测试流程 | 步骤简述 | 预期结果 | 实际结果 | 结果 |
| :--- | :--- | :--- | :--- | :--- |
| **Add & List Flow** | 1. Add 记录 <br> 2. List 记录 | List 返回包含刚才添加记录的列表 | 一致 | 通过 |
| **Login Flow** | 1. 正确密码登录 <br> 2. 错误密码登录 | 1. 成功 <br> 2. 失败(密码错误) | 一致 | 通过 |
| **Search Flow** | 1. Add 收入和支出记录 <br> 2. Search 仅收入 | Search 结果仅包含收入记录 | 一致 | 通过 |
| **Delete Flow** | 1. Add 记录 <br> 2. List 获取 ID <br> 3. Delete ID <br> 4. List 验证 | 最终 List 为空 | 一致 | 通过 |

---

## 三、模糊测试报告

### 1. 测试工具与环境
- **工具**: 自研 Java Fuzzing 脚本 (`src/test/java/acounting_system/FuzzTest.java`)
- **原因**: 开发环境为 Windows，无法直接运行 AFL++ (American Fuzzy Lop)。因此编写了一个基于随机字符串生成的 Fuzzer，针对 `parser.parseRequest` 接口进行健壮性测试。
- **策略**: 生成长度 0-50 的随机 ASCII 字符串，随机插入逗号模拟 CSV 格式，循环调用解析器 1000 次，捕获未处理的异常（Crash）。

### 2. 测试过程
- **输入生成**: 使用 `java.util.Random` 生成包含各种字符的随机字符串。
- **执行**: 运行 `FuzzTest` 主类。
- **监控**: 监控控制台输出，查找 "CRASH detected" 日志。

### 3. 测试结果
- **运行时间**: < 1秒
- **迭代次数**: 1000 次
- **崩溃数**: 0
- **结论**: `parser` 类对各种畸形输入（如乱码、不完整的 CSV、特殊字符）均能通过 `try-catch` 块进行捕获并返回错误信息，未发生未捕获的异常导致程序崩溃，表现出良好的健壮性。

*(注：若需使用 AFL++，建议在 Linux 环境下编译 C++ 版本进行测试)*

---

## 四、持续集成 (CI) 报告

### 1. CI 配置文件 (.github/workflows/ci.yml)
```yaml
name: Java CI with Maven

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'
        cache: maven
    - name: Build with Maven
      run: mvn -B package --file pom.xml
```

### 2. 说明
- **触发条件**: 当代码推送到 `main` 分支或向 `main` 分支发起 Pull Request 时触发。
- **环境**: 使用 `ubuntu-latest` 运行。
- **步骤**:
    1. 检出代码。
    2. 设置 JDK 17 环境。
    3. 使用 Maven 进行构建和测试 (`mvn package` 会自动运行测试)。

---

## 五、程序修复报告

### 1. AI 助手选择
- **工具**: GitHub Copilot (Gemini 3 Pro Preview)
- **IDE**: VS Code

### 2. 缺陷修复记录

#### 修复 1: 硬编码凭证 (Hardcoded Credentials)
- **位置**: `src/main/java/RequestManagement/sqloperation.java`
- **问题**: 数据库用户名和密码硬编码在代码中 (`"sa"`, `""`)。
- **修复**: 修改为优先从环境变量 `DB_USER` 和 `DB_PASSWORD` 获取，保留默认值以兼容旧环境。
- **代码修改**:
```java
// 修改前
public static String JDBC_USER = "sa";
public static String JDBC_PASSWORD = "";

// 修改后
public static String JDBC_USER = System.getenv("DB_USER") != null ? System.getenv("DB_USER") : "sa";
public static String JDBC_PASSWORD = System.getenv("DB_PASSWORD") != null ? System.getenv("DB_PASSWORD") : "";
```

#### 修复 2: 跨站脚本攻击 (XSS) 缓解
- **位置**: `resource/index.html`
- **问题**: 报告指出存在潜在 XSS 风险。虽然代码中主要使用 `textContent`，但为了增强安全性，添加了内容安全策略 (CSP)。
- **修复**: 在 HTML 头部添加 CSP meta 标签，限制脚本和样式只能从同源加载。
- **代码修改**:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;">
```

#### 修复 3: 过于宽松的 CORS 策略
- **位置**: `proxy/http_to_tcp_proxy.js`
- **问题**: `Access-Control-Allow-Origin` 设置为 `*`，允许任意域名的请求。
- **修复**: 修改为优先使用环境变量 `ALLOWED_ORIGIN`，限制跨域访问来源。
- **代码修改**:
```javascript
// 修改前
"Access-Control-Allow-Origin": "*",

// 修改后
"Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
```

#### 修复 4: 逻辑错误 (Parser 返回值)
- **位置**: `src/main/java/RequestManagement/parser.java`
- **问题**: `handleListRequest` 和 `handleSearchRequest` 在成功时返回的 `success` 字段为 `null`，导致客户端或测试代码可能出现空指针异常或逻辑判断错误。
- **修复**: 显式设置为 `Boolean.TRUE`。
- **代码修改**:
```java
// 修改前
return new ParseResult("list", null, null, sql.solveList(username));

// 修改后
return new ParseResult("list", Boolean.TRUE, null, sql.solveList(username));
```
