/**
 * Cast pairing when a direct peer link is slow or blocked.
 * Each screen still draws and records locally. This only forwards the scene.
 */
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";

const ROOM = z.string().regex(/^cast[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
const PEER = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);
const KIND = z.enum(["hello", "snap", "record", "touch", "bye"]);

const postSchema = z.object({
  room: ROOM,
  from: PEER,
  kind: KIND,
  payload: z.unknown().refine((value) => {
    try {
      return JSON.stringify(value).length <= 120_000;
    } catch {
      return false;
    }
  }, { message: "payload too large" }),
});

const globalRef = globalThis as typeof globalThis & {
  __castSchemaPromise__?: Promise<void>;
};

function ensureSchema(sql: Sql): Promise<void> {
  globalRef.__castSchemaPromise__ ??= (async () => {
    await sql.query(
      `CREATE TABLE IF NOT EXISTS cast_events (
         id BIGSERIAL PRIMARY KEY,
         room TEXT NOT NULL,
         from_peer TEXT NOT NULL,
         kind TEXT NOT NULL,
         payload JSONB NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await sql.query(
      `CREATE INDEX IF NOT EXISTS cast_events_room ON cast_events (room, id)`,
    );
  })().catch((err) => {
    globalRef.__castSchemaPromise__ = undefined;
    throw err;
  });
  return globalRef.__castSchemaPromise__;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function prune(sql: Sql, room: string) {
  await sql.query(
    `DELETE FROM cast_events
     WHERE room = $1
       AND id NOT IN (
         SELECT id FROM cast_events WHERE room = $1 ORDER BY id DESC LIMIT 50
       )`,
    [room],
  );
}

async function handleGet(url: URL): Promise<Response> {
  const parsed = z
    .object({
      room: ROOM,
      peer: PEER,
      since: z.coerce.number().int().min(0).default(0),
    })
    .safeParse({
      room: url.searchParams.get("room"),
      peer: url.searchParams.get("peer"),
      since: url.searchParams.get("since") ?? 0,
    });
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  const { room, peer, since } = parsed.data;
  const sql = await getSql();
  await ensureSchema(sql);
  const rows = await sql.query<{ id: number | string; from_peer: string; kind: string; payload: unknown }>(
    `SELECT id, from_peer, kind, payload
     FROM cast_events
     WHERE room = $1 AND id > $2 AND from_peer <> $3
     ORDER BY id
     LIMIT 40`,
    [room, since, peer],
  );
  return json({
    events: rows.map((row) => ({
      id: Number(row.id),
      from: row.from_peer,
      kind: row.kind,
      payload: typeof row.payload === "string" ? (JSON.parse(row.payload) as unknown) : row.payload,
    })),
  });
}

async function handlePost(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid request" }, 400);
  const msg = parsed.data;
  const sql = await getSql();
  await ensureSchema(sql);
  await sql.query(
    `INSERT INTO cast_events (room, from_peer, kind, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [msg.room, msg.from, msg.kind, JSON.stringify(msg.payload)],
  );
  if (Math.random() < 0.2) await prune(sql, msg.room);
  return json({ ok: true });
}

export async function handleCastRelay(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") return await handleGet(new URL(request.url));
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[cast] relay error:", error);
    return json({ error: "relay failed" }, 500);
  }
}
