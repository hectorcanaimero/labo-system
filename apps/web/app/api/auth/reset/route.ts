import { NextResponse, type NextRequest } from 'next/server';

import { getByEmail, logAuthEvent } from '@labo/db/repos/usuarios';
import { getAdminDb } from '@/lib/db-server';
import {
  completeInsforgePasswordReset,
  PasswordResetError,
  PasswordRecoveryConfirmationSchema,
  PasswordRecoveryRequestSchema,
  requestInsforgePasswordReset,
} from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — solicitar reset de contraseña
export async function POST(request: NextRequest): Promise<Response> {
  const parsed = PasswordRecoveryRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_INPUT' } },
      { status: 400 },
    );
  }
  const { email } = parsed.data;

  // InsForge envía el código por email (resetPasswordMethod: "code").
  // Siempre respondemos OK (anti-enumeración); rate limiting, TTL y single-use
  // los gestiona InsForge.
  await requestInsforgePasswordReset(email).catch(() => undefined);

  // Audit log solo si el usuario existe en nuestra tabla.
  const db = getAdminDb();
  const usuario = await getByEmail(db, email).catch(() => null);
  if (usuario) {
    await logAuthEvent(db, {
      usuarioId: usuario.id,
      action: 'auth.login_failed' as never, // TODO: extender AuthAction con reset events
      emailIntent: email,
      metadata: { subtype: 'password_reset_requested' },
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    data: { status: 'RECOVERY_REQUEST_ACCEPTED' },
  });
}

// PUT — completar reset con código + nueva contraseña
export async function PUT(request: NextRequest): Promise<Response> {
  const parsed = PasswordRecoveryConfirmationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === 'password' && issue.code === 'too_small',
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

  const db = getAdminDb();
  const usuario = await getByEmail(db, email).catch(() => null);
  await logAuthEvent(db, {
    usuarioId: usuario?.id ?? null,
    action: 'auth.login' as never, // TODO: extender AuthAction con reset events
    emailIntent: email,
    metadata: { subtype: 'password_reset_completed' },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
