import { NextResponse } from "next/server";
import crypto from "crypto";

import {
  createInvitation,
  listPendingInvitations,
  type UserRole,
} from "@labo/db/repos/usuarios";
import { getCurrentUser, AuthError } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";
import { sendEmail } from "@labo/lib/server/email";

const INVITE_TTL_DAYS = 7;

function generateInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function buildInviteEmail(
  role: UserRole,
  inviteUrl: string,
): { subject: string; html: string } {
  const roleName = role === "admin" ? "Administrador" : "Operador";
  return {
    subject: "[RV Laboratorio] Te invitaron a unirte",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">
        <h2 style="font-size: 18px; margin: 0 0 16px;">Invitación a RV Laboratorio</h2>
        <p style="margin: 0 0 12px;">
          Fuiste invitado a unirte a <strong>RV Laboratorio</strong> con el rol de <strong>${roleName}</strong>.
        </p>
        <p style="margin: 0 0 20px;">
          El enlace es válido por <strong>${INVITE_TTL_DAYS} días</strong>.
          Al aceptar, elegís tu contraseña y tu cuenta queda activa de inmediato.
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${inviteUrl}"
             style="display:inline-block;padding:10px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
            Aceptar invitación
          </a>
        </p>
        <p style="margin: 0; color: #64748b; font-size: 12px;">
          Si no esperabas esta invitación, ignorá este email.
        </p>
      </div>
    `,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }

    const body = (await req.json()) as { email?: string; role?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const role = body.role as UserRole | undefined;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    if (!role || !["admin", "operador"].includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    const { token, tokenHash } = generateInviteToken();
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await createInvitation(getAdminDb(), {
      email,
      role,
      tokenHash,
      invitedBy: user.userId,
      expiresAt,
    });

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      req.headers.get("origin") ??
      "http://localhost:3000";
    const inviteUrl = `${origin}/accept-invite?token=${token}`;
    const { subject, html } = buildInviteEmail(role, inviteUrl);

    await sendEmail({ to: email, subject, html });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    console.error("[invite:POST] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }

    const invitations = await listPendingInvitations(getAdminDb());

    return NextResponse.json({ invitations });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    console.error("[invite:GET] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
