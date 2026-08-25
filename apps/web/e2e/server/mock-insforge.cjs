"use strict";

/**
 * Mock InsForge (F4.1.T5).
 *
 * Emula el subset mínimo del backend InsForge que la app consume, para que la
 * suite E2E corra sin infraestructura real:
 *
 *   Auth:
 *     POST   /api/auth/sessions/password   → login email+password
 *     GET    /api/auth/sessions/current    → valida Bearer token → usuario
 *     DELETE /api/auth/sessions/current    → logout (204)
 *
 *   Storage (usado por el export CSV server-side vía @insforge/sdk):
 *     POST   /api/storage/buckets/exports/upload-strategy   → método presigned
 *     POST   /mock-upload                                   → recibe el blob
 *     GET    /api/storage/buckets/exports/download-strategy/objects/*  → URL firmada
 *     GET    /mock-download/*                               → sirve el CSV
 *
 * Los auth_user_id son UUIDs fijos compartidos con `e2e/fixtures/seed-users.json`
 * (el seed de global-setup) para que `syncFromAuth` matchee el perfil de dominio.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.E2E_MOCK_PORT ?? 7330);

function loadUsers() {
  const file = path.join(__dirname, "..", "fixtures", "seed-users.json");
  return JSON.parse(fs.readFileSync(file, "utf8")).users;
}

const users = loadUsers();
const byEmail = new Map(users.map((u) => [u.email, u]));
const byAuthUserId = new Map(users.map((u) => [u.authUserId, u]));

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const method = req.method;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ── Health (para el `url` de readiness del webServer de Playwright) ────
  if (method === "GET" && pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }

  // ── Auth: login (contract real InsForge: POST /api/auth/sessions) ──────
  if (method === "POST" && pathname === "/api/auth/sessions") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const user = byEmail.get(body.email);
    if (body.method !== "password") {
      return json(res, 400, {
        error: { message: "Unsupported method", code: "unsupported_method" },
      });
    }
    if (!user || user.password !== body.password) {
      return json(res, 401, {
        error: { message: "Invalid login credentials", code: "invalid_credentials" },
      });
    }
    return json(res, 200, {
      accessToken: `mock-${user.authUserId}`,
      refreshToken: `mock-refresh-${user.authUserId}`,
      user: { id: user.authUserId, email: user.email, name: user.nombre },
    });
  }

  // ── Auth: login (path legacy del contract alucinado — compat) ──────────
  if (method === "POST" && pathname === "/api/auth/sessions/password") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const user = byEmail.get(body.email);
    if (!user || user.password !== body.password) {
      return json(res, 401, {
        error: { message: "Invalid login credentials", code: "invalid_credentials" },
      });
    }
    return json(res, 200, {
      session: {
        access_token: `mock-${user.authUserId}`,
        refresh_token: `mock-refresh-${user.authUserId}`,
        expires_in: 28800,
      },
      user: { id: user.authUserId, email: user.email, name: user.nombre },
    });
  }

  // ── Auth: validar sesión actual ────────────────────────────────────────
  if (method === "GET" && pathname === "/api/auth/sessions/current") {
    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const authUserId = token.replace(/^mock-/, "");
    const user = byAuthUserId.get(authUserId);
    if (!user) {
      return json(res, 401, {
        error: { message: "Unauthorized", code: "unauthorized" },
      });
    }
    return json(res, 200, {
      user: { id: user.authUserId, email: user.email, name: user.nombre },
    });
  }

  // ── Auth: logout ───────────────────────────────────────────────────────
  if (method === "DELETE" && pathname === "/api/auth/sessions/current") {
    res.writeHead(204);
    return res.end();
  }

  // ── Storage: estrategia de upload (export CSV) ─────────────────────────
  if (method === "POST" && pathname === "/api/storage/buckets/exports/upload-strategy") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const key = body.filename || `exports/presupuestos-${Date.now()}.csv`;
    return json(res, 200, {
      method: "presigned",
      uploadUrl: `http://localhost:${PORT}/mock-upload`,
      key,
      fields: {},
      confirmRequired: false,
    });
  }

  // ── Storage: destino del upload presigned ──────────────────────────────
  if (method === "POST" && pathname === "/mock-upload") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end("{}");
  }

  // ── Storage: URL firmada de descarga (createSignedUrl) ─────────────────
  if (
    method === "GET" &&
    pathname.startsWith("/api/storage/buckets/exports/download-strategy/objects/")
  ) {
    const key = decodeURIComponent(
      pathname.slice("/api/storage/buckets/exports/download-strategy/objects/".length),
    );
    return json(res, 200, {
      url: `http://localhost:${PORT}/mock-download/${encodeURIComponent(key)}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
  }

  // ── Storage: sirve el CSV al navegador (popup del ExportButton) ────────
  if (method === "GET" && pathname.startsWith("/mock-download/")) {
    const csv =
      "\uFEFFfecha,paciente,cédula,estado,total USD\n" +
      "2024-01-01,María Pérez,V-12345678,Borrador,25.00\n";
    res.writeHead(200, { "content-type": "text/csv;charset=utf-8" });
    return res.end(csv);
  }

  json(res, 404, { error: { message: "Not found", code: "not_found" } });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-insforge] escuchando en http://localhost:${PORT}`);
});
