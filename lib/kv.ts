/**
 * Minimal Upstash Redis REST client.
 * Uses the same env vars that Vercel KV injects:
 *   KV_REST_API_URL   — e.g. https://xxx.upstash.io
 *   KV_REST_API_TOKEN — bearer token
 *
 * Falls back to a no-op in-memory store when env vars are missing (dev / before KV is linked).
 */

const url   = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

// Simple in-memory fallback for local dev / missing KV
const memStore: Record<string, unknown>        = {};
const memSets:  Record<string, Set<string>>    = {};

async function redisCmd(...args: (string | number)[]): Promise<unknown> {
  if (!url || !token) {
    // Fallback: in-memory (ephemeral, same-instance only — fine for dev)
    const [cmd, key, ...rest] = args.map(String);
    if (cmd === 'SET')      { memStore[key] = rest[0]; return 'OK'; }
    if (cmd === 'GET')      { return memStore[key] ?? null; }
    if (cmd === 'DEL')      { delete memStore[key]; return 1; }
    if (cmd === 'EXPIRE')   { return 1; }
    if (cmd === 'SADD')     { (memSets[key] ??= new Set()); rest.forEach(v=>memSets[key].add(v)); return rest.length; }
    if (cmd === 'SREM')     { rest.forEach(v=>memSets[key]?.delete(v)); return rest.length; }
    if (cmd === 'SMEMBERS') { return Array.from(memSets[key] ?? []); }
    return null;
  }

  const res = await fetch(`${url}/${args.map(encodeURIComponent).join('/')}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const json = await res.json() as { result: unknown; error?: string };
  if (json.error) throw new Error(`KV error: ${json.error}`);
  return json.result;
}

async function redisPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  if (!url || !token) {
    return Promise.all(commands.map(cmd => redisCmd(...cmd)));
  }
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const json = await res.json() as { result: unknown }[];
  return json.map(r => r.result);
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redisCmd('GET', key);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
    }
    return raw as T;
  },

  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (opts?.ex) {
      await redisPipeline([
        ['SET', key, serialized],
        ['EXPIRE', key, opts.ex],
      ]);
    } else {
      await redisCmd('SET', key, serialized);
    }
  },

  async del(key: string): Promise<void> {
    await redisCmd('DEL', key);
  },

  async sadd(key: string, ...members: string[]): Promise<void> {
    if (!members.length) return;
    await redisCmd('SADD', key, ...members);
  },

  async srem(key: string, ...members: string[]): Promise<void> {
    if (!members.length) return;
    await redisCmd('SREM', key, ...members);
  },

  async smembers(key: string): Promise<string[]> {
    const raw = await redisCmd('SMEMBERS', key);
    return Array.isArray(raw) ? (raw as string[]) : [];
  },
};
