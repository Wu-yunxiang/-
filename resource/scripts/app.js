const state = {
    host: "",
    port: 80,
    path: "/api",
    loggedInUser: null,
    activeTab: "register",
    records: [],
    recordsLoaded: false,
    recordsSortKey: "date-desc",
    searchSortKey: "date-desc",
    lastSearchEntries: [],
    lastSearchFilters: null
};
const DEFAULT_SORT_KEY = "date-desc";
const SUPPORTED_SORT_KEYS = new Set(["date-desc", "date-asc", "amount-desc", "amount-asc", "type-income", "type-expense"]);
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

const DOM_ID_CACHE = Object.create(null);
const SELECTOR_CACHE = Object.create(null);
const BUTTON_POOL = [];
const STATIC_ID_LIST = [
    "app",
    "recordsBoard",
    "recordsCount",
    "recordsEmptyNotice",
    "recordsSortSelect",
    "recordsTableBody",
    "recordsTotals",
    "recordsTotalsDisplay",
    "clearRecordsBtn",
    "refreshRecordsBtn",
    "searchResult",
    "searchSummary",
    "searchTableBody",
    "searchTotals",
    "searchTotalsDisplay",
    "searchSortSelect",
    "confirmOverlay",
    "confirmTitle",
    "confirmMessage",
    "logPanel",
    "requestPreview",
    "responsePreview",
    "parsedPreview",
    "pageTitle"
];

const TAB_BAR_SELECTOR = ".tab-bar";
const TAB_SELECTOR = ".tab";
const ACTION_FORM_SELECTOR = ".action-form";
const FIELD_ROW_SELECT_SELECTOR = ".field-row select";

const networkState = {
    controller: null,
    endpoint: null
};

const LOG_MAX_ENTRIES = 30;

function getCachedElementById(id) {
    if (!id) {
        return null;
    }
    const cached = DOM_ID_CACHE[id];
    if (cached && document.contains(cached)) {
        return cached;
    }
    const element = document.getElementById(id);
    if (element) {
        DOM_ID_CACHE[id] = element;
    }
    return element;
}

function querySelectorCached(selector) {
    if (!selector) {
        return null;
    }
    const cached = SELECTOR_CACHE[selector];
    if (cached && document.contains(cached)) {
        return cached;
    }
    const element = document.querySelector(selector);
    if (element) {
        SELECTOR_CACHE[selector] = element;
    }
    return element;
}

function primeStaticCaches() {
    for (let i = 0, len = STATIC_ID_LIST.length; i < len; i++) {
        getCachedElementById(STATIC_ID_LIST[i]);
    }
}

function clearCachedId(id) {
    if (id && Object.prototype.hasOwnProperty.call(DOM_ID_CACHE, id)) {
        delete DOM_ID_CACHE[id];
    }
}

function acquireDeleteButton() {
    const button = BUTTON_POOL.pop() || document.createElement("button");
    button.type = "button";
    button.className = "record-delete-btn";
    button.textContent = "删除";
    return button;
}

function releaseDeleteButton(button) {
    if (!button) {
        return;
    }
    button.disabled = false;
    button.removeAttribute("title");
    button.removeAttribute("aria-disabled");
    button.dataset.entryId = "";
    BUTTON_POOL.push(button);
}

function releaseRowResources(row) {
    if (!row) {
        return;
    }
    const buttons = row.querySelectorAll("button.record-delete-btn");
    for (let i = 0, len = buttons.length; i < len; i++) {
        releaseDeleteButton(buttons[i]);
    }
}

function recycleTableBody(tbody) {
    if (!tbody) {
        return;
    }
    const children = tbody.children;
    for (let i = children.length - 1; i >= 0; i--) {
        releaseRowResources(children[i]);
    }
    tbody.textContent = "";
}

function cancelPendingRequest() {
    if (networkState.controller) {
        networkState.controller.abort();
        networkState.controller = null;
    }
}

function resetEndpointCache() {
    networkState.endpoint = null;
}

function ensureEndpoint() {
    if (networkState.endpoint) {
        return networkState.endpoint;
    }
    const scheme = window.location.protocol;
    const portNumber = Number(state.port);
    const defaultPort = (scheme === "https:" && portNumber === 443) || (scheme === "http:" && portNumber === 80);
    const hostPort = !portNumber || defaultPort ? state.host : `${state.host}:${portNumber}`;
    const base = `${scheme}//${hostPort}`;
    networkState.endpoint = new URL(state.path, base);
    return networkState.endpoint;
}
document.addEventListener("DOMContentLoaded", () => {
    window.requestAnimationFrame(initializeApplication);
});

