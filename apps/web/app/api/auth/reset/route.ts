import { NextResponse, type NextRequest } from 'next/server';

import { getSql } from '@labo/db/client';
import { getByEmail } from '@labo/db/repos/usuarios';
import {
  completeInsforgePasswordReset,
  PasswordResetError,
  PasswordRecoveryConfirmationSchema,
  PasswordRecoveryRequestSchema,
  requestInsforgePasswordReset,
} from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// POST — solicitar reset de contraseña
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = PasswordRecoveryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT' } }, { status: 400 });
  }
  const { email } = parsed.data;

  // InsForge emite el token criptográficamente seguro, aplica TTL/single-use y
  // lo entrega por email. El fallback al origin de la request mantiene E2E y
  // desarrollo local funcionales sin aceptar un redirect aportado por el cliente.
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  let appOrigin = request.nextUrl.origin;
  if (configuredOrigin) {
    try {
      appOrigin = new URL(configuredOrigin).origin;
    } catch {
      // Config inválida: usar el origin confiable que Next construyó para la request.
    }
  }
  const redirectTo = new URL('/reset-password', appOrigin).toString();

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
        ${'auth.password_reset_requested'},
        ${'auth'},
        ${usuario.id},
        ${sql.json({ email_intent: email })}
      )
    `.catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    data: { status: 'RECOVERY_REQUEST_ACCEPTED' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — completar reset con token + nueva contraseña
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest): Promise<Response> {
  const parsed = PasswordRecoveryConfirmationSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === 'password' && issue.code === 'too_small'
    );
    if (passwordIssue) {
      return NextResponse.json({ error: 'PASSWORD_TOO_SHORT' }, { status: 400 });
    }
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
  const { token, password } = parsed.data;

  try {
    await completeInsforgePasswordReset(token, password);
  } catch (err) {
    if (err instanceof PasswordResetError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: 'RESET_FAILED' }, { status: 400 });
  }

  // Audit log de completion. No tenemos el usuario_id sin decodificar el token;
  // InsForge valida el token server-side y no expone el auth_user_id en la
  // respuesta del PUT. Registramos el evento sin FK para mantener trazabilidad.
  const sql = getSql();
  await sql`
    INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
    VALUES (
      ${null},
      ${'auth.password_reset_completed'},
      ${'auth'},
      ${null},
      ${sql.json({})}
    )
  `.catch(() => undefined);

  return NextResponse.json({ ok: true });
}
