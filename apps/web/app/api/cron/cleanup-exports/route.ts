import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('CRON_SECRET is not configured in environment variables.');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Verify x-cron-secret header
    const reqSecret = request.headers.get('x-cron-secret');
    if (!reqSecret || reqSecret !== cronSecret) {
      console.warn('Unauthorized attempt to run export cleanup cron.');
      return new Response('Unauthorized', { status: 401 });
    }

    const baseUrl = process.env.INSFORGE_URL?.replace(/\/$/, '') || 'https://insforge.rvlaboratorio.com';
    const anonKey = process.env.INSFORGE_ANON_KEY;

    if (!anonKey) {
      console.error('INSFORGE_ANON_KEY is not configured.');
      return NextResponse.json({ error: 'Storage configuration missing' }, { status: 500 });
    }

    // 1. List all objects in the exports bucket
    const listUrl = `${baseUrl}/api/storage/buckets/exports/objects?limit=1000`;
    const listRes = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
      },
      cache: 'no-store',
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error('Failed to list objects from InsForge storage:', errText);
      return NextResponse.json({ error: 'Failed to list objects from storage', details: errText }, { status: 500 });
    }

    const listData = await listRes.json();
    const items = listData.data || [];

    // Calculate cutoff time for age > 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    interface StorageObject {
      bucket: string;
      key: string;
      size: number;
      mimeType: string;
      uploadedAt: string;
      url: string;
    }
    const expiredItems = (items as StorageObject[]).filter((item) => {
      const uploadedTime = new Date(item.uploadedAt).getTime();
      return uploadedTime < sevenDaysAgo;
    });

    const deletedKeys: string[] = [];

    // 2. Delete the expired objects from InsForge Storage
    for (const item of expiredItems) {
      const encodedKey = item.key.split('/').map(encodeURIComponent).join('/');
      const deleteUrl = `${baseUrl}/api/storage/buckets/exports/objects/${encodedKey}`;
      const deleteRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
        },
      });

      if (deleteRes.ok) {
        deletedKeys.push(item.key);
      } else {
        const errText = await deleteRes.text();
        console.error(`Failed to delete object with key ${item.key}:`, errText);
      }
    }

    // 3. Record the audit log (migrated to pg)
    // TODO: Use pg to record cleanup.

    return NextResponse.json({
      success: true,
      total_found: items.length,
      expired_count: expiredItems.length,
      deleted_count: deletedKeys.length,
      deleted_keys: deletedKeys,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Export cleanup cron job failed:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
