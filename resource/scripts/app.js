const state = {
    host: "",
    port: 80,
    path: "/api",
    loggedInUser: null,
    activeTab: "register",
    records: [],
    recordsLoaded: false,
    recordsSortOrder: "desc",
    searchSortOrder: "desc",
    lastSearchEntries: [],
    lastSearchContext: null
};
let defaultRecordsEmptyMessage = "暂无记录。提交账目后即可在此查看并删除。";
const confirmState = {
    overlay: null,
    dialogEl: null,
    titleEl: null,
    messageEl: null,
    okButton: null,
    cancelButton: null,
    resolve: null,
    active: false,
    hideTimer: null,
    defaults: null
};
const actionsWithCustomCompletion = new Set(["login", "search", "add", "clear"]);
document.addEventListener("DOMContentLoaded", () => {
    const emptyNotice = document.getElementById("recordsEmptyNotice");
    if (emptyNotice && emptyNotice.textContent) {
        defaultRecordsEmptyMessage = emptyNotice.textContent;
    }
    initializeEndpointDefaults();
    setupTabs();
    setupForms();
    setupConfirmModal();
    setupRecordsUI();
    setupSearchSortControl();
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
    if (target === "records" && state.loggedInUser) {
        refreshRecords({ force: false, silent: true });
    }
}

function updateAuthUI() {
    const authed = Boolean(state.loggedInUser);
    document.querySelectorAll("[data-requires-auth]").forEach((element) => {
        applyVisibility(element, !authed);
    });
    document.querySelectorAll("[data-hide-after-login]").forEach((element) => {
        applyVisibility(element, authed);
    });
    // 保留页面标题随登录用户变化的逻辑（移除了单独的 DOM 状态面板）
    const title = document.getElementById("pageTitle");
    if (title) {
        title.textContent = state.loggedInUser ? `${state.loggedInUser} 的记账本` : "记账系统";
    }
    document.title = state.loggedInUser ? `${state.loggedInUser} 的记账本` : "记账系统";

    const activeTabButton = document.querySelector(".tab.active");
    if (!activeTabButton || activeTabButton.hidden) {
        const fallback = document.querySelector(".tab:not([hidden])");
        if (fallback) {
            setActiveTab(fallback.dataset.target);
        }
    }

    if (!authed) {
        state.records = [];
        state.recordsLoaded = false;
        state.lastSearchEntries = [];
        state.lastSearchContext = null;
        resetRecordsView();
        clearSearchResult();
    }
}

// 已移除：页面中不再显示单独的用户状态面板（#userStatus）。
// 页面标题仍由 `updateAuthUI` 中的逻辑更新以反映登录用户。

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
                const actionLabel = describeAction(action);
                logMessage(`正在提交${actionLabel}请求…`, "info");
                const responseText = await sendPayload(request);
                showResponse(responseText);
                const parsed = parseResponse(responseText);
                showParsed(parsed);
                handlePostAction(parsed, displayValues);
                const success = parsed?.success;
                // 对于某些操作（登录、查询、新增、清空），我们由各自的处理函数输出更友好的用户消息，
                // 因此在成功时避免重复输出“请求已完成”这种通用日志。
                if (success === false) {
                    logMessage(`${actionLabel}请求已完成，但服务器未能执行该操作。`, "warning");
                } else {
                    if (!actionsWithCustomCompletion.has(action)) {
                        logMessage(`${actionLabel}请求已完成。`, "info");
                    }
                }
            } catch (error) {
                const actionLabel = describeAction(action);
                logMessage(`${actionLabel}请求未完成：${summarizeError(error)}`, "error");
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

    logMessage("后端地址已准备就绪。", "info");
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
    // 统一把格式解析与错误分类为三类：
    // - 日期格式错误（无法解析为 YYYY/MM/DD 或包含非整数字段）
    // - 日期不存在（例如 2025/02/30，或月/日超出合理范围）
    // - 超出允许范围（年份不在 [1900,2100] 之内）
    if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(value)) {
        throw new Error("日期格式错误");
    }
    const [yearStr, monthStr, dayStr] = value.split("/");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        throw new Error("日期格式错误");
    }
    if (year < 1900 || year > 2100) {
        throw new Error("年份超出允许范围，应在1900-2100之间");
    }
    // 月份/日如果超出合理数位（1-12,1-31）视为日期不存在。
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        throw new Error("日期不存在");
    }
    const jsDate = new Date(year, month - 1, day);
    if (jsDate.getFullYear() !== year || jsDate.getMonth() !== month - 1 || jsDate.getDate() !== day) {
        throw new Error("日期不存在");
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
    if (cols.length >= 6) {
        const [idStr, username, amountStr, date, subject, note] = cols;
        const id = idStr && idStr !== "null" ? Number(idStr) : null;
        const amount = Number(amountStr);
        return {
            id: Number.isFinite(id) ? id : null,
            username,
            amount: Number.isFinite(amount) ? amount : null,
            date: normalizeField(date),
            subject: normalizeField(subject),
            note: normalizeField(note)
        };
    }
    const [username, amountStr, date, subject, note] = cols;
    const amount = Number(amountStr);
    return {
        id: null,
        username,
        amount: Number.isFinite(amount) ? amount : null,
        date: normalizeField(date),
        subject: normalizeField(subject),
        note: normalizeField(note)
    };
}

