// Tiny Node.js server (no external deps except better-sqlite3).
// Serves the static site, accepts applications, and provides an admin panel.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import url from "node:url";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Env ----------
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const content = require_text(envPath);
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
function require_text(p) {
  return require_text_sync(p);
}
function require_text_sync(p) {
  const fs = require_fs();
  return fs.readFileSync(p, "utf8");
}
function require_fs() {
  // dynamic so the module loads even before fs import — keeps top-level clean
  return import("node:fs").then((m) => m.default);
}
// simpler version:
import fsSync from "node:fs";
function loadEnvSync() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const content = fsSync.readFileSync(envPath, "utf8");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvSync();

const PORT = Number(process.env.PORT || 4321);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const TELEGRAM_HANDLE = (process.env.TELEGRAM_HANDLE || "Digitaljoshy").replace(/^@/, "");
const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

// ---------- Database ----------
const dataDir = path.join(__dirname, "data");
if (!existsSync(dataDir)) mkdirSync(dataDir);
const db = new Database(path.join(dataDir, "app.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT,
    email TEXT,
    handle_type TEXT,
    handle_value TEXT,
    revenue TEXT,
    message TEXT,
    ip TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'new'
  );
`);

const insertApp = db.prepare(`
  INSERT INTO applications (name, email, handle_type, handle_value, revenue, message, ip, user_agent)
  VALUES (@name, @email, @handle_type, @handle_value, @revenue, @message, @ip, @user_agent)
`);
const listApps = db.prepare(`SELECT * FROM applications ORDER BY id DESC LIMIT 500`);
const updateStatus = db.prepare(`UPDATE applications SET status = ? WHERE id = ?`);
const deleteApp = db.prepare(`DELETE FROM applications WHERE id = ?`);

// ---------- Helpers ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readBody(req, max = 50_000) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > max) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(Buffer.concat(chunks).toString("utf8")); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function basicAuthOk(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(h.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return false;
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    // constant-time compare
    return safeEq(u, ADMIN_USER) && safeEq(p, ADMIN_PASSWORD);
  } catch { return false; }
}
function safeEq(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

async function notifyTelegram(app) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  const text =
    `🔥 New application — Superviral\n\n` +
    `*Name:* ${app.name || "-"}\n` +
    `*Email:* ${app.email || "-"}\n` +
    `*${app.handle_type || "Handle"}:* ${app.handle_value || "-"}\n` +
    `*Revenue:* ${app.revenue || "-"}\n` +
    `*Message:* ${app.message || "-"}`;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "Markdown" }),
    });
  } catch (e) { /* non-critical */ }
}

// ---------- Routes ----------
async function handleApply(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  let raw;
  try { raw = await readBody(req); }
  catch { return send(res, 413, { error: "Body too large" }); }

  let data;
  try { data = JSON.parse(raw); }
  catch { return send(res, 400, { error: "Invalid JSON" }); }

  const name = String(data.name || "").trim().slice(0, 200);
  const email = String(data.email || "").trim().slice(0, 200);
  const handleType = String(data.handle_type || "").trim().slice(0, 30);
  const handleValue = String(data.handle_value || "").trim().slice(0, 200);
  const revenue = String(data.revenue || "").trim().slice(0, 50);
  const message = String(data.message || "").trim().slice(0, 4000);

  if (!name || !email || !handleType || !handleValue) {
    return send(res, 400, { error: "Missing required fields" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return send(res, 400, { error: "Invalid email" });
  }
  const allowedHandles = new Set(["twitter", "telegram", "instagram", "skype"]);
  if (!allowedHandles.has(handleType)) {
    return send(res, 400, { error: "Invalid handle type" });
  }

  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
  const ua = String(req.headers["user-agent"] || "").slice(0, 500);

  const row = {
    name, email,
    handle_type: handleType,
    handle_value: handleValue,
    revenue, message, ip, user_agent: ua,
  };
  const result = insertApp.run(row);
  notifyTelegram(row).catch(() => {});

  send(res, 200, {
    ok: true,
    id: result.lastInsertRowid,
    telegram_handle: TELEGRAM_HANDLE,
    telegram_url: `https://t.me/${TELEGRAM_HANDLE}`,
  });
}

