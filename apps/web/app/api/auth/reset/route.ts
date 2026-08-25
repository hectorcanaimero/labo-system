import { NextResponse, type NextRequest } from "next/server";

import { getSql } from "@labo/db/client";
import { getByEmail } from "@labo/db/repos/usuarios";
import {
  completeInsforgePasswordReset,
  PasswordResetError,
  requestInsforgePasswordReset,
} from "@labo/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// POST — solicitar reset de contraseña
// ─────────────────────────────────────────────────────────────────────────────

interface RequestResetBody {
  email?: unknown;
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json().catch(() => null)) as RequestResetBody | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (email.length === 0) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // URL absoluta de /reset-password; InsForge añade ?token=XXXX antes de enviar
  // el email. NEXT_PUBLIC_APP_URL es la fuente canónica del origen de la app.
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const redirectTo = `${appOrigin}/reset-password`;

  // Llama InsForge y siempre responde OK (anti-enumeración).
  // InsForge gestiona: rate limiting, TTL del token, single-use, envío de email.
  await requestInsforgePasswordReset(email, redirectTo).catch(() => undefined);

  // Audit log solo si el usuario existe en nuestra tabla.
  // No registramos nada para emails inexistentes (no revela información).
  const sql = getSql();
  const usuario = await getByEmail(sql, email).catch(() => null);
  if (usuario) {
    await sql`
      INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (
        ${usuario.id},
        ${"auth.password_reset_requested"},
        ${"auth"},
        ${usuario.id},
        ${sql.json({ email_intent: email })}
      )
    `.catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — completar reset con token + nueva contraseña
// ─────────────────────────────────────────────────────────────────────────────

interface CompleteResetBody {
  token?: unknown;
  password?: unknown;
}

export async function PUT(request: NextRequest): Promise<Response> {
  const body = (await request.json().catch(() => null)) as CompleteResetBody | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (token.length === 0 || password.length === 0) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
  }

  try {
    await completeInsforgePasswordReset(token, password);
  } catch (err) {
    if (err instanceof PasswordResetError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: "RESET_FAILED" }, { status: 400 });
  }

  // Audit log de completion. No tenemos el usuario_id sin decodificar el token;
  // InsForge valida el token server-side y no expone el auth_user_id en la
  // respuesta del PUT. Registramos el evento sin FK para mantener trazabilidad.
  const sql = getSql();
  await sql`
    INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
    VALUES (
      ${null},
      ${"auth.password_reset_completed"},
      ${"auth"},
      ${null},
      ${sql.json({})}
    )
  `.catch(() => undefined);

  return NextResponse.json({ ok: true });
}
