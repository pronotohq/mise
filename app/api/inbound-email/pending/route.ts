/**
 * /api/inbound-email/pending
 *
 * GET  ?userId=xxx — Returns pending items waiting to be picked up by the
 *                    client browser, then atomically deletes them from KV.
 * DELETE ?userId=xxx — Explicit clear of pending items (idempotent fallback).
 */

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

interface PendingEntry {
  items: unknown[];
  store: string;
  syncedAt: string;
  count: number;
}

function getUserIdParam(req: NextRequest): string | null {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId || userId.trim().length === 0) return null;
  return userId.trim();
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = getUserIdParam(req);
    if (!userId) {
      return NextResponse.json({ error: 'Missing or empty userId query parameter.' }, { status: 400 });
    }

    const entry = await kv.get<PendingEntry>(`fn:pending:${userId}`);
    if (!entry) {
      return NextResponse.json({ items: [], store: null, count: 0, syncedAt: null });
    }

    // Atomic pickup — delete after reading
    await kv.del(`fn:pending:${userId}`);

    return NextResponse.json({
      items: entry.items,
      store: entry.store,
      count: entry.count,
      syncedAt: entry.syncedAt,
    });
  } catch (err) {
    console.error('[inbound-email/pending] GET error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = getUserIdParam(req);
    if (!userId) {
      return NextResponse.json({ error: 'Missing or empty userId query parameter.' }, { status: 400 });
    }
    await kv.del(`fn:pending:${userId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[inbound-email/pending] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
