# Web 客户端 + TCP 服务器桥接快速指南

# 一键启动：项目根目录里输入powershell -ExecutionPolicy Bypass -File .\scripts\start_all_and_get_ngrok.ps1

本项目的后端仍然是原始 TCP 协议服务器（`Main.java` + `ReceiveService`），浏览器端无法直接与其通信。按照下面步骤，可以在**不改动后端代码**的前提下，通过一个轻量的 HTTP→TCP 代理，把网页端 (`resource/` 下的 HTML/JS/CSS) 接到现有逻辑。

## 目录结构概览

```
/resource/              # 静态网页客户端资源（HTML / CSS / JS）
/proxy/http_to_tcp_proxy.js  # HTTP→TCP 代理脚本（Node.js）
/proxy/reverse_proxy.js      # 统一入口反向代理脚本（Node.js）
/scripts/serve_static.ps1    # 启动静态资源 HTTP 服务（PowerShell，调用 python -m http.server）
/scripts/start_proxy.ps1     # 启动 HTTP→TCP 代理（PowerShell，调用 node proxy/http_to_tcp_proxy.js）
/scripts/start_reverse_proxy.ps1 # 启动统一入口反向代理（PowerShell，调用 node proxy/reverse_proxy.js）
```

> 若你已经有其他方式提供静态文件或运行 Node，可直接跳过对应脚本，使用自己熟悉的工具即可。

## 环境前提

| 组件 | 推荐版本 | 作用 |
| ---- | -------- | ---- |
| Java 17 | 与项目 `pom.xml` 一致 | 编译并运行 TCP 后端
| Maven 3.8+ | `mvn compile` / `mvn exec:java` | 构建/运行后端
| Python 3.8+ | 用于启动静态资源 HTTP 服务 (`python -m http.server`) |
| Node.js 18+ | 运行 HTTP→TCP 代理与统一入口反向代理 |
| PowerShell 5.1+ | 运行提供的脚本（Windows 默认） |

确保上述工具加入了系统 `PATH`。

## 步骤 1：启动 Java TCP 后端

```powershell
# 根据需要先编译
mvn -q compile
# 启动 TCP 服务（保持窗口打开）
mvn exec:java 
```

默认监听在 `127.0.0.1:8080`。

## 步骤 2：本地提供静态资源

在新的 PowerShell 窗口中运行脚本（自动调用 `python -m http.server` 并锁定端口 8082）：

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\serve_static.ps1"
```

脚本默认会：

- 进入 `resource/` 目录
- 启动 `python -m http.server 8082`
- 输出访问地址 `http://127.0.0.1:8082/index.html`

> 如你更喜欢手动运行：
>
> ```powershell
> Set-Location -Path "C:\Users\Lenovo\Desktop\server\resource"
> python -m http.server 8082
> ```

## 步骤 3：启动 HTTP→TCP 代理

再开一个 PowerShell 窗口，运行：

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\start_proxy.ps1"
```

脚本默认相当于执行：

```powershell
node .\proxy\http_to_tcp_proxy.js
```

代理默认监听 `http://127.0.0.1:8081/`，将 HTTP POST 的请求体转发到 `127.0.0.1:8080`（TCP 后端）。

如需自定义，可在运行脚本前设置环境变量：

```powershell
$env:PROXY_HTTP_PORT = 9000
$env:PROXY_TCP_HOST = "127.0.0.1"
$env:PROXY_TCP_PORT = 8080
$env:PROXY_TIMEOUT_MS = 12000
./scripts/start_proxy.ps1
```

## 步骤 4：启动统一入口反向代理（整合静态资源 + API）

为了在 ngrok 免费版下只暴露一个入口，再开一个 PowerShell 窗口运行：

```powershell
powershell -ExecutionPolicy Bypass -NoExit -Command ".\scripts\start_reverse_proxy.ps1 -ListenPort 8083 -StaticPort 8082 -ApiPort 8081"

```

脚本默认相当于执行：

```powershell
node .\proxy\reverse_proxy.js
```

反向代理监听 `http://127.0.0.1:8080/`，路由规则如下：

- `/`、`/index.html`、`/scripts/...`、`/styles/...` 会转发到 `127.0.0.1:8082` 的静态资源服务器。
- `/static/...` 会去掉 `/static` 前缀后转发到静态资源服务器。
- `/api`、`/api/...` 会去掉 `/api` 前缀后转发到 `127.0.0.1:8081` 的 HTTP→TCP 代理。