function initializeApplication() {
    markDocumentReady();
    primeStaticCaches();

    const emptyNotice = getCachedElementById("recordsEmptyNotice");
    if (emptyNotice && emptyNotice.textContent) {
        defaultRecordsEmptyMessage = emptyNotice.textContent;
    }

    initializeEndpointDefaults();
    setupTabs();
    setupForms();
    setupSelectPlaceholders();
    try { disableSelectClickFocus(); } catch (e) { /* 忽略 */ }
    setupConfirmModal();
    setupRecordsUI();
    setupSearchSortControl();
    updateAuthUI();
    logMessage("客户端已就绪，等待输入。", "info");
}

function markDocumentReady() {
    try {
        document.body.classList.add("js-ready");
    } catch (e) {
        /* 忽略 */
    }
}

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
    const title = getCachedElementById("pageTitle");
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
        state.lastSearchFilters = null;
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
    const tabBar = querySelectorCached(TAB_BAR_SELECTOR);
    if (!tabBar) {
        return;
    }
    tabBar.addEventListener("click", handleTabBarClick);
    const tabs = tabBar.querySelectorAll(TAB_SELECTOR);
    for (let i = 0, len = tabs.length; i < len; i++) {
        const tab = tabs[i];
        if (!tab.classList.contains("active")) {
            tab.setAttribute("aria-selected", "false");
        }
    }
    const initialActive = tabBar.querySelector(`${TAB_SELECTOR}.active`);
    if (initialActive) {
        state.activeTab = initialActive.dataset.target;
    }
}

function handleTabBarClick(event) {
    const tab = event.target instanceof Element ? event.target.closest(TAB_SELECTOR) : null;
    if (!tab || tab.hidden || tab.classList.contains("active")) {
        return;
    }
    setActiveTab(tab.dataset.target);
}

function setupForms() {
    document.addEventListener("submit", handleActionFormSubmit);
}

function handleActionFormSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.classList.contains("action-form")) {
        return;
    }
    event.preventDefault();
    void processActionFormSubmission(form);
}

async function processActionFormSubmission(form) {
    const action = form.dataset.action;
    const actionLabel = describeAction(action);
    try {
        const { request, displayValues } = composePayload(action, new FormData(form));
        showRequest(request);
        logMessage(`正在提交${actionLabel}请求…`, "info");
        const responseText = await sendPayload(request);
        showResponse(responseText);
        const parsed = parseResponse(responseText);
        showParsed(parsed);
        handlePostAction(parsed, displayValues);
        const success = parsed?.success;
        if (success === false) {
            logMessage(`${actionLabel}请求已完成，但服务器未能执行该操作。`, "warning");
        } else if (!actionsWithCustomCompletion.has(action)) {
            logMessage(`${actionLabel}请求已完成。`, "info");
        }
    } catch (error) {
        logMessage(`${actionLabel}请求未完成：${summarizeError(error)}`, "error");
        showResponse(error.stack || error.message || String(error));
        showParsed(null);
    }
}

/**
 * 在页面加载和 select 变化时，为值为空的 select 添加 .placeholder 类，
 * 以便 CSS 能将其显示为与 input 的 placeholder 一致的样式（颜色/大小/字体）。
 */
function setupSelectPlaceholders() {
    const selects = document.querySelectorAll(FIELD_ROW_SELECT_SELECTOR);
    const length = selects.length;
    if (!length) {
        return;
    }
    for (let i = 0; i < length; i++) {
        const select = selects[i];
        updateSelectPlaceholder(select);
        select.addEventListener('change', handleSelectPlaceholderEvent);
        select.addEventListener('input', handleSelectPlaceholderEvent);
    }
}

function handleSelectPlaceholderEvent(event) {
    if (event && event.target instanceof HTMLSelectElement) {
        updateSelectPlaceholder(event.target);
    }
}

function updateSelectPlaceholder(select) {
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }
    try {
        if (select.hasAttribute('data-keep-color')) {
            select.classList.remove('placeholder');
            return;
        }
        if (!select.value) {
            select.classList.add('placeholder');
        } else {
            select.classList.remove('placeholder');
        }
    } catch (e) {
        /* 忽略 */
    }
}

