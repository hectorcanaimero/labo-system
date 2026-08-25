import { NextResponse } from "next/server";
import crypto from "crypto";
import type { Sql } from "postgres";

import { getSql, withTransaction } from "@labo/db/client";
import {
  getInvitationByTokenHash,
  markInvitationAccepted,
  syncFromAuth,
} from "@labo/db/repos/usuarios";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Crea un usuario en InsForge Auth usando la API de admin (service role).
 * Devuelve el `auth_user_id` del usuario creado.
 *
 * InsForge endpoint: POST /api/auth/admin/users
 * Requiere INSFORGE_SERVICE_KEY (service role key, no la anon key).
 */
async function createInsforgeUser(
  email: string,
  password: string,
): Promise<string> {
  const baseUrl = (process.env.INSFORGE_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("INSFORGE_URL no está definida");

  const serviceKey =
    process.env.INSFORGE_SERVICE_KEY ?? process.env.INSFORGE_ANON_KEY ?? "";

  const res = await fetch(`${baseUrl}/api/auth/admin/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
    cache: "no-store",
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      `InsForge user creation failed (${res.status}): ${payload.error?.message ?? "unknown"}`,
    );
  }

  const payload = (await res.json()) as { user?: { id?: string } };
  const userId = payload.user?.id;
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
    const sql = getSql();

    // Validate invitation (read-only, outside transaction)
    const invitation = await getInvitationByTokenHash(sql, tokenHash);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitación inválida" },
        { status: 400 },
      );
    }
    if (invitation.accepted) {
      return NextResponse.json(
        { error: "Esta invitación ya fue utilizada" },
        { status: 400 },
      );
    }
    if (invitation.expires_at < new Date()) {
      return NextResponse.json(
        { error: "La invitación ha expirado" },
        { status: 400 },
      );
    }

    // Create user in InsForge Auth (external call, before transaction)
    const authUserId = await createInsforgeUser(invitation.email, password);

    // Postgres transaction: insert usuarios row + mark invitation accepted atomically.
    // TransactionSql from postgres.js is structurally compatible with Sql; cast is safe.
    await withTransaction(async (tx) => {
      const txSql = tx as unknown as Sql;
      await syncFromAuth(txSql, {
        authUserId,
        email: invitation.email,
        nombre: invitation.email,
        role: invitation.role,
      });
      await markInvitationAccepted(txSql, invitation.id);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[accept-invite:POST] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
