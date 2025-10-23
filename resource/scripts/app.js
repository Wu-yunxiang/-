const state = {
    host: "127.0.0.1",
    port: 8080,
    path: "/rpc",
    demoMode: false
};

const logPanel = [];

document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    setupForms();
    setupEndpointForm();
    setupDemoToggle();
    logMessage("客户端已就绪，等待输入。");
    updateEndpointSummary();
});

function setupTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            if (tab.classList.contains("active")) {
                return;
            }
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            const target = tab.dataset.target;
            document.querySelectorAll(".view").forEach((view) => {
                view.classList.toggle("active", view.id === `view-${target}`);
            });
        });
    });
}

function setupForms() {
    document.querySelectorAll(".action-form").forEach((form) => {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const action = form.dataset.action;
            try {
                const { request, displayValues } = composePayload(action, new FormData(form));
                showRequest(request);
                logMessage(`发送 ${action} 请求`, "info");
                const responseText = await sendPayload(request);
                showResponse(responseText);
                const parsed = parseResponse(responseText);
                showParsed(parsed);
                handlePostAction(parsed, displayValues);
                logMessage(`完成 ${action}，success=${parsed.success}`, parsed.success === false ? "error" : "info");
            } catch (error) {
                logMessage(`请求失败：${error.message}`, "error");
                showResponse(error.stack || error.message || String(error));
                showParsed(null);
            }
        });
    });
}

function setupEndpointForm() {
    const form = document.getElementById("endpointForm");
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const host = form.host.value.trim() || "127.0.0.1";
        let port = Number(form.port.value);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
            port = 8080;
        }
        let path = form.path.value.trim() || "/rpc";
        if (!path.startsWith("/")) {
            path = `/${path}`;
        }
        state.host = host;
        state.port = port;
        state.path = path;
        updateEndpointSummary();
        logMessage(`已更新后端地址：${host}:${port}${path}`);
    });
}

function setupDemoToggle() {
    const demoToggle = document.getElementById("demoMode");
    demoToggle.addEventListener("change", () => {
        state.demoMode = demoToggle.checked;
        logMessage(state.demoMode ? "已进入脱机演示模式，将生成模拟响应" : "恢复真实网络模式。", state.demoMode ? "warning" : "info");
    });
}

function updateEndpointSummary() {
    const hostInput = document.getElementById("hostInput");
    const portInput = document.getElementById("portInput");
    const pathInput = document.getElementById("pathInput");
    hostInput.value = state.host;
    portInput.value = state.port;
    pathInput.value = state.path;
}

function composePayload(action, formData) {
    const username = (formData.get("username") || "").trim();
    if (!username) {
        throw new Error("用户名不能为空");
    }

    switch (action) {
        case "register": {
            const password = (formData.get("password") || "").trim();
            if (!password) {
                throw new Error("密码不能为空");
            }
            return {
                request: `${username},register,${password}`,
                displayValues: { username }
            };
        }
        case "login": {
            const password = (formData.get("password") || "").trim();
            if (!password) {
                throw new Error("密码不能为空");
            }
            return {
                request: `${username},login,${password}`,
                displayValues: { username }
            };
        }
        case "add": {
            const amount = (formData.get("amount") || "").trim();
            const date = (formData.get("date") || "").trim();
            const subject = (formData.get("subject") || "").trim();
            const note = (formData.get("note") || "").trim();
            if (!amount || !date || !subject) {
                throw new Error("金额、日期、科目均不能为空");
            }
            return {
                request: `${username},add,${amount},${date},${subject},${note}`,
                displayValues: { username, amount, date, subject }
            };
        }
        case "search": {
            const startDate = (formData.get("startDate") || "").trim() || "";
            const endDate = (formData.get("endDate") || "").trim() || "";
            return {
                request: `${username},search,${startDate},${endDate}`,
                displayValues: { username, startDate, endDate }
            };
        }
        default:
            throw new Error(`未知操作: ${action}`);
    }
}