/**
 * 防止点击 select 时出现短暂的焦点闪烁（黑框）。
 * 实现思路：对所有 select 绑定 mousedown，阻止原默认行为，之后 focus 并在下一事件循环触发 click 来展开下拉。
 * 只针对鼠标交互；键盘焦点保持不变，利于无障碍键盘导航。
 */
function disableSelectClickFocus() {
    const selects = document.querySelectorAll('select');
    const length = selects.length;
    if (!length) {
        return;
    }
    for (let i = 0; i < length; i++) {
        const select = selects[i];
        if (select.dataset.noFocusHandlerApplied) {
            continue;
        }
        select.dataset.noFocusHandlerApplied = '1';
        select.addEventListener('mousedown', handleSelectMouseDown, { passive: false });
    }
}

function handleSelectMouseDown(event) {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }
    try {
        event.preventDefault();
        select.focus();
        setTimeout(() => {
            try {
                select.click();
            } catch (err) {
                /* 忽略 */
            }
        }, 0);
    } catch (err) {
        /* 忽略 */
    }
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

    resetEndpointCache();
    ensureEndpoint();

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

function validateEntryType(rawType) {
    const value = (rawType ?? "").trim().toLowerCase();
    if (value === "income" || value === "expense") {
        return value;
    }
    throw new Error("请选择收入或支出类型");
}

function normalizeTypeFilter(rawType) {
    const value = (rawType ?? "").trim();
    if (!value) {
        return "";
    }
    const normalized = value.toLowerCase();
    if (normalized === "income" || normalized === "expense") {
        return normalized;
    }
    throw new Error("类型筛选无效");
}

function normalizeAmountFilter(rawAmount, { label }) {
    const value = (rawAmount ?? "").trim();
    if (!value) {
        return "";
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
        throw new Error(`${label}需为非负数，最多保留两位小数`);
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error(`${label}无效`);
    }
    if (numeric < 0) {
        throw new Error(`${label}不能小于 0`);
    }
    if (numeric > 1_000_000_000) {
        throw new Error(`${label}过大`);
    }
    return numeric.toFixed(2);
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
            const entryType = validateEntryType(formData.get("type"));
            const subject = (formData.get("subject") || "").trim();
            const note = (formData.get("note") || "").trim();
            return {
                request: `${username},add,${normalizedAmount},${normalizedDate},${entryType},${subject},${note}`,
                displayValues: {
                    username,
                    amount: normalizedAmount,
                    date: normalizedDate,
                    entryType,
                    subject: subject || "(未填写)",
                    note
                }
            };
        }
        case "search": {
            const startDate = validateDateInput(formData.get("startDate"), { required: false });
            const endDate = validateDateInput(formData.get("endDate"), { required: false });
            const typeFilter = normalizeTypeFilter(formData.get("type"));
            const minAmount = normalizeAmountFilter(formData.get("minAmount"), { label: "最低金额" });
            const maxAmount = normalizeAmountFilter(formData.get("maxAmount"), { label: "最高金额" });
            if (startDate && endDate) {
                const [sy, sm, sd] = startDate.split("/").map(Number);
                const [ey, em, ed] = endDate.split("/").map(Number);
                const startTime = new Date(sy, sm - 1, sd).getTime();
                const endTime = new Date(ey, em - 1, ed).getTime();
                if (startTime > endTime) {
                    throw new Error("开始日期不能晚于结束日期");
                }
            }
            if (minAmount && maxAmount && Number(minAmount) > Number(maxAmount)) {
                throw new Error("最低金额不能大于最高金额");
            }
            return {
                request: `${username},search,${startDate},${endDate},${typeFilter},${minAmount},${maxAmount}`,
                displayValues: {
                    username,
                    startDate,
                    endDate,
                    typeFilter,
                    minAmount,
                    maxAmount
                }
            };
        }
        default:
            throw new Error(`未知操作: ${action}`);
    }
}

