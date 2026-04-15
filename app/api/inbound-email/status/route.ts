/**
 * /api/inbound-email/status
 *
 * GET ?userId=xxx — Returns the last 5 syncs from KV.
 */

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

interface SyncLogEntry {
  store: string;
  count: number;
  syncedAt: string;
  items: string[];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = req.nextUrl.searchParams.get('userId')?.trim();
    if (!userId) {
      return NextResponse.json({ error: 'Missing or empty userId query parameter.' }, { status: 400 });
    }

    const allEntries = await kv.get<SyncLogEntry[]>(`fn:synclog:${userId}`) ?? [];
    const last5 = allEntries.slice(-5);
    const lastSyncedAt = last5.length > 0 ? last5[last5.length - 1].syncedAt : null;

    return NextResponse.json({ syncs: last5, lastSyncedAt });
  } catch (err) {
    console.error('[inbound-email/status] GET error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
