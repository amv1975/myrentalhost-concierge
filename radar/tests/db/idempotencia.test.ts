import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  asUser,
  freshDatabase,
  ingestEmail,
  signUp,
  spaceId,
  upsertItem,
} from "./helpers";

/**
 * "El cron va a ver el mismo correo muchas veces. Si esto falla, en una semana
 * tengo el calendario lleno de duplicados y dejo de usar la app."
 *
 * Estos tests corren contra el esquema real (0001_init.sql aplicado a un
 * Postgres de verdad), no contra una imitación.
 */

let db: Client;
let family: string;
let work: string;

beforeAll(async () => {
  db = await freshDatabase();
  family = await spaceId(db, "family");
  work = await spaceId(db, "work");
}, 60_000);

afterAll(async () => {
  await db?.end();
});

describe("ingesta repetida", () => {
  it("ingerir el mismo mensaje veinte veces deja una sola fila", async () => {
    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push(
        await ingestEmail(db, { spaceId: family, messageId: "msg-repetido" }),
      );
    }

    const { rows } = await db.query(
      "select count(*)::int as n from emails where gmail_message_id = $1",
      ["msg-repetido"],
    );
    expect(rows[0].n).toBe(1);

    // Solo la primera inserta; las otras diecinueve son no-ops.
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
  });

  it("el mismo mensaje no se puede duplicar en el otro espacio", async () => {
    await ingestEmail(db, { spaceId: family, messageId: "msg-compartido" });
    const segundo = await ingestEmail(db, {
      spaceId: work,
      messageId: "msg-compartido",
    });

    expect(segundo.inserted).toBe(false);
    const { rows } = await db.query(
      "select space_id from emails where gmail_message_id = $1",
      ["msg-compartido"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].space_id).toBe(family);
  });
});