function handlePostAction(parsed, context) {
    if (!parsed) {
        return;
    }
    let handled = false;
    if (parsed.action === "search") {
        renderSearchResult(parsed, context);
        logSearchOutcome(parsed, context);
        handled = true;
    }
    if (parsed.action === "list") {
        renderRecords(parsed.entries || []);
        logRecordsLoaded();
        handled = true;
    }
    if (parsed.action === "clear") {
        logClearOutcome(parsed);
        handled = true;
        if (parsed.success) {
            state.records = [];
            state.recordsLoaded = false;
            resetRecordsView();
            clearSearchResult();
        }
    }
    if (!handled) {
        clearSearchResult();
    }

    if (parsed.action === "login" && parsed.success) {
        const user = context?.username;
        if (user) {
            state.loggedInUser = user;
            logMessage(`已登录账户：${user}`);
        }
        state.recordsLoaded = false;
        updateAuthUI();
        setActiveTab("add");
    }
    if (parsed.action === "add") {
        logAddOutcome(parsed, context);
        if (parsed.success) {
            state.recordsLoaded = false;
            if (state.activeTab === "records") {
                refreshRecords({ force: true, silent: true });
            }
        }
    }
    if (parsed.action === "delete") {
        logDeleteOutcome(parsed, context);
        if (parsed.success) {
            state.recordsLoaded = false;
            if (state.activeTab === "records") {
                refreshRecords({ force: true, silent: true });
            }
        }
    }
    if (parsed.message && parsed.action !== "clear") {
        logMessage(`服务器提示：${parsed.message}`);
    }
}

function renderSearchResult(parsed, context) {
    const container = document.getElementById("searchResult");
    const summary = document.getElementById("searchSummary");
    const tbody = document.getElementById("searchTableBody");
    if (!container || !summary || !tbody) {
        return;
    }

    state.lastSearchEntries = Array.isArray(parsed?.entries) ? parsed.entries.slice() : [];
    state.lastSearchContext = context || null;

    container.hidden = false;
    renderSearchEntries();
}

function renderSearchEntries() {
    const container = document.getElementById("searchResult");
    const summary = document.getElementById("searchSummary");
    const tbody = document.getElementById("searchTableBody");
    const sortToggle = document.getElementById("searchSortToggle");
    if (!container || !summary || !tbody) {
        return;
    }

    tbody.innerHTML = "";
    const entries = sortEntriesByDate(state.lastSearchEntries || [], state.searchSortOrder);
    if (sortToggle) {
        applySortToggleLabel(sortToggle, state.searchSortOrder);
    }

    const filtersLabel = formatSearchFilters(state.lastSearchContext);
    if (!entries.length) {
        summary.textContent = filtersLabel ? `没有符合条件的记录${filtersLabel}` : "没有符合条件的记录。";
        return;
    }

    summary.textContent = `共返回 ${entries.length} 条记录${filtersLabel}`;

    entries.forEach((entry) => {
        const row = document.createElement("tr");

        const userCell = document.createElement("td");
        userCell.textContent = entry.username || "";

        const amountCell = document.createElement("td");
        amountCell.textContent = formatAmount(entry.amount);

        const dateCell = document.createElement("td");
        dateCell.textContent = entry.date || "";

        const subjectCell = document.createElement("td");
        subjectCell.textContent = entry.subject || "";

        const noteCell = document.createElement("td");
        noteCell.textContent = entry.note || "";

        const actionCell = document.createElement("td");
        actionCell.appendChild(createDeleteButton(entry, { enforceOwnership: true }));

        row.appendChild(userCell);
        row.appendChild(amountCell);
        row.appendChild(dateCell);
        row.appendChild(subjectCell);
        row.appendChild(noteCell);
        row.appendChild(actionCell);

        tbody.appendChild(row);
    });
}

