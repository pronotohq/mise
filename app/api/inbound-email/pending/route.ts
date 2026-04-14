/**
 * /api/inbound-email/pending
 *
 * GET  ?userId=xxx — Returns pending items waiting to be picked up by the
 *                    client browser, then atomically deletes them.
 * DELETE ?userId=xxx — Explicit clear of pending items (idempotent fallback).
 *
 * Data stored in data/fn-pending.json:
 * {
 *   "userId": {
 *     "items": [...],
 *     "store": "Blinkit",
 *     "syncedAt": "ISO date",
 *     "count": 5
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingEntry {
  items: unknown[];
  store: string;
  syncedAt: string;
  count: number;
}

interface PendingFile {
  [userId: string]: PendingEntry;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = '/tmp';
const PENDING_FILE = path.join(DATA_DIR, 'fn-pending.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readPending(): Promise<PendingFile> {
  try {
    const raw = await fs.readFile(PENDING_FILE, 'utf-8');
    return JSON.parse(raw) as PendingFile;
  } catch {
    return {};
  }
}

async function writePending(data: PendingFile): Promise<void> {
  
  await fs.writeFile(PENDING_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getUserIdParam(req: NextRequest): string | null {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId || userId.trim().length === 0) return null;
  return userId.trim();
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET ?userId=xxx
 *
 * Returns any pending parsed items for the user and atomically removes
 * them from the store so they can only be picked up once.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = getUserIdParam(req);

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing or empty userId query parameter.' },
        { status: 400 },
      );
    }

    const pending = await readPending();
    const entry = pending[userId] ?? null;

    if (!entry) {
      return NextResponse.json(
        { items: [], store: null, count: 0, syncedAt: null },
        { status: 200 },
      );
    }

    // Atomic pickup: remove entry then persist before returning.
    delete pending[userId];
    await writePending(pending);

    return NextResponse.json({
      items: entry.items,
      store: entry.store,
      count: entry.count,
      syncedAt: entry.syncedAt,
    });
  } catch (err) {
    console.error('[inbound-email/pending] GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}

/**
 * DELETE ?userId=xxx
 *
 * Explicitly clears pending items for a user. Idempotent — no error if
 * there are no pending items.
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = getUserIdParam(req);

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing or empty userId query parameter.' },
        { status: 400 },
      );
    }

    const pending = await readPending();

    if (pending[userId]) {
      delete pending[userId];
      await writePending(pending);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[inbound-email/pending] DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
