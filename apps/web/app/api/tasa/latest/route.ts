import { NextResponse } from 'next/server';

import { getLatest } from '@labo/db/repos/tasa';
import { getAdminDb } from '@/lib/db-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const latest = await getLatest(getAdminDb());
    return NextResponse.json(latest);
  } catch (error) {
    console.error('No se pudo consultar la tasa vigente:', error);
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