function clearSearchResult() {
    const container = document.getElementById("searchResult");
    const summary = document.getElementById("searchSummary");
    const tbody = document.getElementById("searchTableBody");
    if (!container || !summary || !tbody) {
        return;
    }
    container.hidden = true;
    summary.textContent = "";
    tbody.innerHTML = "";
    state.lastSearchEntries = [];
    state.lastSearchContext = null;
}

function showRequest(raw) {
    const preview = document.getElementById("requestPreview");
    if (!preview) {
        return;
    }
    preview.value = raw ?? "";
}

function showResponse(raw) {
    const preview = document.getElementById("responsePreview");
    if (!preview) {
        return;
    }
    preview.value = raw ?? "";
}

function showParsed(parsed) {
    const preview = document.getElementById("parsedPreview");
    if (!preview) {
        return;
    }
    if (!parsed) {
        preview.textContent = "(无解析结果)";
        return;
    }
    preview.textContent = JSON.stringify(parsed, null, 2);
}

function setupConfirmModal() {
    const overlay = document.getElementById("confirmOverlay");
    if (!overlay) {
        return;
    }
    confirmState.overlay = overlay;
    confirmState.dialogEl = overlay.querySelector(".confirm-dialog");
    confirmState.titleEl = document.getElementById("confirmTitle");
    confirmState.messageEl = document.getElementById("confirmMessage");
    confirmState.okButton = overlay.querySelector("[data-confirm-ok]");
    confirmState.cancelButton = overlay.querySelector("[data-confirm-cancel]");

    const defaults = {
        title: confirmState.titleEl ? confirmState.titleEl.textContent || "确认操作" : "确认操作",
        message: confirmState.messageEl ? confirmState.messageEl.textContent || "确定要执行此操作吗？" : "确定要执行此操作吗？",
        confirmLabel: confirmState.okButton ? confirmState.okButton.textContent || "确认" : "确认",
        cancelLabel: confirmState.cancelButton ? confirmState.cancelButton.textContent || "取消" : "取消"
    };
    confirmState.defaults = defaults;
    if (confirmState.overlay) {
        confirmState.overlay.dataset.variant = "default";
    }
    if (confirmState.dialogEl) {
        confirmState.dialogEl.dataset.variant = "default";
    }

    const resolve = (result) => {
        closeConfirmDialog(Boolean(result));
    };

    if (confirmState.okButton) {
        confirmState.okButton.addEventListener("click", () => resolve(true));
    }
    if (confirmState.cancelButton) {
        confirmState.cancelButton.addEventListener("click", () => resolve(false));
    }
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            resolve(false);
        }
    });
    document.addEventListener("keydown", (event) => {
        if (!confirmState.active) {
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            resolve(false);
        }
    });
}