async function sendPayload(request) {
    cancelPendingRequest();
    const controller = new AbortController();
    networkState.controller = controller;
    const endpoint = ensureEndpoint();
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
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text}`);
        }
        return text.trim();
    } finally {
        if (networkState.controller === controller) {
            networkState.controller = null;
        }
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
    if (cols.length >= 7) {
        const [idStr, username, amountStr, typeRaw, date, subject, note] = cols;
        const id = idStr && idStr !== "null" ? Number(idStr) : null;
        const amount = Number(amountStr);
        return {
            id: Number.isFinite(id) ? id : null,
            username,
            amount: Number.isFinite(amount) ? amount : null,
            type: normalizeEntryType(typeRaw),
            date: normalizeField(date),
            subject: normalizeField(subject),
            note: normalizeField(note)
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
            type: "expense",
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
        type: "expense",
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
            // 平滑删除：从本地 state 中移除并从 DOM 以动画方式删除对应行，避免整表刷新
            const entryId = context?.entryId ? String(context.entryId) : null;
            if (entryId) {
                removeEntryFromStateAndUI(entryId);
            } else {
                // 若没有 entryId 则回退为刷新（兼容旧服务行为）
                state.recordsLoaded = false;
                if (state.activeTab === "records") {
                    refreshRecords({ force: true, silent: true });
                }
            }
        }
    }
    if (parsed.message && parsed.action !== "clear") {
        logMessage(`服务器提示：${parsed.message}`);
    }
}

function renderSearchResult(parsed, context) {
    const container = getCachedElementById("searchResult");
    const summary = getCachedElementById("searchSummary");
    const tbody = getCachedElementById("searchTableBody");
    if (!container || !summary || !tbody) {
        return;
    }

    state.lastSearchEntries = Array.isArray(parsed?.entries) ? parsed.entries.slice() : [];
    state.lastSearchFilters = context || null;

    container.hidden = false;
    renderSearchEntries();
}

function renderSearchEntries() {
    const container = getCachedElementById("searchResult");
    const summary = getCachedElementById("searchSummary");
    const tbody = getCachedElementById("searchTableBody");
    const sortSelect = getCachedElementById("searchSortSelect");
    const totalsCell = getCachedElementById("searchTotals");
    if (!container || !summary || !tbody) {
        return;
    }

    recycleTableBody(tbody);
    const normalizedSortKey = normalizeSortKey(state.searchSortKey) || DEFAULT_SORT_KEY;
    if (normalizedSortKey !== state.searchSortKey) {
        state.searchSortKey = normalizedSortKey;
    }
    const entries = sortEntries(state.lastSearchEntries || [], state.searchSortKey);
    if (sortSelect) {
        sortSelect.value = state.searchSortKey;
    }

    const filtersLabel = formatSearchFilters(state.lastSearchFilters);
    const totals = calculateTotals(entries);
    // 将统计显示在查询结果上方的新展示区，并清空表格尾部的统计单元格以避免重复
    updateTotalsCell(getCachedElementById("searchTotalsDisplay"), totals);
    updateTotalsCell(totalsCell, null);

    if (!entries.length) {
        summary.textContent = filtersLabel ? `没有符合条件的记录${filtersLabel}` : "没有符合条件的记录。";
        return;
    }

    summary.textContent = `共返回 ${entries.length} 条记录${filtersLabel}`;
    const fragment = document.createDocumentFragment();
    for (let i = 0, len = entries.length; i < len; i++) {
        fragment.appendChild(buildSearchRow(entries[i]));
    }
    tbody.appendChild(fragment);
}

function buildSearchRow(entry) {
    const row = document.createElement("tr");
    appendCell(row, entry.username || "");
    appendCell(row, formatEntryType(entry.type));
    appendCell(row, formatAmount(entry.amount));
    appendCell(row, entry.date || "");
    appendCell(row, entry.subject || "");
    appendCell(row, entry.note || "");

    const actionCell = document.createElement("td");
    actionCell.appendChild(createDeleteButton(entry, { enforceOwnership: true }));
    row.appendChild(actionCell);
    return row;
}

function buildRecordRow(entry) {
    const row = document.createElement("tr");
    appendCell(row, formatEntryType(entry.type));
    appendCell(row, formatAmount(entry.amount));
    appendCell(row, entry.date || "");
    appendCell(row, entry.subject || "");
    appendCell(row, entry.note || "");

    const actionCell = document.createElement("td");
    actionCell.appendChild(createDeleteButton(entry));
    row.appendChild(actionCell);
    return row;
}

function appendCell(row, text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    row.appendChild(cell);
}

function clearSearchResult() {
    const container = getCachedElementById("searchResult");
    const summary = getCachedElementById("searchSummary");
    const tbody = getCachedElementById("searchTableBody");
    const totalsCell = getCachedElementById("searchTotals");
    if (!container || !summary || !tbody) {
        return;
    }
    container.hidden = true;
    summary.textContent = "";
    recycleTableBody(tbody);
    state.lastSearchEntries = [];
    state.lastSearchFilters = null;
    // 更新上方展示区并清空表格尾部统计
    updateTotalsCell(getCachedElementById("searchTotalsDisplay"), { incomeTotal: 0, expenseTotal: 0 });
    updateTotalsCell(totalsCell, null);
}

function showRequest(raw) {
    const preview = getCachedElementById("requestPreview");
    if (!preview) {
        return;
    }
    preview.value = raw ?? "";
}

function showResponse(raw) {
    const preview = getCachedElementById("responsePreview");
    if (!preview) {
        return;
    }
    preview.value = raw ?? "";
}

function showParsed(parsed) {
    const preview = getCachedElementById("parsedPreview");
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
    const overlay = getCachedElementById("confirmOverlay");
    if (!overlay) {
        return;
    }
    confirmState.overlay = overlay;
    confirmState.dialogEl = overlay.querySelector(".confirm-dialog");
    confirmState.titleEl = getCachedElementById("confirmTitle");
    confirmState.messageEl = getCachedElementById("confirmMessage");
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
    const recordsSortSelect = getCachedElementById("recordsSortSelect");
    if (recordsSortSelect) {
        recordsSortSelect.value = state.recordsSortKey;
        recordsSortSelect.addEventListener("change", handleRecordsSortChange);
        // 与查询排序控件保持一致的提示（鼠标悬停显示当前排序方式）
        try {
            recordsSortSelect.setAttribute('title', describeSortKey(state.recordsSortKey));
        } catch (e) {}
    }

    const clearBtn = getCachedElementById("clearRecordsBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", handleClearRecordsClick);
    }

    const refreshBtn = getCachedElementById("refreshRecordsBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", handleRefreshRecordsClick);
    }
    registerDeleteHandler("recordsTableBody");
    registerDeleteHandler("searchTableBody");
    updateRecordsCount(0);
    // 初始化：在记录上方显示初始统计（0）并清空表脚显示
    updateTotalsCell(getCachedElementById("recordsTotalsDisplay"), { incomeTotal: 0, expenseTotal: 0 });
    updateTotalsCell(getCachedElementById("recordsTotals"), null);
}

function setupSearchSortControl() {
    const searchSortSelect = getCachedElementById("searchSortSelect");
    if (!searchSortSelect) {
        return;
    }
    searchSortSelect.value = state.searchSortKey;
    searchSortSelect.addEventListener("change", handleSearchSortChange);
    // 与交易记录排序控件保持一致的提示（鼠标悬停显示当前排序方式）
    try {
        searchSortSelect.setAttribute('title', describeSortKey(state.searchSortKey));
    } catch (e) {}
}

function handleRecordsSortChange(event) {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }
    const nextKey = normalizeSortKey(select.value);
    if (!nextKey) {
        select.value = state.recordsSortKey;
        return;
    }
    state.recordsSortKey = nextKey;
    logMessage(`交易记录列表已切换为${describeSortKey(nextKey)}。`);
    renderRecords(state.records);
    try {
        select.setAttribute('title', describeSortKey(nextKey));
    } catch (e) {}
}

async function handleClearRecordsClick() {
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
}

function handleRefreshRecordsClick() {
    refreshRecords({ force: true, silent: false });
}

function handleSearchSortChange(event) {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }
    const nextKey = normalizeSortKey(select.value);
    if (!nextKey) {
        select.value = state.searchSortKey;
        return;
    }
    state.searchSortKey = nextKey;
    logMessage(`查询结果现以${describeSortKey(nextKey)}显示。`);
    renderSearchEntries();
    try {
        select.setAttribute('title', describeSortKey(nextKey));
    } catch (e) {}
}

function registerDeleteHandler(target) {
    const container = typeof target === "string" ? getCachedElementById(target) : target;
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
        logMessage("请先登录后再删除全部记录。", "warning");
        return;
    }
    const request = `${state.loggedInUser},clear`;
    try {
        logMessage("正在删除全部交易记录...");
        showRequest(request);
        const responseText = await sendPayload(request);
        showResponse(responseText);
        const parsed = parseResponse(responseText);
        showParsed(parsed);
        if (!parsed || parsed.action !== "clear") {
            logMessage("删除全部操作失败：服务器响应格式不正确。", "error");
            return;
        }
        handlePostAction(parsed, null);
    } catch (error) {
        logMessage(`删除全部操作失败：${summarizeError(error)}`, "error");
    }
}

function renderRecords(entries) {
    const board = getCachedElementById("recordsBoard");
    const emptyNotice = getCachedElementById("recordsEmptyNotice");
    const tbody = getCachedElementById("recordsTableBody");
    const sortSelect = getCachedElementById("recordsSortSelect");
    const totalsCell = getCachedElementById("recordsTotals");
    if (!board || !emptyNotice || !tbody) {
        return;
    }
    const normalizedEntries = Array.isArray(entries) ? entries : [];
    const normalizedSortKey = normalizeSortKey(state.recordsSortKey) || DEFAULT_SORT_KEY;
    if (normalizedSortKey !== state.recordsSortKey) {
        state.recordsSortKey = normalizedSortKey;
    }
    state.records = sortEntries(normalizedEntries, state.recordsSortKey);
    state.recordsLoaded = true;
    recycleTableBody(tbody);

    updateRecordsCount(state.records.length);
    const totals = calculateTotals(state.records);
    // 将统计显示在记录上方的新展示区，并清空表格尾部的统计单元格以避免重复
    updateTotalsCell(getCachedElementById("recordsTotalsDisplay"), totals);
    updateTotalsCell(totalsCell, null);

    if (sortSelect) {
        sortSelect.value = state.recordsSortKey;
    }

    if (!state.records.length) {
        board.hidden = true;
        emptyNotice.textContent = defaultRecordsEmptyMessage;
        emptyNotice.hidden = false;
        return;
    }

    board.hidden = false;
    emptyNotice.hidden = true;

    const fragment = document.createDocumentFragment();
    for (let i = 0, len = state.records.length; i < len; i++) {
        fragment.appendChild(buildRecordRow(state.records[i]));
    }
    tbody.appendChild(fragment);
}

function createDeleteButton(entry, { enforceOwnership = false } = {}) {
    const button = acquireDeleteButton();
    button.disabled = false;
    button.removeAttribute("aria-disabled");
    button.removeAttribute("title");
    button.dataset.entryId = "";
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
    const board = getCachedElementById("recordsBoard");
    const emptyNotice = getCachedElementById("recordsEmptyNotice");
    const tbody = getCachedElementById("recordsTableBody");
    const totalsCell = getCachedElementById("recordsTotals");
    if (!board || !emptyNotice || !tbody) {
        return;
    }
    recycleTableBody(tbody);
    board.hidden = true;
    updateRecordsCount(0);
    // 在记录上方的展示区显示初始统计并清空表格尾部
    updateTotalsCell(getCachedElementById("recordsTotalsDisplay"), { incomeTotal: 0, expenseTotal: 0 });
    updateTotalsCell(totalsCell, null);
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

function sortEntries(entries, key) {
    const normalized = normalizeSortKey(key) || DEFAULT_SORT_KEY;
    return entries.slice().sort((a, b) => compareEntries(a, b, normalized));
}

function compareEntries(a, b, key) {
    switch (key) {
        case "date-asc":
            return compareByDate(a, b, true);
        case "date-desc":
            return compareByDate(a, b, false);
        case "amount-asc":
            return compareByAmount(a, b, true);
        case "amount-desc":
            return compareByAmount(a, b, false);
        case "type-income":
        case "type-expense": {
            const typeResult = compareByType(a, b, key);
            if (typeResult !== 0) {
                return typeResult;
            }
            const dateResult = compareByDate(a, b, false);
            if (dateResult !== 0) {
                return dateResult;
            }
            return compareById(a, b, false);
        }
        default:
            return compareByDate(a, b, false);
    }
}

function compareByDate(a, b, asc) {
    const timeA = getEntryDateValue(a);
    const timeB = getEntryDateValue(b);
    const fallback = asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    const safeA = Number.isFinite(timeA) ? timeA : fallback;
    const safeB = Number.isFinite(timeB) ? timeB : fallback;
    if (safeA !== safeB) {
        return asc ? safeA - safeB : safeB - safeA;
    }
    return compareById(a, b, asc);
}

function compareByAmount(a, b, asc) {
    const amountA = getEntryAmountValue(a);
    const amountB = getEntryAmountValue(b);
    const fallback = asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    const safeA = Number.isFinite(amountA) ? amountA : fallback;
    const safeB = Number.isFinite(amountB) ? amountB : fallback;
    if (safeA !== safeB) {
        return asc ? safeA - safeB : safeB - safeA;
    }
    const dateResult = compareByDate(a, b, false);
    if (dateResult !== 0) {
        return dateResult;
    }
    return compareById(a, b, false);
}

function compareByType(a, b, key) {
    const weightA = getTypeSortWeight(a, key);
    const weightB = getTypeSortWeight(b, key);
    if (weightA !== weightB) {
        return weightA - weightB;
    }
    return 0;
}

function compareById(a, b, asc) {
    const idA = Number.isFinite(a?.id) ? a.id : 0;
    const idB = Number.isFinite(b?.id) ? b.id : 0;
    return asc ? idA - idB : idB - idA;
}

function getTypeSortWeight(entry, key) {
    const type = normalizeEntryType(entry?.type);
    if (key === "type-income") {
        return type === "income" ? 0 : 1;
    }
    if (key === "type-expense") {
        return type === "expense" ? 0 : 1;
    }
    return 0;
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

function getEntryAmountValue(entry) {
    const numeric = Number(entry?.amount);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function normalizeEntryType(rawType) {
    const value = (rawType ?? "").toString().trim().toLowerCase();
    if (value === "income") {
        return "income";
    }
    if (value === "expense") {
        return "expense";
    }
    return "expense";
}

function formatEntryType(type) {
    return normalizeEntryType(type) === "income" ? "收入" : "支出";
}

function normalizeSortKey(key) {
    if (typeof key !== "string") {
        return null;
    }
    const trimmed = key.trim();
    return SUPPORTED_SORT_KEYS.has(trimmed) ? trimmed : null;
}

function describeSortKey(key) {
    const normalized = normalizeSortKey(key) || DEFAULT_SORT_KEY;
    switch (normalized) {
        case "date-asc":
            return "日期升序";
        case "date-desc":
            return "日期降序";
        case "amount-asc":
            return "金额升序";
        case "amount-desc":
            return "金额降序";
        case "type-income":
            return "收入在前";
        case "type-expense":
            return "支出在前";
        default:
            return "日期降序";
    }
}

function calculateTotals(entries) {
    let incomeTotal = 0;
    let expenseTotal = 0;
    entries.forEach((entry) => {
        const amount = getEntryAmountValue(entry);
        if (!Number.isFinite(amount)) {
            return;
        }
        const type = normalizeEntryType(entry?.type);
        if (type === "income") {
            incomeTotal += amount;
        } else {
            expenseTotal += amount;
        }
    });
    return { incomeTotal, expenseTotal };
}

function formatSignedAmount(value, sign) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return `${sign}0.00`;
    }
    return `${sign}${Math.abs(numeric).toFixed(2)}`;
}

function updateTotalsCell(cell, totals) {
    if (!cell) {
        return;
    }
    if (!totals) {
        cell.textContent = "";
        return;
    }
    const incomeText = formatSignedAmount(totals.incomeTotal, "+");
    const expenseText = formatSignedAmount(totals.expenseTotal, "-");
    const net = (Number(totals.incomeTotal) || 0) - (Number(totals.expenseTotal) || 0);
    const netSign = net >= 0 ? "+" : "-";
    const netText = formatSignedAmount(net, netSign);
    // 格式：总计：+xxx / -xxx = +或- xxx
    // 在尾部加上货币符号 ￥
    cell.textContent = `总计：${incomeText} / ${expenseText} = ${netText} ￥`;
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
    const parts = [];
    const { startDate, endDate, typeFilter, minAmount, maxAmount } = context;
    if (startDate || endDate) {
        if (startDate && endDate) {
            parts.push(`范围：${startDate} 至 ${endDate}`);
        } else if (startDate) {
            parts.push(`自 ${startDate} 起`);
        } else if (endDate) {
            parts.push(`截至 ${endDate}`);
        }
    }
    if (typeFilter) {
        parts.push(`类型：${formatEntryType(typeFilter)}`);
    }
    if (minAmount) {
        parts.push(`金额≥${minAmount}`);
    }
    if (maxAmount) {
        parts.push(`金额≤${maxAmount}`);
    }
    if (!parts.length) {
        return "";
    }
    const text = parts.join("，");
    return withBrackets ? `（${text}）` : text;
}

function logRecordsLoaded() {
    const sortLabel = describeSortKey(state.recordsSortKey);
    logMessage(`已加载 ${state.records.length} 条交易记录，当前按${sortLabel}排序。`);
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
    const sortLabel = describeSortKey(state.searchSortKey);
    if (count > 0) {
        const filterSegment = filtersText ? `，${filtersText}` : "";
        logMessage(`本次查询得到 ${count} 条记录，当前按${sortLabel}显示${filterSegment}。`);
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
        const typeLabel = formatEntryType(context?.entryType);
        const typeSegment = typeLabel ? `，类型 ${typeLabel}` : "";
        logMessage(`新增账目成功：日期 ${date}，金额 ${amountDisplay}${typeSegment}${subjectSegment}${noteSegment}。`);
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
    const label = getCachedElementById("recordsCount");
    if (!label) {
        return;
    }
    const safeCount = Number.isFinite(count) ? count : 0;
    label.textContent = `共 ${safeCount} 条记录`;
    setClearButtonState(safeCount === 0);
}

function removeEntryFromStateAndUI(entryId) {
    try {
        const idNum = Number(entryId);
        if (!Number.isFinite(idNum)) {
            return;
        }

        // 从 state.records 过滤掉该条目
        const beforeLen = state.records.length;
        state.records = state.records.filter((e) => Number(e?.id) !== idNum);
        const afterLen = state.records.length;

        // 更新计数与统计（如果当前在 records 页）
        updateRecordsCount(state.records.length);
        const totals = calculateTotals(state.records);
        updateTotalsCell(getCachedElementById("recordsTotalsDisplay"), totals);
        updateTotalsCell(getCachedElementById("recordsTotals"), null);

        // 在 DOM 中查找并平滑移除对应行（records 和 search 两个表）
        const selectors = ["recordsTableBody", "searchTableBody"];
        selectors.forEach((id) => {
            const tbody = getCachedElementById(id);
            if (!tbody) return;
            const button = tbody.querySelector(`button.record-delete-btn[data-entry-id=\"${entryId}\"]`);
            if (button) {
                const row = button.closest("tr");
                if (row) {
                    smoothRemoveRow(row);
                }
            }
        });

        // 若移除后没有记录，切换到空视图
        if (state.records.length === 0) {
            const board = getCachedElementById("recordsBoard");
            const emptyNotice = getCachedElementById("recordsEmptyNotice");
            if (board && emptyNotice) {
                board.hidden = true;
                emptyNotice.textContent = defaultRecordsEmptyMessage;
                emptyNotice.hidden = false;
            }
        }

        // 记录日志
        if (afterLen < beforeLen) {
            logMessage(`已从页面移除记录 ${entryId}。`);
        }
    } catch (e) {
        // 任何异常都不阻断 UI 流程，只记录日志
        logMessage(`在移除记录 ${entryId} 时发生错误：${e?.message || e}`, "warning");
    }
}

