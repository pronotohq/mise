/**
 * /api/inbound-email/status
 *
 * GET ?userId=xxx — Returns the sync log for a user (last 5 syncs).
 *
 * Data stored in data/sync-log.json:
 * {
 *   "userId": [
 *     {
 *       "store": "Blinkit",
 *       "count": 8,
 *       "syncedAt": "ISO",
 *       "items": ["Milk", "Eggs", ...first 5 names]
 *     }
 *   ]
 * }
 *
 * Response: { "syncs": [...last 5], "lastSyncedAt": "ISO or null" }
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncLogEntry {
  store: string;
  count: number;
  syncedAt: string;
  items: string[]; // First 5 item names only
}

interface SyncLogFile {
  [userId: string]: SyncLogEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), 'data');
const SYNC_LOG_FILE = path.join(DATA_DIR, 'sync-log.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function readSyncLog(): Promise<SyncLogFile> {
  try {
    const raw = await fs.readFile(SYNC_LOG_FILE, 'utf-8');
    return JSON.parse(raw) as SyncLogFile;
  } catch {
    return {};
  }
}

export async function writeSyncLog(data: SyncLogFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SYNC_LOG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Append a new entry to the sync log for a user, keeping at most `maxEntries`.
 */
export async function appendSyncLog(
  userId: string,
  entry: SyncLogEntry,
  maxEntries = 10,
): Promise<void> {
  const log = await readSyncLog();
  const userLog = log[userId] ?? [];
  userLog.push(entry);
  // Keep only the most recent N entries.
  log[userId] = userLog.slice(-maxEntries);
  await writeSyncLog(log);
}

function getUserIdParam(req: NextRequest): string | null {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId || userId.trim().length === 0) return null;
  return userId.trim();
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * GET ?userId=xxx
 *
 * Returns the last 5 sync entries for the user, plus the most recent
 * syncedAt timestamp (or null if no syncs exist yet).
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

    const log = await readSyncLog();
    const allEntries = log[userId] ?? [];

    // Return only the last 5 for the response (full log stores up to 10).
    const last5 = allEntries.slice(-5);
    const lastSyncedAt =
      last5.length > 0 ? last5[last5.length - 1].syncedAt : null;

    return NextResponse.json({
      syncs: last5,
      lastSyncedAt,
    });
  } catch (err) {
    console.error('[inbound-email/status] GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