function showConfirmDialog(options) {
    const defaults = confirmState.defaults || {
        title: "确认操作",
        message: "确定要执行此操作吗？",
        confirmLabel: "确认",
        cancelLabel: "取消"
    };
    if (!confirmState.overlay || !confirmState.messageEl) {
        const fallbackMessage = typeof options === "string" ? options : options?.message || defaults.message;
        return Promise.resolve(window.confirm(fallbackMessage));
    }

    if (confirmState.active) {
        closeConfirmDialog(false);
    }

    if (confirmState.hideTimer) {
        clearTimeout(confirmState.hideTimer);
        confirmState.hideTimer = null;
    }

    const config = typeof options === "string" ? { message: options } : { ...(options || {}) };
    const {
        title = defaults.title,
        message = defaults.message,
        confirmLabel = defaults.confirmLabel,
        cancelLabel = defaults.cancelLabel,
        variant = "default"
    } = config;

    if (confirmState.titleEl) {
        confirmState.titleEl.textContent = title;
    }
    confirmState.messageEl.textContent = message;
    if (confirmState.okButton) {
        confirmState.okButton.textContent = confirmLabel;
        confirmState.okButton.classList.toggle("danger", variant === "danger");
    }
    if (confirmState.cancelButton) {
        confirmState.cancelButton.textContent = cancelLabel;
    }
    if (confirmState.overlay) {
        confirmState.overlay.removeAttribute("hidden");
        confirmState.overlay.setAttribute("aria-hidden", "false");
        confirmState.overlay.classList.remove("visible");
        confirmState.overlay.dataset.variant = variant;
    }
    if (confirmState.dialogEl) {
        confirmState.dialogEl.dataset.variant = variant;
    }

    confirmState.active = true;

    return new Promise((resolve) => {
        confirmState.resolve = resolve;
        requestAnimationFrame(() => {
            if (confirmState.overlay) {
                confirmState.overlay.classList.add("visible");
            }
            if (confirmState.okButton) {
                confirmState.okButton.focus({ preventScroll: true });
            }
        });
    });
}

function closeConfirmDialog(result) {
    if (!confirmState.overlay) {
        if (confirmState.resolve) {
            const resolver = confirmState.resolve;
            confirmState.resolve = null;
            resolver(result);
        }
        return;
    }

    if (!confirmState.active && !confirmState.resolve) {
        return;
    }

    confirmState.active = false;
    confirmState.overlay.classList.remove("visible");
    confirmState.overlay.setAttribute("aria-hidden", "true");

    const resolver = confirmState.resolve;
    confirmState.resolve = null;
    if (resolver) {
        resolver(result);
    }

    if (confirmState.hideTimer) {
        clearTimeout(confirmState.hideTimer);
    }
    confirmState.hideTimer = window.setTimeout(() => {
        confirmState.overlay.setAttribute("hidden", "");
        confirmState.hideTimer = null;
    }, 200);
}

function setupRecordsUI() {
    const recordsSortToggle = document.getElementById("recordsSortToggle");
    if (recordsSortToggle) {
        applySortToggleLabel(recordsSortToggle, state.recordsSortOrder);
        recordsSortToggle.addEventListener("click", () => {
            state.recordsSortOrder = state.recordsSortOrder === "desc" ? "asc" : "desc";
            applySortToggleLabel(recordsSortToggle, state.recordsSortOrder);
            logMessage(`交易记录列表已切换为${describeSortOrder(state.recordsSortOrder)}显示。`);
            renderRecords(state.records);
        });
    }

    const clearBtn = document.getElementById("clearRecordsBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", async () => {
            if (!state.loggedInUser) {
                logMessage("请先登录后再清空记录。", "warning");
                return;
            }
            const confirmed = await showConfirmDialog({
                title: "删除所有交易记录",
                message: "此操作会永久删除当前账户的全部交易记录，且无法撤销。是否继续？",
                confirmLabel: "确认删除",
                cancelLabel: "保留数据",
                variant: "danger"
            });
            if (!confirmed) {
                return;
            }
            clearAllRecords();
        });
    }

    const refreshBtn = document.getElementById("refreshRecordsBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            refreshRecords({ force: true, silent: false });
        });
    }
    registerDeleteHandler("recordsTableBody");
    registerDeleteHandler("searchTableBody");
    updateRecordsCount(0);
}

function setupSearchSortControl() {
    const searchSortToggle = document.getElementById("searchSortToggle");
    if (!searchSortToggle) {
        return;
    }
    applySortToggleLabel(searchSortToggle, state.searchSortOrder);
    searchSortToggle.addEventListener("click", () => {
        state.searchSortOrder = state.searchSortOrder === "desc" ? "asc" : "desc";
        applySortToggleLabel(searchSortToggle, state.searchSortOrder);
        logMessage(`查询结果现以${describeSortOrder(state.searchSortOrder)}显示。`);
        renderSearchEntries();
    });
}