function smoothRemoveRow(row) {
    if (!(row instanceof Element)) return;
    // 若已经在移除中，则忽略
    if (row.classList.contains("removing")) return;
    row.classList.add("removing");
    // 确保在 transitionEnd 后移除节点（最多 400ms 的后备）
    const cleanup = () => {
        releaseRowResources(row);
        if (row.parentElement) {
            row.parentElement.removeChild(row);
        }
        row.removeEventListener("transitionend", onEnd);
        clearTimeout(timeout);
        row.classList.remove("removing");
    };
    const onEnd = (ev) => {
        // 仅在 opacity 或 transform 的 transition 结束时执行一次
        if (ev.propertyName === "opacity" || ev.propertyName === "transform") {
            cleanup();
        }
    };
    row.addEventListener("transitionend", onEnd);
    const timeout = setTimeout(cleanup, 420);
}

function logMessage(message, level = "info") {
    const list = getCachedElementById("logPanel");
    const entry = document.createElement("li");
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (level === "error" || level === "warning") {
        entry.classList.add("error");
    }
    list.prepend(entry);
    while (list.children.length > LOG_MAX_ENTRIES) {
        list.removeChild(list.lastChild);
    }
}

function setClearButtonState(disabled) {
    const button = getCachedElementById("clearRecordsBtn");
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

