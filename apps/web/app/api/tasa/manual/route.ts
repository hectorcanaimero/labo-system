import { NextResponse, type NextRequest } from 'next/server';

import { setManual } from '@labo/db/repos/tasa';
import { AuthError, requireRole } from '@labo/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ManualTasaBody {
  tasa?: unknown;
  motivo?: unknown;
}

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

function parseBody(body: ManualTasaBody | null): { tasa: number; motivo?: string } | null {
  if (!body || typeof body.tasa !== 'number' || !Number.isFinite(body.tasa) || body.tasa <= 0) {
    return null;
  }

  if (body.motivo !== undefined && typeof body.motivo !== 'string') {
    return null;
  }

  const motivo = body.motivo?.trim();
  return {
    tasa: body.tasa,
    motivo: motivo && motivo.length > 0 ? motivo : undefined,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as ManualTasaBody | null;
    const input = parseBody(body);

    if (!input) {
      return bad(400, 'INVALID_INPUT');
    }

    const id = await setManual({
      tasa: input.tasa,
      motivo: input.motivo,
      usuarioId: user.userId,
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof AuthError) {
      return bad(error.code === 'UNAUTHENTICATED' ? 401 : 403, error.code);
    }

    console.error('No se pudo registrar la tasa manual:', error);
    return bad(500, 'INTERNAL_SERVER_ERROR');
  }
}