function registerDeleteHandler(target) {
    const container = typeof target === "string" ? document.getElementById(target) : target;
    if (!container) {
        return;
    }
    container.addEventListener("click", async (event) => {
        const source = event.target;
        if (!(source instanceof Element)) {
            return;
        }
        const button = source.closest(".record-delete-btn");
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
            return;
        }
        const entryId = button.dataset.entryId;
        if (!entryId) {
            logMessage("无法删除：缺少记录标识。", "warning");
            return;
        }
        const confirmed = await showConfirmDialog("确定要删除这条记录吗？");
        if (!confirmed) {
            return;
        }
        deleteRecord(entryId);
    });
}

async function refreshRecords({ force = false, silent = true } = {}) {
    if (!state.loggedInUser) {
        resetRecordsView();
        return;
    }
    if (!force && state.recordsLoaded) {
        return;
    }
    const request = `${state.loggedInUser},list`;
    try {
        if (!silent) {
            logMessage("正在加载交易记录...");
        }
        resetRecordsView();
        showRequest(request);
        const responseText = await sendPayload(request);
        showResponse(responseText);
        const parsed = parseResponse(responseText);
        showParsed(parsed);
        if (!parsed || parsed.action !== "list") {
            logMessage("刷新交易记录失败：服务器响应格式不正确。", "error");
            return;
        }
        handlePostAction(parsed, { username: state.loggedInUser });
    } catch (error) {
        const level = silent ? "warning" : "error";
        const summary = summarizeError(error);
        const prefix = silent ? "刷新交易记录遇到问题" : "刷新交易记录失败";
        logMessage(`${prefix}：${summary}`, level);
    }
}

async function deleteRecord(entryId) {
    if (!state.loggedInUser) {
        logMessage("请先登录后再删除记录。", "warning");
        return;
    }
    const trimmed = entryId.trim();
    if (!trimmed) {
        logMessage("无法删除：记录ID无效。", "warning");
        return;
    }
    const request = `${state.loggedInUser},delete,${trimmed}`;
    try {
    logMessage(`正在删除编号 ${trimmed} 的记录...`);
        showRequest(request);
        const responseText = await sendPayload(request);
        showResponse(responseText);
        const parsed = parseResponse(responseText);
        showParsed(parsed);
        handlePostAction(parsed, { entryId: trimmed });
    } catch (error) {
        logMessage(`删除操作失败：${summarizeError(error)}`, "error");
    }
}

async function clearAllRecords() {
    if (!state.loggedInUser) {
        logMessage("请先登录后再清空记录。", "warning");
        return;
    }
    const request = `${state.loggedInUser},clear`;
    try {
        logMessage("正在清空全部交易记录...");
        showRequest(request);
        const responseText = await sendPayload(request);
        showResponse(responseText);
        const parsed = parseResponse(responseText);
        showParsed(parsed);
        if (!parsed || parsed.action !== "clear") {
            logMessage("清空操作失败：服务器响应格式不正确。", "error");
            return;
        }
        handlePostAction(parsed, null);
    } catch (error) {
        logMessage(`清空操作失败：${summarizeError(error)}`, "error");
    }
}

function renderRecords(entries) {
    const board = document.getElementById("recordsBoard");
    const emptyNotice = document.getElementById("recordsEmptyNotice");
    const tbody = document.getElementById("recordsTableBody");
    const sortToggle = document.getElementById("recordsSortToggle");
    if (!board || !emptyNotice || !tbody) {
        return;
    }
    const normalizedEntries = Array.isArray(entries) ? entries : [];
    state.records = sortEntriesByDate(normalizedEntries, state.recordsSortOrder);
    state.recordsLoaded = true;
    tbody.innerHTML = "";

    updateRecordsCount(state.records.length);

    if (sortToggle) {
        applySortToggleLabel(sortToggle, state.recordsSortOrder);
    }

    if (!state.records.length) {
        board.hidden = true;
        emptyNotice.textContent = defaultRecordsEmptyMessage;
        emptyNotice.hidden = false;
        return;
    }

    board.hidden = false;
    emptyNotice.hidden = true;

    state.records.forEach((entry) => {
        const row = document.createElement("tr");

        const amountCell = document.createElement("td");
        amountCell.textContent = formatAmount(entry.amount);

        const dateCell = document.createElement("td");
        dateCell.textContent = entry.date || "";

        const subjectCell = document.createElement("td");
        subjectCell.textContent = entry.subject || "";

        const noteCell = document.createElement("td");
        noteCell.textContent = entry.note || "";

        const actionCell = document.createElement("td");
        actionCell.appendChild(createDeleteButton(entry));

        row.appendChild(amountCell);
        row.appendChild(dateCell);
        row.appendChild(subjectCell);
        row.appendChild(noteCell);
        row.appendChild(actionCell);

        tbody.appendChild(row);
    });
}

