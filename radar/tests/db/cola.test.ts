import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { freshDatabase, spaceId } from "./helpers";
import {
  CATEGORIAS_PROPIAS,
  ESTADOS_LEIBLES,
  estaTerminado,
  tocaFiltro,
  tocaLeer,
  type EstadoCorreo,
} from "@/lib/triage/estados";

/**
 * Que la regla y las consultas digan lo mismo.
 *
 * tests/estados.test.ts demuestra que ningún estado se queda sin dueño. Aquí
 * se comprueba lo otro, que es donde estuvo el fallo real: que las consultas
 * que de verdad lanza la aplicación seleccionan exactamente esos correos y no
 * otros. Una regla correcta con una consulta que no la sigue deja igual de
 * atascado un correo.
 */

let db: Client;
let familia: string;

const AYER = "2026-09-09T10:00:00Z";

/** Lo que pide el filtro por asunto en lib/triage/gate.ts. */
const SQL_FILTRO = "triaged_at is null";

/** Lo que pide la lectura en lib/triage/run.ts y cuenta lib/pipeline.ts. */
const SQL_LECTURA = `
  triage_status = any($1)
  and triage_category = any($2)
  and triaged_at is not null
  and summary is null
  and dismissed_at is null
`;

beforeAll(async () => {
  db = await freshDatabase();
  familia = await spaceId(db, "family");
});

afterAll(async () => {
  await db.end();
});

async function guardar(estado: Partial<EstadoCorreo>, id: string) {
  await db.query(
    `insert into emails (space_id, gmail_message_id, gmail_thread_id,
       from_email, received_at, triaged_at, triage_status, triage_category,
       summary, dismissed_at)
     values ($1, $2, $2, 'quien@ejemplo.com', now(), $3, $4, $5, $6, $7)`,
    [
      familia,
      id,
      estado.triaged_at ?? null,
      estado.triage_status ?? "pending",
      estado.triage_category ?? null,
      estado.summary ?? null,
      estado.dismissed_at ?? null,
    ],
  );
}

async function seleccionados(where: string, params: unknown[] = []) {
  const { rows } = await db.query(
    `select gmail_message_id from emails where ${where}`,
    params,
  );
  return new Set(rows.map((row) => row.gmail_message_id as string));
}

describe("la cola que ve la base de datos", () => {
  it("cada consulta recoge exactamente lo que dice la regla", async () => {
    const casos: { id: string; estado: Partial<EstadoCorreo> }[] = [];
    let n = 0;

    // Todas las combinaciones que pueden darse de verdad en la tabla.
    for (const triaged_at of [null, AYER]) {
      for (const triage_status of ["pending", "done", "failed"]) {
        for (const triage_category of [null, "family", "work", "none"]) {
          for (const summary of [null, "un resumen"]) {
            for (const dismissed_at of [null, AYER]) {
              const estado = {
                triaged_at,
                triage_status,
                triage_category,
                summary,
                dismissed_at,
              };
              const id = `m${n++}`;
              casos.push({ id, estado });
              await guardar(estado, id);
            }
          }
        }
      }
    }

    const completo = (estado: Partial<EstadoCorreo>): EstadoCorreo => ({
      triaged_at: estado.triaged_at ?? null,
      triage_status: estado.triage_status ?? "pending",
      triage_category: estado.triage_category ?? null,
      summary: estado.summary ?? null,
      dismissed_at: estado.dismissed_at ?? null,
    });

    const enFiltro = await seleccionados(SQL_FILTRO);
    const enLectura = await seleccionados(SQL_LECTURA, [
      [...ESTADOS_LEIBLES],
      [...CATEGORIAS_PROPIAS],
    ]);

    for (const { id, estado } of casos) {
      expect({ id, filtro: enFiltro.has(id) }).toEqual({
        id,
        filtro: tocaFiltro(completo(estado)),
      });
      expect({ id, lectura: enLectura.has(id) }).toEqual({
        id,
        lectura: tocaLeer(completo(estado)),
      });
    }
  });

  it("ningún correo se queda fuera de las dos consultas sin estar terminado", async () => {
    // La garantía que faltaba el día que un correo se quedó en "leyéndolo"
    // para siempre: si no lo recoge ninguna consulta, tiene que ser porque no
    // hay nada que hacerle.
    const { rows } = await db.query(
      `select gmail_message_id, triaged_at, triage_status, triage_category,
              summary, dismissed_at
         from emails
        where not (${SQL_FILTRO})
          and not (${SQL_LECTURA})`,
      [[...ESTADOS_LEIBLES], [...CATEGORIAS_PROPIAS]],
    );

    for (const row of rows) {
      expect(
        estaTerminado({
          triaged_at: row.triaged_at,
          triage_status: row.triage_status,
          triage_category: row.triage_category,
          summary: row.summary,
          dismissed_at: row.dismissed_at,
        }),
      ).toBe(true);
    }

    expect(rows.length).toBeGreaterThan(0);
  });
});