async function sendPayload(request) {
    if (state.demoMode) {
        await delay(280);
        return createDemoResponse(request);
    }

    const endpoint = new URL(state.path, `http://${state.host}:${state.port}`);
    const controller = new AbortController();
    const payload = `${request}\n`;

    try {
        const response = await fetch(endpoint.toString(), {
            method: "POST",
            body: payload,
            headers: {
                "Content-Type": "text/plain; charset=UTF-8",
                "Cache-Control": "no-cache"
            },
            signal: controller.signal
        });

        const text = await response.text();
        controller.abort();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text}`);
        }
        return text.trim();
    } catch (error) {
        controller.abort();
        throw error;
    }
}

function parseResponse(raw) {
    if (!raw) {
        return null;
    }
    const clean = raw.trim();
    const parts = clean.split("~");
    if (parts.length < 4) {
        throw new Error(`响应格式不符合预期: ${clean}`);
    }
    const [action, successStr, messageStr, entriesStr] = parts;
    const success = successStr === "null" ? null : successStr === "1";
    const message = messageStr === "null" ? null : messageStr;
    const entries = entriesStr === "null" || entriesStr === "" ? [] : entriesStr.split("|").map(parseEntry);
    return {
        action,
        success,
        message,
        entries
    };
}

function parseEntry(entryString) {
    const cols = entryString.split(",");
    if (cols.length < 5) {
        return {
            raw: entryString
        };
    }
    const [username, amount, date, subject, note] = cols;
    return {
        username,
        amount: Number(amount),
        date,
        subject,
        note
    };
}

function handlePostAction(parsed, context) {
    if (!parsed) {
        return;
    }
    if (parsed.action === "search") {
        renderSearchResult(parsed, context);
    } else {
        clearSearchResult();
    }
    if (parsed.message) {
        logMessage(`服务器消息: ${parsed.message}`);
    }
}

function renderSearchResult(parsed, context) {
    const container = document.getElementById("searchResult");
    const summary = document.getElementById("searchSummary");
    const tbody = document.getElementById("searchTableBody");
    container.hidden = false;
    tbody.innerHTML = "";

    if (!parsed.entries.length) {
        summary.textContent = `没有找到 ${context.username} 的账目。`;
        return;
    }

    summary.textContent = `共返回 ${parsed.entries.length} 条记录。`;

    parsed.entries.forEach((entry) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${escapeHtml(entry.username ?? "")}</td>
            <td>${typeof entry.amount === "number" && !Number.isNaN(entry.amount) ? entry.amount.toFixed(2) : ""}</td>
            <td>${escapeHtml(entry.date ?? "")}</td>
            <td>${escapeHtml(entry.subject ?? "")}</td>
            <td>${escapeHtml(entry.note ?? "")}</td>
        `;
        tbody.appendChild(tr);
    });
}

function clearSearchResult() {
    const container = document.getElementById("searchResult");
    if (container) {
        container.hidden = true;
        document.getElementById("searchSummary").textContent = "";
        document.getElementById("searchTableBody").innerHTML = "";
    }
}

function showRequest(raw) {
    const preview = document.getElementById("requestPreview");
    preview.value = raw;
}

function showResponse(raw) {
    const preview = document.getElementById("responsePreview");
    preview.value = raw ?? "";
}

function showParsed(parsed) {
    const preview = document.getElementById("parsedPreview");
    if (!parsed) {
        preview.textContent = "(无解析结果)";
        return;
    }
    preview.textContent = JSON.stringify(parsed, null, 2);
}

function logMessage(message, level = "info") {
    const list = document.getElementById("logPanel");
    const entry = document.createElement("li");
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (level === "error" || level === "warning") {
        entry.classList.add("error");
    }
    list.prepend(entry);
    while (list.children.length > 30) {
        list.removeChild(list.lastChild);
    }
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDemoResponse(request) {
    const [username, action] = request.split(",");
    switch (action) {
        case "register":
            return "register~1~模拟注册成功~null";
        case "login":
            return "login~1~模拟登录成功~null";
        case "add":
            return "add~1~模拟写入成功~null";
        case "search":
            return "search~null~模拟数据~" + [
                `${username},120.50,2025/10/20,office,rent`,
                `${username},45.00,2025/10/21,meal,lunch`
            ].join("|");
        default:
            return `${action ?? "unknown"}~0~模拟失败~null`;
    }
}