function createDeleteButton(entry, { enforceOwnership = false } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "record-delete-btn";
    button.textContent = "删除";

    const id = entry ? entry.id : null;
    const numericId = Number(id);
    if (id == null || Number.isNaN(numericId)) {
        button.disabled = true;
        button.title = "无法删除：记录缺少标识";
        return button;
    }

    const owner = entry ? entry.username : null;
    if (enforceOwnership && state.loggedInUser && owner && owner !== state.loggedInUser) {
        button.disabled = true;
        button.title = "无法删除：该记录不属于当前用户";
        return button;
    }

    button.dataset.entryId = String(numericId);
    return button;
}

function resetRecordsView() {
    const board = document.getElementById("recordsBoard");
    const emptyNotice = document.getElementById("recordsEmptyNotice");
    const tbody = document.getElementById("recordsTableBody");
    if (!board || !emptyNotice || !tbody) {
        return;
    }
    tbody.innerHTML = "";
    board.hidden = true;
    updateRecordsCount(0);
    if (!state.loggedInUser) {
        emptyNotice.textContent = "请先登录后查看交易记录。";
        emptyNotice.hidden = false;
    } else {
        emptyNotice.textContent = defaultRecordsEmptyMessage;
        emptyNotice.hidden = true;
    }
}

function formatAmount(value) {
    if (value == null) {
        return "";
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return "";
    }
    return numeric.toFixed(2);
}

function normalizeField(value) {
    if (value == null || value === "null") {
        return "";
    }
    return value;
}

function sortEntriesByDate(entries, order) {
    const normalizedOrder = order === "asc" ? "asc" : "desc";
    return entries.slice().sort((a, b) => {
        const timeA = getEntryDateValue(a);
        const timeB = getEntryDateValue(b);
        const fallback = normalizedOrder === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        const safeA = Number.isFinite(timeA) ? timeA : fallback;
        const safeB = Number.isFinite(timeB) ? timeB : fallback;

        if (safeA === safeB) {
            const idA = Number.isFinite(a?.id) ? a.id : 0;
            const idB = Number.isFinite(b?.id) ? b.id : 0;
            return normalizedOrder === "asc" ? idA - idB : idB - idA;
        }

        return normalizedOrder === "asc" ? safeA - safeB : safeB - safeA;
    });
}

function getEntryDateValue(entry) {
    if (!entry || typeof entry.date !== "string" || entry.date.trim() === "") {
        return Number.NaN;
    }
    const parts = entry.date.split("/");
    if (parts.length !== 3) {
        return Number.NaN;
    }
    const [yearStr, monthStr, dayStr] = parts;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return Number.NaN;
    }
    const jsDate = new Date(year, month - 1, day);
    if (jsDate.getFullYear() !== year || jsDate.getMonth() !== month - 1 || jsDate.getDate() !== day) {
        return Number.NaN;
    }
    return jsDate.getTime();
}

function applySortToggleLabel(button, order) {
    const normalized = order === "asc" ? "asc" : "desc";
    button.dataset.order = normalized;
    button.textContent = normalized === "asc" ? "日期升序" : "日期降序";
}

function describeSortOrder(order) {
    return order === "asc" ? "日期升序" : "日期降序";
}

function describeAction(action) {
    const map = {
        register: "注册",
        login: "登录",
        add: "新增账目",
        search: "查询账目",
        delete: "删除账目",
        list: "获取交易记录",
        clear: "删除全部账目"
    };
    return map[action] || action || "相关";
}

function summarizeError(error) {
    if (!error) {
        return "发生未知错误";
    }
    const raw = (error.userMessage || error.message || String(error) || "").replace(/\s+/g, " ").trim();
    if (!raw) {
        return "发生未知错误";
    }
    if (/404/.test(raw)) {
        return "服务器返回 404（未找到资源）";
    }
    if (/401/.test(raw)) {
        return "服务器返回 401（未授权）";
    }
    if (/403/.test(raw)) {
        return "服务器拒绝访问（403）";
    }
    if (/500/.test(raw)) {
        return "服务器返回 500（内部错误）";
    }
    if (/Failed to fetch|NetworkError|Network request failed|TypeError: Failed to fetch/i.test(raw)) {
        return "无法连接服务器";
    }
    return raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
}

