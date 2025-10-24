#!/usr/bin/env node

/**
 * Reverse proxy that exposes both static resources (Python server) and
 * HTTP→TCP bridge on a single public port for ngrok free-tier usage.
 *
 * Routing rules:
 *   - GET / or any non /api path → static resource server (default 127.0.0.1:8082)
 *   - /static/* paths are rewritten to remove the /static prefix before they are
 *     forwarded to the static resource server.
 *   - /api or /api/* → HTTP→TCP proxy (default 127.0.0.1:8081) with the /api
 *     prefix stripped, so the bridge keeps seeing the original paths it expects.
 *
 * Environment variables:
 *   REVERSE_PROXY_PORT      → listening port for this reverse proxy (default 8080)
 *   STATIC_SERVICE_HOST     → host of the static resource server (default 127.0.0.1)
 *   STATIC_SERVICE_PORT     → port of the static resource server (default 8082)
 *   API_SERVICE_HOST        → host of the HTTP→TCP proxy (default 127.0.0.1)
 *   API_SERVICE_PORT        → port of the HTTP→TCP proxy (default 8081)
 */

const http = require("http");
const { URL } = require("url");

const LISTEN_PORT = parseInt(process.env.REVERSE_PROXY_PORT ?? "8080", 10);
const STATIC_HOST = process.env.STATIC_SERVICE_HOST ?? "127.0.0.1";
const STATIC_PORT = parseInt(process.env.STATIC_SERVICE_PORT ?? "8082", 10);
const API_HOST = process.env.API_SERVICE_HOST ?? "127.0.0.1";
const API_PORT = parseInt(process.env.API_SERVICE_PORT ?? "8081", 10);

function log(message, extra = "") {
    const timestamp = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(`[${timestamp}] ${message}${extra ? ` ${extra}` : ""}`);
}

function buildProxyOptions(targetHost, targetPort, path, originalRequest) {
    const headers = { ...originalRequest.headers };
    headers.host = `${targetHost}:${targetPort}`;

    return {
        hostname: targetHost,
        port: targetPort,
        path,
        method: originalRequest.method,
        headers,
    };
}

function selectTarget(reqUrl) {
    const parsedUrl = new URL(reqUrl, `http://127.0.0.1:${LISTEN_PORT}`);
    let pathname = parsedUrl.pathname;
    const search = parsedUrl.search ?? "";

    if (pathname === "/api" || pathname.startsWith("/api/")) {
        const stripped = pathname.length === 4 ? "/" : pathname.slice(4);
        return {
            type: "api",
            host: API_HOST,
            port: API_PORT,
            path: stripped + search,
        };
    }

    if (pathname === "/" || pathname === "") {
        return {
            type: "static",
            host: STATIC_HOST,
            port: STATIC_PORT,
            path: `/index.html${search}`,
        };
    }

    if (pathname.startsWith("/static/")) {
        const rewritten = pathname.slice("/static".length) || "/";
        return {
            type: "static",
            host: STATIC_HOST,
            port: STATIC_PORT,
            path: `${rewritten}${search}`,
        };
    }

    return {
        type: "static",
        host: STATIC_HOST,
        port: STATIC_PORT,
        path: `${pathname}${search}`,
    };
}

const server = http.createServer((req, res) => {
    const target = selectTarget(req.url);
    log("Routing request", `${req.method} ${req.url} → ${target.type}@${target.host}:${target.port}${target.path}`);

    const proxyReq = http.request(
        buildProxyOptions(target.host, target.port, target.path, req),
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
            proxyRes.pipe(res);
        },
    );

    proxyReq.on("error", (error) => {
        log("Proxy error", `${error.message}`);
        if (!res.headersSent) {
            res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        }
        res.end("Upstream service unavailable\n");
    });

    req.pipe(proxyReq);
});

server.listen(LISTEN_PORT, () => {
    log("Reverse proxy started", `http://127.0.0.1:${LISTEN_PORT}`);
    log("Static upstream", `${STATIC_HOST}:${STATIC_PORT}`);
    log("API upstream", `${API_HOST}:${API_PORT}`);
});

server.on("error", (error) => {
    log("Reverse proxy fatal error", error.message);
    process.exitCode = 1;
});
