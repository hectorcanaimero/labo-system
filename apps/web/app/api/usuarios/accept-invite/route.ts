import { NextResponse } from "next/server";
import crypto from "crypto";

import {
  getInvitationByTokenHash,
  markInvitationAccepted,
  syncFromAuth,
} from "@labo/db/repos/usuarios";
import { getAdminDb } from "@/lib/db-server";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Crea un usuario en InsForge Auth. Devuelve `auth_user_id`.
 * No hay endpoint admin de alta: usamos el registro normal
 * (POST /api/auth/users, con la anon key). El proyecto exige verificar el
 * email, así que el registro no devuelve el usuario; lo marcamos verificado
 * vía SQL admin (el link de la invitación ya prueba que el email es suyo) y
 * de ahí sale el id.
 */
async function createInsforgeUser(
  email: string,
  password: string,
): Promise<string> {
  const baseUrl = (process.env.INSFORGE_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("INSFORGE_URL no está definida");

  const anonKey =
    process.env.INSFORGE_ANON_KEY ??
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ??
    "";
  const adminKey =
    process.env.INSFORGE_API_KEY ??
    process.env.INSFORGE_SERVICE_KEY ??
    "";

  const res = await fetch(`${baseUrl}/api/auth/users?client_type=server`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ email, password, name: email }),
    cache: "no-store",
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(
      `InsForge user creation failed (${res.status}): ${payload.error ?? ""} ${payload.message ?? ""}`,
    );
  }

  const verify = await fetch(`${baseUrl}/api/database/advance/rawsql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify({
      query:
        "UPDATE auth.users SET email_verified = true WHERE lower(email) = lower($1) RETURNING id",
      params: [email],
    }),
    cache: "no-store",
  });
  if (!verify.ok) {
    throw new Error(`InsForge email verify failed (${verify.status})`);
  }
  const { rows } = (await verify.json()) as { rows?: { id?: string }[] };
  const userId = rows?.[0]?.id;
  if (!userId) throw new Error("InsForge no retornó un user ID");
  return userId;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { token?: string; password?: string };
    const token = (body.token ?? "").trim();
    const password = body.password ?? "";

    if (!token) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 },
      );
    }

    const tokenHash = hashToken(token);
    const db = getAdminDb();

    const invitation = await getInvitationByTokenHash(db, tokenHash);
    if (!invitation) {
      return NextResponse.json({ error: "Invitación inválida" }, { status: 400 });
    }
    if (invitation.accepted) {
      return NextResponse.json(
        { error: "Esta invitación ya fue utilizada" },
        { status: 400 },
      );
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: "La invitación ha expirado" }, { status: 400 });
    }

    const authUserId = await createInsforgeUser(invitation.email, password);

    // Sin transacción PostgREST: si la marca de invitación falla, el usuario
    // queda creado igual (recuperable manualmente). Riesgo aceptable.
    await syncFromAuth(db, {
      authUserId,
      email: invitation.email,
      nombre: invitation.email,
      role: invitation.role,
    });
    await markInvitationAccepted(db, invitation.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[accept-invite:POST] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