describe("re-extracción del mismo correo", () => {
  it("veinte extracciones seguidas dejan los mismos dos ítems", async () => {
    const email = await ingestEmail(db, {
      spaceId: family,
      messageId: "msg-dos-items",
    });

    for (let i = 0; i < 20; i++) {
      await upsertItem(db, {
        spaceId: family,
        emailId: email.id,
        messageId: "msg-dos-items",
        index: 0,
        title: "Reunión de padres",
      });
      await upsertItem(db, {
        spaceId: family,
        emailId: email.id,
        messageId: "msg-dos-items",
        index: 1,
        title: "Pagar la excursión",
        type: "action",
        dueDate: "2026-03-20",
      });
    }

    const { rows } = await db.query(
      "select count(*)::int as n from items where gmail_message_id = $1",
      ["msg-dos-items"],
    );
    expect(rows[0].n).toBe(2);
  });

  it("el constraint impide dos ítems en la misma posición del mismo correo", async () => {
    const email = await ingestEmail(db, {
      spaceId: family,
      messageId: "msg-colision",
    });

    await upsertItem(db, {
      spaceId: family,
      emailId: email.id,
      messageId: "msg-colision",
      index: 0,
      title: "Primero",
    });

    await expect(
      db.query(
        `insert into items
           (space_id, email_id, gmail_message_id, item_index, type, title,
            normalized_title, starts_at, confidence, dedupe_key)
         values ($1,$2,'msg-colision',0,'event','Otro','otro',
                 '2026-03-12T16:30:00Z',0.9,'event|2026-03-12|otro')`,
        [family, email.id],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("una re-extracción que devuelve los ítems en otro orden no corrompe nada", async () => {
    // El riesgo real de apoyarse solo en item_index: si el modelo devuelve los
    // ítems al revés, la posición 0 pasa a ser otra cosa. El upsert reescribe
    // esas filas, así que el estado final tiene que seguir siendo los dos
    // compromisos correctos, no cuatro ni dos mezclados.
    const email = await ingestEmail(db, {
      spaceId: family,
      messageId: "msg-reordenado",
    });

    await upsertItem(db, {
      spaceId: family,
      emailId: email.id,
      messageId: "msg-reordenado",
      index: 0,
      title: "Reunión de padres",
    });
    await upsertItem(db, {
      spaceId: family,
      emailId: email.id,
      messageId: "msg-reordenado",
      index: 1,
      title: "Pagar la excursión",
      type: "action",
      dueDate: "2026-03-20",
    });

    // Segunda pasada, orden invertido.
    await upsertItem(db, {
      spaceId: family,
      emailId: email.id,
      messageId: "msg-reordenado",
      index: 0,
      title: "Pagar la excursión",
      type: "action",
      startsAt: null,
      dueDate: "2026-03-20",
    });
    await upsertItem(db, {
      spaceId: family,
      emailId: email.id,
      messageId: "msg-reordenado",
      index: 1,
      title: "Reunión de padres",
      type: "event",
    });

    const { rows } = await db.query(
      "select title, type from items where gmail_message_id = $1 order by item_index",
      ["msg-reordenado"],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title).sort()).toEqual([
      "Pagar la excursión",
      "Reunión de padres",
    ]);
    // Y cada fila es coherente consigo misma: ningún ítem quedó mezclado.
    const pago = rows.find((r) => r.title === "Pagar la excursión");
    expect(pago.type).toBe("action");
  });
});

describe("coherencia de los ítems", () => {
  it("no acepta un evento sin hora de inicio", async () => {
    const email = await ingestEmail(db, {
      spaceId: family,
      messageId: "msg-evento-sin-hora",
    });

    await expect(
      upsertItem(db, {
        spaceId: family,
        emailId: email.id,
        messageId: "msg-evento-sin-hora",
        index: 0,
        title: "Evento sin hora",
        startsAt: null,
      }),
    ).rejects.toThrow(/event_needs_start/i);
  });
});

describe("separación de espacios", () => {
  it("Victoria ve Familia y no ve Trabajo", async () => {
    const victoria = await signUp(db, "victoria.williams1@gmail.com");

    const visible = await asUser(db, victoria, async () => {
      const { rows } = await db.query("select key from spaces order by key");
      return rows.map((r) => r.key);
    });

    expect(visible).toEqual(["family"]);
  });

  it("Agustín ve los dos espacios", async () => {
    const agustin = await signUp(db, "agustinvillafanie@gmail.com");

    const visible = await asUser(db, agustin, async () => {
      const { rows } = await db.query("select key from spaces order by key");
      return rows.map((r) => r.key);
    });

    expect(visible).toEqual(["family", "work"]);
  });

  it("Victoria no puede leer ni un correo ni un ítem de Trabajo", async () => {
    const victoria = await signUp(db, "victoria2@example.com");
    await db.query(
      "insert into allowed_members (email, space_key) values ($1, 'family')",
      ["victoria2@example.com"],
    );

    const email = await ingestEmail(db, {
      spaceId: work,
      messageId: "msg-trabajo-privado",
      from: "noreply@guest.booking.com",
    });
    await upsertItem(db, {
      spaceId: work,
      emailId: email.id,
      messageId: "msg-trabajo-privado",
      index: 0,
      title: "Responder al huésped",
      type: "action",
      dueDate: "2026-03-15",
    });

    const leaked = await asUser(db, victoria, async () => {
      const emails = await db.query(
        "select id from emails where space_id = $1",
        [work],
      );
      const items = await db.query("select id from items where space_id = $1", [
        work,
      ]);
      return emails.rows.length + items.rows.length;
    });

    // Cero filas, y lo decide la base de datos: no hay forma de saltárselo
    // desde el navegador.
    expect(leaked).toBe(0);
  });

  it("el navegador no puede escribir en items ni saltándose la UI", async () => {
    const agustin = await signUp(db, "agustin2@example.com");
    await db.query(
      "insert into allowed_members (email, space_key) values ($1, 'family')",
      ["agustin2@example.com"],
    );

    const email = await ingestEmail(db, {
      spaceId: family,
      messageId: "msg-no-escribible",
    });
    await upsertItem(db, {
      spaceId: family,
      emailId: email.id,
      messageId: "msg-no-escribible",
      index: 0,
      title: "Reunión",
    });

    // Sin GRANT de UPDATE la escritura ni siquiera llega a evaluarse: Postgres
    // la rechaza. Es más fuerte que afectar a cero filas, porque no depende de
    // que la política esté bien escrita.
    await expect(
      asUser(db, agustin, () =>
        db.query(
          "update items set status = 'confirmed', google_event_id = 'inventado' where gmail_message_id = $1",
          ["msg-no-escribible"],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);

    // Y el ítem sigue como estaba.
    const { rows } = await db.query(
      "select status, google_event_id from items where gmail_message_id = $1",
      ["msg-no-escribible"],
    );
    expect(rows[0].status).toBe("pending");
    expect(rows[0].google_event_id).toBeNull();
  });

  it("dar de alta a alguien que ya se había registrado le da acceso", async () => {
    const nuevo = await signUp(db, "tercero@example.com");

    const antes = await asUser(db, nuevo, async () => {
      const { rows } = await db.query("select key from spaces");
      return rows.length;
    });
    expect(antes).toBe(0);

    await db.query(
      "insert into allowed_members (email, space_key) values ($1, 'family')",
      ["tercero@example.com"],
    );

    const despues = await asUser(db, nuevo, async () => {
      const { rows } = await db.query("select key from spaces");
      return rows.map((r) => r.key);
    });
    expect(despues).toEqual(["family"]);
  });
});