function adminPage() {
  const rows = listApps.all();
  const trs = rows.length === 0
    ? `<tr><td colspan="8" class="empty">No applications yet.</td></tr>`
    : rows.map((r) => `
      <tr data-id="${r.id}">
        <td><span class="status status-${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></td>
        <td class="when">${escapeHtml(r.created_at)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td><a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a></td>
        <td>${escapeHtml(r.handle_type)}: <strong>${escapeHtml(r.handle_value)}</strong></td>
        <td>${escapeHtml(r.revenue)}</td>
        <td class="msg" title="${escapeHtml(r.message)}">${escapeHtml((r.message || "").slice(0, 80))}${(r.message || "").length > 80 ? "…" : ""}</td>
        <td class="actions">
          <button data-action="status" data-status="contacted">Mark contacted</button>
          <button data-action="status" data-status="closed">Close</button>
          <button data-action="delete" class="danger">Delete</button>
        </td>
      </tr>
    `).join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Admin · Superviral</title>
<style>
  body { background:#07050d; color:#f6f3ff; font-family: -apple-system, system-ui, sans-serif; margin:0; padding:32px; }
  h1 { font-size: 1.8rem; letter-spacing:-0.02em; margin:0 0 8px; }
  .sub { color:#9690b3; margin-bottom: 24px; font-size: 0.9rem; }
  table { width:100%; border-collapse: collapse; background: #0c0a16; border:1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow:hidden; }
  th, td { padding: 12px 14px; text-align:left; font-size: 0.88rem; border-bottom: 1px solid rgba(255,255,255,0.06); vertical-align: top; }
  th { background:#14101f; color:#9690b3; font-weight:500; font-size: 0.74rem; letter-spacing:0.12em; text-transform:uppercase; }
  tr:last-child td { border-bottom:none; }
  tr:hover { background: rgba(255,255,255,0.02); }
  .when { font-family: ui-monospace, monospace; color:#9690b3; font-size: 0.78rem; white-space: nowrap; }
  .empty { text-align:center; padding: 48px; color:#9690b3; }
  .actions button { background:#1a1530; color:#f6f3ff; border:1px solid rgba(255,255,255,0.1); padding: 6px 10px; border-radius: 6px; font-size: 0.78rem; cursor:pointer; margin-right:4px; }
  .actions button:hover { background:#251c44; }
  .actions button.danger:hover { background:#5a1f2a; border-color:#aa3344; }
  .status { display:inline-block; padding:3px 10px; border-radius:999px; font-size: 0.72rem; text-transform:uppercase; letter-spacing:0.08em; font-weight:600; }
  .status-new { background: rgba(74,222,128,0.15); color: #4ade80; }
  .status-contacted { background: rgba(231,196,137,0.15); color:#e9c789; }
  .status-closed { background: rgba(150,144,179,0.15); color:#9690b3; }
  .msg { max-width: 280px; }
  a { color:#e9c789; }
  .top { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 24px; flex-wrap:wrap; gap:12px; }
  .count { background: rgba(231,196,137,0.1); color:#e9c789; padding:6px 14px; border-radius:999px; font-size:0.8rem; font-weight:600; }
</style>
</head><body>
  <div class="top">
    <div>
      <h1>🔥 Superviral — Applications</h1>
      <div class="sub">Submissions land here in real time. Refresh to see new ones.</div>
    </div>
    <span class="count">${rows.length} total</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Received</th>
        <th>Name</th>
        <th>Email</th>
        <th>Social</th>
        <th>Revenue</th>
        <th>Message</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${trs}</tbody>
  </table>
<script>
  document.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const action = btn.dataset.action;
      if (action === "delete") {
        if (!confirm("Delete this application?")) return;
        await fetch("/admin/api/" + id, { method: "DELETE" });
      } else if (action === "status") {
        await fetch("/admin/api/" + id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: btn.dataset.status }),
        });
      }
      location.reload();
    });
  });
</script>
</body></html>`;
}

async function handleAdminApi(req, res, id) {
  if (req.method === "DELETE") {
    deleteApp.run(id);
    return send(res, 200, { ok: true });
  }
  if (req.method === "PATCH") {
    const raw = await readBody(req);
    const { status } = JSON.parse(raw || "{}");
    const allowed = new Set(["new", "contacted", "closed"]);
    if (!allowed.has(status)) return send(res, 400, { error: "Invalid status" });
    updateStatus.run(status, id);
    return send(res, 200, { ok: true });
  }
  return send(res, 405, { error: "Method not allowed" });
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  // prevent escape
  if (rel.includes("..")) return send(res, 400, "Bad path");
  const filePath = path.join(__dirname, rel);
  if (!filePath.startsWith(__dirname)) return send(res, 400, "Bad path");
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=3600" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  const pathname = u.pathname;

  // CORS for the apply endpoint (in case you host frontend separately)
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // API
  if (pathname === "/api/apply") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return handleApply(req, res);
  }

  // Admin
  if (pathname.startsWith("/admin")) {
    if (!basicAuthOk(req)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Superviral Admin", charset="UTF-8"' });
      return res.end("Authentication required");
    }
    if (pathname === "/admin" || pathname === "/admin/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(adminPage());
    }
    const m = pathname.match(/^\/admin\/api\/(\d+)$/);
    if (m) return handleAdminApi(req, res, Number(m[1]));
    res.writeHead(404); return res.end("Not found");
  }

  // Static
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Superviral site running at http://localhost:${PORT}`);
  console.log(`Admin panel:   http://localhost:${PORT}/admin  (user: ${ADMIN_USER})`);
});
