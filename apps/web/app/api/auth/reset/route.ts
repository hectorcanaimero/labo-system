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

  // InsForge envía el código de 6 dígitos por email (resetPasswordMethod: "code").
  // Siempre respondemos OK (anti-enumeración); rate limiting, TTL y single-use
  // del código los gestiona InsForge (built-in).
  await requestInsforgePasswordReset(email).catch(() => undefined);

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
// PUT — completar reset con código + nueva contraseña
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
  const { email, code, password } = parsed.data;

  try {
    await completeInsforgePasswordReset(email, code, password);
  } catch (err) {
    if (err instanceof PasswordResetError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: 'RESET_FAILED' }, { status: 400 });
  }

  // Audit log de completion. InsForge ya validó el código; recuperamos el
  // usuario de dominio por email para dejar la FK correcta en la traza.
  const sql = getSql();
  const usuario = await getByEmail(sql, email).catch(() => null);
  await sql`
    INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
    VALUES (
      ${usuario?.id ?? null},
      ${'auth.password_reset_completed'},
      ${'auth'},
      ${usuario?.id ?? null},
      ${sql.json({ email_intent: email })}
    )
  `.catch(() => undefined);

  return NextResponse.json({ ok: true });
}