function formatSearchFilters(context, { withBrackets = true } = {}) {
    if (!context) {
        return "";
    }
    const { startDate, endDate } = context;
    if (!startDate && !endDate) {
        return "";
    }
    let text;
    if (startDate && endDate) {
        text = `范围：${startDate} 至 ${endDate}`;
    } else if (startDate) {
        text = `自 ${startDate} 起`;
    } else {
        text = `截至 ${endDate}`;
    }
    return withBrackets ? `（${text}）` : text;
}

function logRecordsLoaded() {
    const orderLabel = describeSortOrder(state.recordsSortOrder);
    logMessage(`已加载 ${state.records.length} 条交易记录，当前为${orderLabel}。`);
}

function logClearOutcome(parsed) {
    const rawMessage = parsed?.message ?? "";
    const removed = Number.parseInt(rawMessage, 10);
    if (parsed?.success) {
        if (Number.isFinite(removed)) {
            if (removed > 0) {
                logMessage(`已删除 ${removed} 条交易记录。`);
            } else {
                logMessage("当前没有可删除的交易记录。");
            }
        } else {
            logMessage("删除操作已完成。");
        }
    } else {
        const reason = rawMessage || "服务器未返回原因";
        logMessage(`删除操作未成功：${reason}`, "warning");
    }
}

function logSearchOutcome(parsed, context) {
    const count = Array.isArray(parsed?.entries) ? parsed.entries.length : 0;
    const filtersText = formatSearchFilters(context, { withBrackets: false });
    const orderLabel = describeSortOrder(state.searchSortOrder);
    if (count > 0) {
        const filterSegment = filtersText ? `，${filtersText}` : "";
        // 按用户要求使用“当前按日期x序显示”的描述
        logMessage(`本次查询得到 ${count} 条记录，当前按${orderLabel}显示${filterSegment}。`);
    } else {
        const filterSegment = filtersText ? `，${filtersText}` : "";
        logMessage(`本次查询没有找到匹配记录${filterSegment}。`, "warning");
    }
}

function logAddOutcome(parsed, context) {
    const amountDisplay = context?.amount ? `¥${context.amount}` : "金额未提供";
    const date = context?.date || "未填写日期";
    const subject = context?.subject && context.subject !== "(未填写)" ? context.subject : "";
    if (parsed.success) {
        const subjectSegment = subject ? `，用途 ${subject}` : "";
        const note = context?.note ? String(context.note).trim() : "";
        const noteSegment = note ? `，备注：${note}` : "";
        logMessage(`新增账目成功：日期 ${date}，金额 ${amountDisplay}${subjectSegment}${noteSegment}。`);
    } else {
        const reason = parsed.message || "服务器未返回原因";
        logMessage(`新增账目未成功：${reason}`, "warning");
    }
}

function logDeleteOutcome(parsed, context) {
    const entryId = context?.entryId ? Number(context.entryId) : null;
    if (parsed.success) {
        if (entryId != null && Number.isFinite(entryId)) {
            logMessage(`编号 ${entryId} 的记录已删除。`);
        } else {
            logMessage("指定记录已删除。");
        }
    } else {
        const reason = parsed.message || "未找到要删除的记录";
        const prefix = entryId != null && Number.isFinite(entryId) ? `编号 ${entryId} ` : "";
        logMessage(`删除操作未完成：${prefix}${reason}`, "warning");
    }
}

function updateRecordsCount(count) {
    const label = document.getElementById("recordsCount");
    if (!label) {
        return;
    }
    const safeCount = Number.isFinite(count) ? count : 0;
    label.textContent = `共 ${safeCount} 条记录`;
    setClearButtonState(safeCount === 0);
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

function setClearButtonState(disabled) {
    const button = document.getElementById("clearRecordsBtn");
    if (!button) {
        return;
    }
    const shouldDisable = Boolean(disabled);
    button.disabled = shouldDisable;
    if (shouldDisable) {
        button.setAttribute("aria-disabled", "true");
    } else {
        button.removeAttribute("aria-disabled");
    }
}

