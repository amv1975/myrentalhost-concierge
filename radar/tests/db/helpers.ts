import { Client } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://radar:radar@127.0.0.1:5432/radar_test";

/**
 * Base de datos limpia con el esquema real aplicado.
 *
 * Se aplica 0001_init.sql tal cual se despliega: si la migración se rompe, los
 * tests se rompen. Un esquema paralelo escrito para los tests no probaría nada.
 */
export async function freshDatabase(): Promise<Client> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  await client.query("drop schema if exists public cascade");
  await client.query("drop schema if exists auth cascade");
  await client.query("create schema public");

  await client.query(readFileSync(path.join(__dirname, "shim.sql"), "utf8"));
  await client.query(
    readFileSync(path.join(ROOT, "supabase/migrations/0001_init.sql"), "utf8"),
  );
  await client.query(readFileSync(path.join(ROOT, "supabase/seed.sql"), "utf8"));

  return client;
}

export async function spaceId(client: Client, key: string): Promise<string> {
  const { rows } = await client.query(
    "select id from spaces where key = $1",
    [key],
  );
  return rows[0].id;
}

/** Simula el alta de una cuenta: dispara el trigger de pertenencia. */
export async function signUp(client: Client, email: string): Promise<string> {
  const { rows } = await client.query(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return rows[0].id;
}

/** Ejecuta como ese usuario, con RLS activo: lo que vería el navegador. */
export async function asUser<T>(
  client: Client,
  userId: string,
  run: () => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('test.user_id', $1, true)", [userId]);
    const result = await run();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export interface EmailSeed {
  spaceId: string;
  messageId: string;
  threadId?: string;
  from?: string;
  subject?: string;
  receivedAt?: string;
}

/** Inserta un correo igual que hace la ingesta, con su ON CONFLICT. */
export async function ingestEmail(
  client: Client,
  seed: EmailSeed,
): Promise<{ id: string; inserted: boolean }> {
  const { rows } = await client.query(
    `insert into emails
       (space_id, gmail_message_id, gmail_thread_id, from_email, subject, body_text, received_at)
     values ($1, $2, $3, $4, $5, 'cuerpo', $6)
     on conflict (gmail_message_id) do nothing
     returning id`,
    [
      seed.spaceId,
      seed.messageId,
      seed.threadId ?? `thread-${seed.messageId}`,
      seed.from ?? "avisos@lestonnacbcn.org",
      seed.subject ?? "Asunto",
      seed.receivedAt ?? "2026-03-01T09:00:00Z",
    ],
  );

  if (rows.length > 0) return { id: rows[0].id, inserted: true };

  const existing = await client.query(
    "select id from emails where gmail_message_id = $1",
    [seed.messageId],
  );
  return { id: existing.rows[0].id, inserted: false };
}

export interface ItemSeed {
  spaceId: string;
  emailId: string;
  messageId: string;
  index: number;
  title: string;
  type?: "event" | "action";
  startsAt?: string | null;
  dueDate?: string | null;
  dedupeKey?: string;
  status?: string;
}

/** Upsert de un ítem con la misma clave de conflicto que usa la extracción. */
export async function upsertItem(client: Client, seed: ItemSeed): Promise<void> {
  const type = seed.type ?? "event";
  await client.query(
    `insert into items
       (space_id, email_id, gmail_message_id, item_index, type, title,
        normalized_title, starts_at, due_date, confidence, dedupe_key, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,0.9,$10,$11)
     on conflict (gmail_message_id, item_index) do update set
       type = excluded.type,
       title = excluded.title,
       normalized_title = excluded.normalized_title,
       starts_at = excluded.starts_at,
       due_date = excluded.due_date,
       dedupe_key = excluded.dedupe_key`,
    [
      seed.spaceId,
      seed.emailId,
      seed.messageId,
      seed.index,
      type,
      seed.title,
      seed.title.toLowerCase(),
      // `??` no vale: un null explícito significa "sin hora", y es justo lo que
      // algún test necesita pasar para comprobar el constraint.
      seed.startsAt === undefined
        ? type === "event"
          ? "2026-03-12T16:30:00Z"
          : null
        : seed.startsAt,
      seed.dueDate ?? null,
      seed.dedupeKey ?? `${type}|2026-03-12|${seed.title.toLowerCase()}`,
      seed.status ?? "pending",
    ],
  );
}
