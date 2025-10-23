#!/usr/bin/env node

/**
 * A minimal HTTP → TCP bridge that keeps the existing TCP server untouched.
 *
 * - HTTP POST requests are accepted at any path (default: http://127.0.0.1:8081/).
 * - The request body is forwarded as a single line (a trailing "\n" is appended
 *   when missing) to the backing TCP server (default: 127.0.0.1:8080).
 * - The bridge waits for the TCP server to close the socket, then streams the
 *   collected response back to the HTTP caller.
 *
 * Environment variables:
 *   PROXY_HTTP_PORT   → listening port for the HTTP bridge           (default 8081)
 *   PROXY_TCP_HOST    → host name / IP of the existing TCP backend   (default 127.0.0.1)
 *   PROXY_TCP_PORT    → port of the TCP backend                      (default 8080)
 *   PROXY_TIMEOUT_MS  → timeout in milliseconds for TCP round trips  (default 8000)
 */

const http = require("http");
const net = require("net");

const HTTP_PORT = parseInt(process.env.PROXY_HTTP_PORT ?? "8081", 10);
const TCP_HOST = process.env.PROXY_TCP_HOST ?? "127.0.0.1";
const TCP_PORT = parseInt(process.env.PROXY_TCP_PORT ?? "8080", 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.PROXY_TIMEOUT_MS ?? "8000", 10);
const MAX_BODY_BYTES = 16 * 1024; // hard limit to avoid accidental huge payloads

function log(message, extra = "") {
    const timestamp = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(`[${timestamp}] ${message}${extra ? ` ${extra}` : ""}`);
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body, "utf8"),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
    res.end(body);
}

function sendPlain(res, status, text) {
    res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
    res.end(text);
}

function handlePost(req, res) {
    let body = "";
    let aborted = false;

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY_BYTES) {
            aborted = true;
            log("Rejecting over-sized request body", `(>${MAX_BODY_BYTES} bytes)`);
            sendJson(res, 413, { error: "Request body too large" });
            req.destroy();
        }
    });

    req.once("end", () => {
        if (aborted) {
            return;
        }

        const payload = body.endsWith("\n") ? body : `${body}\n`;
        const socket = new net.Socket();
        const chunks = [];
        let finished = false;

        const timeoutId = setTimeout(() => {
            if (finished) {
                return;
            }
            finished = true;
            log("TCP round-trip timed out", `(>${REQUEST_TIMEOUT_MS} ms)`);
            socket.destroy(new Error("TCP request timed out"));
            sendJson(res, 504, { error: "TCP backend timed out" });
        }, REQUEST_TIMEOUT_MS);

        socket.once("error", (error) => {
            if (finished) {
                return;
            }
            finished = true;
            clearTimeout(timeoutId);
            log("TCP error", error.message);
            sendJson(res, 502, { error: `TCP backend error: ${error.message}` });
        });

        socket.connect(TCP_PORT, TCP_HOST, () => {
            log("Forwarding request", `${req.method} ${req.url} → ${TCP_HOST}:${TCP_PORT}`);
            socket.write(payload, "utf8", () => {
                socket.end();
            });
        });

        socket.on("data", (chunk) => {
            chunks.push(chunk);
        });

        socket.once("close", () => {
            if (finished) {
                return;
            }
            finished = true;
            clearTimeout(timeoutId);
            const responseBuffer = Buffer.concat(chunks);
            const responseText = responseBuffer.toString("utf8").trim();
            sendPlain(res, 200, responseText);
        });
    });
}

const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Cache-Control",
        });
        res.end();
        return;
    }

    if (req.method === "POST") {
        handlePost(req, res);
        return;
    }

    if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, {
            status: "ok",
            tcpHost: TCP_HOST,
            tcpPort: TCP_PORT,
            timeoutMs: REQUEST_TIMEOUT_MS,
        });
        return;
    }

    sendJson(res, 405, { error: "Only POST is supported at this endpoint" });
});

server.listen(HTTP_PORT, () => {
    log("HTTP→TCP proxy started", `http://127.0.0.1:${HTTP_PORT} → ${TCP_HOST}:${TCP_PORT}`);
});

server.on("error", (error) => {
    log("HTTP server encountered an error", error.message);
    process.exitCode = 1;
});
