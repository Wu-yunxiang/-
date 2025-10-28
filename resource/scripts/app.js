const state = {
    host: "",
    port: 80,
    path: "/api",
    loggedInUser: null,
    activeTab: "register"
};
document.addEventListener("DOMContentLoaded", () => {
    initializeEndpointDefaults();
    setupTabs();
    setupForms();
    updateAuthUI();
    logMessage("客户端已就绪，等待输入。", "info");
});

function setActiveTab(target) {
    const tab = document.querySelector(`.tab[data-target="${target}"]`);
    if (!tab || tab.hidden) {
        return;
    }
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((button) => {
        const isActive = button === tab;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    document.querySelectorAll(".view").forEach((view) => {
        view.classList.toggle("active", view.id === `view-${target}`);
    });
    state.activeTab = target;
}

function updateAuthUI() {
    const authed = Boolean(state.loggedInUser);
    document.querySelectorAll("[data-requires-auth]").forEach((element) => {
        applyVisibility(element, !authed);
    });
    document.querySelectorAll("[data-hide-after-login]").forEach((element) => {
        applyVisibility(element, authed);
    });
    updateUserStatus();

    const activeTabButton = document.querySelector(".tab.active");
    if (!activeTabButton || activeTabButton.hidden) {
        const fallback = document.querySelector(".tab:not([hidden])");
        if (fallback) {
            setActiveTab(fallback.dataset.target);
        }
    }
}

function updateUserStatus() {
    const status = document.getElementById("userStatus");
    const name = document.getElementById("currentUserName");
    const title = document.getElementById("pageTitle");
    if (title) {
        title.textContent = state.loggedInUser ? `${state.loggedInUser} 的记账本` : "记账系统";
    }
    document.title = state.loggedInUser ? `${state.loggedInUser} 的记账本` : "记账系统";
    if (!status || !name) {
        return;
    }
    if (state.loggedInUser) {
        status.hidden = false;
        name.textContent = state.loggedInUser;
    } else {
        status.hidden = true;
        name.textContent = "";
    }
}

function applyVisibility(element, hidden) {
    element.hidden = hidden;
    if (element.classList.contains("tab")) {
        element.disabled = hidden;
    }
}

function setupTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            if (tab.hidden || tab.classList.contains("active")) {
                return;
            }
            setActiveTab(tab.dataset.target);
        });
        if (!tab.classList.contains("active")) {
            tab.setAttribute("aria-selected", "false");
        }
    });
    const initialActive = document.querySelector(".tab.active");
    if (initialActive) {
        state.activeTab = initialActive.dataset.target;
    }
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

function initializeEndpointDefaults() {
    const { protocol, hostname, port } = window.location;
    state.host = hostname || "127.0.0.1";

    const numericPort = Number.parseInt(port, 10);
    if (!Number.isNaN(numericPort) && numericPort > 0) {
        state.port = numericPort;
    } else {
        state.port = protocol === "https:" ? 443 : 80;
    }

    const metaApiPath = document.querySelector('meta[name="backend-path"]')?.content?.trim();
    state.path = metaApiPath || "/api";

    logMessage(`后端地址已设置为 ${state.host}:${state.port}${state.path}`, "info");
}

function validateAmountInput(rawAmount) {
    const value = (rawAmount ?? "").trim();
    if (!value) {
        throw new Error("金额不能为空");
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
        throw new Error("金额格式必须为正数，最多保留两位小数");
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error("金额必须为有效数字");
    }
    if (numeric <= 0) {
        throw new Error("金额必须大于 0");
    }
    if (numeric > 1_000_000_000) {
        throw new Error("金额过大，请检查输入");
    }
    return numeric.toFixed(2);
}

function validateDateInput(rawDate, { required }) {
    const value = (rawDate ?? "").trim();
    if (!value) {
        if (required) {
            throw new Error("日期不能为空");
        }
        return "";
    }
    if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(value)) {
        throw new Error("日期格式必须为 YYYY/MM/DD");
    }
    const [yearStr, monthStr, dayStr] = value.split("/");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        throw new Error("日期必须包含有效的年、月、日");
    }
    if (year < 1900 || year > 2100) {
        throw new Error("年份超出允许范围 (1900-2100)");
    }
    if (month < 1 || month > 12) {
        throw new Error("月份必须在 1-12 之间");
    }
    if (day < 1 || day > 31) {
        throw new Error("日期必须在 1-31 之间");
    }
    const jsDate = new Date(year, month - 1, day);
    if (jsDate.getFullYear() !== year || jsDate.getMonth() !== month - 1 || jsDate.getDate() !== day) {
        throw new Error("日期不存在，请检查输入");
    }
    return `${year.toString().padStart(4, "0")}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
}

function composePayload(action, formData) {
    const requiresFormUsername = action === "register" || action === "login";
    let username = "";
    if (requiresFormUsername) {
        username = (formData.get("username") || "").trim();
        if (!username) {
            throw new Error("用户名不能为空");
        }
    } else {
        username = state.loggedInUser || "";
        if (!username) {
            throw new Error("请先登录后再执行该操作");
        }
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
            const normalizedAmount = validateAmountInput(formData.get("amount"));
            const normalizedDate = validateDateInput(formData.get("date"), { required: true });
            const subject = (formData.get("subject") || "").trim();
            const note = (formData.get("note") || "").trim();
            return {
                request: `${username},add,${normalizedAmount},${normalizedDate},${subject},${note}`,
                displayValues: {
                    username,
                    amount: normalizedAmount,
                    date: normalizedDate,
                    subject: subject || "(未填写)",
                    note
                }
            };
        }
        case "search": {
            const startDate = validateDateInput(formData.get("startDate"), { required: false });
            const endDate = validateDateInput(formData.get("endDate"), { required: false });
            if (startDate && endDate) {
                const [sy, sm, sd] = startDate.split("/").map(Number);
                const [ey, em, ed] = endDate.split("/").map(Number);
                const startTime = new Date(sy, sm - 1, sd).getTime();
                const endTime = new Date(ey, em - 1, ed).getTime();
                if (startTime > endTime) {
                    throw new Error("开始日期不能晚于结束日期");
                }
            }
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
    // Build an origin-aware URL so the client uses the same scheme as the page
    // (important when the page is served via HTTPS through ngrok). Do not
    // hardcode `http://` here.
    const scheme = window.location.protocol; // includes trailing ':' e.g. 'https:'
    const hostPort = state.port ? `${state.host}:${state.port}` : state.host;
    const base = `${scheme}//${hostPort}`;
    const endpoint = new URL(state.path, base);
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

    if (parsed.action === "login" && parsed.success) {
        const user = context?.username;
        if (user) {
            state.loggedInUser = user;
            logMessage(`已登录账户：${user}`);
        }
        updateAuthUI();
        setActiveTab("add");
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

