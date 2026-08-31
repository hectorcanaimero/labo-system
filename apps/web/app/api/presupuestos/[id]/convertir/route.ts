import { NextResponse, type NextRequest } from 'next/server';

import {
  PACIENTE_LIBRE_REQUIERE_FICHA,
  PRESUPUESTO_NO_APROBADO,
  PRESUPUESTO_NO_ENCONTRADO,
  convertToOrden,
} from '@labo/db/repos/presupuestos';
import { AuthError, getCurrentUser } from '@/lib/server/auth';
import { getAdminDb } from '@/lib/db-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

function toStatus(error: unknown): { status: number; error: string } {
  if (error instanceof AuthError) {
    return {
      status: error.code === 'UNAUTHENTICATED' ? 401 : 403,
      error: error.code,
    };
  }

  const code = error instanceof Error ? error.message : 'ERROR_GENERICO';
  if (code === PRESUPUESTO_NO_ENCONTRADO || code === 'PACIENTE_NO_ENCONTRADO') {
    return { status: 404, error: code };
  }
  if (code === PRESUPUESTO_NO_APROBADO || code === PACIENTE_LIBRE_REQUIERE_FICHA) {
    return { status: 400, error: code };
  }
  return { status: 500, error: 'ERROR_GENERICO' };
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user.role !== 'admin' && user.role !== 'operador') {
      throw new AuthError('UNAUTHORIZED');
    }
    if (!isUuid(params.id)) return bad(400, 'VALIDACION_FALLIDA');

    const body = (await request.json().catch(() => null)) as
      | { paciente_id?: unknown }
      | null;
    const assignPacienteId =
      body?.paciente_id !== undefined && isUuid(body.paciente_id)
        ? body.paciente_id
        : undefined;

    return NextResponse.json(
      await convertToOrden(getAdminDb(), params.id, user.userId, {
        assignPacienteId,
      }),
    );
  } catch (error) {
    const mapped = toStatus(error);
    return bad(mapped.status, mapped.error);
  }
}