同样可以通过环境变量或脚本参数覆盖默认端口/主机，例如：

```powershell
$env:REVERSE_PROXY_PORT = 9000
$env:STATIC_SERVICE_PORT = 8182
$env:API_SERVICE_PORT = 8181
./scripts/start_reverse_proxy.ps1
```

## 步骤 5：通过 ngrok 暴露（对外访问）

ngrok http 8083

## 步骤 6： 

浏览器输入步骤5的公网url

## 待实现：一键启动所有进程

## 快速验证代理是否工作

可以用 PowerShell 手动发一个请求：

```powershell
$body = "alice,search,2025/10/01,2025/10/31`n"
Invoke-RestMethod -Uri "http://127.0.0.1:8080/api" -Method POST -Body $body -ContentType "text/plain"
```

预期返回类似：

```
search~null~null~alice,150.75,2025/10/23,meal,lunch with team
```

也可以调用代理提供的健康检查：

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/health" -Method GET
```

返回示例：

```json
{
  "status": "ok",
  "tcpHost": "127.0.0.1",
  "tcpPort": 8080,
  "timeoutMs": 8000
}
```

## 常见问题与排查

1. **端口占用**：
   - 若 8082、8081 或 8080 被占用，可改用其它端口（修改脚本中的常量或通过环境变量覆盖）。
   - 使用 `Get-NetTCPConnection -LocalPort <port>` 查看占用进程。

2. **浏览器仍访问不到代理**：
   - 检查 `start_proxy.ps1` 终端是否输出 "HTTP→TCP proxy started"；
   - 检查 `start_reverse_proxy.ps1` 终端是否输出 "Reverse proxy started"；
   - 查看 Node 日志是否有错误（例如 TCP 连接失败、超时）。

3. **CORS 阻止请求**：
   - 代理响应已设置 `Access-Control-Allow-Origin: *`，确保浏览器不会因为跨域拒绝。但如果你改成其它主机或使用 HTTPS，要同步调整浏览器端配置。

4. **TCP 服务器没有响应**：
   - 确保 Java 服务正在运行并监听正确端口；
   - 使用 PowerShell 的原始 TCP 测试命令（详见之前的测试文档）直接连后端确认。

5. **多个进程需同时运行**：
   - 当前方案需同时启动 Java 后端、静态资源服务、HTTP→TCP 代理、反向代理四个进程；
   - 可以使用 VS Code 的任务编排或额外脚本（例如 PowerShell `Start-Process`) 一键启动多个进程，这里提供的是最小可行方案。

## 使用 ngrok 暴露统一入口

1. 确保前面四个进程已经全部启动，且反向代理监听在本地 `8080`（或你配置的端口）。
2. 在新的 PowerShell 窗口中执行：

   ```powershell
   Set-Location -Path "C:\Users\Lenovo\Desktop\server"
   ngrok http 8080
   ```

   登陆 ngrok 后会显示一个形如 `https://<随机子域>.ngrok-free.app` 的公网地址。

3. 把该地址发给外部用户，访问时无需额外端口号，直接使用：

   - 静态资源：`https://<随机子域>.ngrok-free.app/`
   - API：前端内部已经指向 `/api`，无需另外配置。

4. 若需从命令行验证隧道是否可用，可在任意可以访问公网的终端执行：

   ```powershell
   Invoke-RestMethod -Uri "https://<随机子域>.ngrok-free.app/api/health" -Method GET
   ```

   返回正常即表示 ngrok 隧道与本地服务均工作正常。

## 进一步扩展

- 可以把 `proxy/http_to_tcp_proxy.js` 改写为使用 Express/Koa，以便添加更丰富的日志、鉴权或统计功能。
- 如果计划部署到生产环境，建议将静态资源与 HTTP API 放在同一个 Node/Java Web 服务内，减少进程数量，并控制超时、限流等策略。
- 若后端未来要支持跨平台/手机客户端，可在代理层新增 JSON API，对旧协议做兼容处理。

---

通过以上步骤，你就能在浏览器中直接使用 `resource/` 里的客户端，与原有 TCP 服务器完成记账操作，同时保留最初的系统结构。祝开发顺利！
