import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { freshDatabase, spaceId } from "./helpers";
import {
  CATEGORIAS_PROPIAS,
  CRITERIO_ACTUAL,
  ESTADOS_LEIBLES,
  MARCA_USUARIO,
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

/**
 * Lo que pide el filtro por asunto en lib/triage/gate.ts.
 *
 * Ya no es una consulta sino tres, y ninguna es la regla: son un prefiltro que
 * trae de más, y quien decide es tocaFiltro sobre lo que vuelve. Por eso lo
 * que se comprueba aquí no es la igualdad —eso sería exigirle al SQL una
 * precisión que no necesita— sino que el prefiltro nunca deje fuera a nadie
 * que la regla sí reclamaría. Un correo que el SQL no trae no lo mira nadie
 * jamás, y ese es exactamente el fallo que costó una tarde.
 */
const SQL_PREFILTRO: { where: string; params: unknown[] }[] = [
  { where: "triaged_at is null", params: [] },
  {
    where:
      "triage_category = 'none' and dismissed_at is null and triage_model <> $1",
    params: [CRITERIO_ACTUAL],
  },
  {
    where:
      "triage_category = 'none' and dismissed_at is null and triage_model is null",
    params: [],
  },
];

/** Lo que las tres consultas del filtro traen juntas. */
async function traidosPorElPrefiltro(): Promise<Set<string>> {
  const todos = new Set<string>();
  for (const { where, params } of SQL_PREFILTRO) {
    for (const id of await seleccionados(where, params)) todos.add(id);
  }
  return todos;
}

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
       summary, dismissed_at, triage_model)
     values ($1, $2, $2, 'quien@ejemplo.com', now(), $3, $4, $5, $6, $7, $8)`,
    [
      familia,
      id,
      estado.triaged_at ?? null,
      estado.triage_status ?? "pending",
      estado.triage_category ?? null,
      estado.summary ?? null,
      estado.dismissed_at ?? null,
      estado.triage_model === undefined ? CRITERIO_ACTUAL : estado.triage_model,
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
  const completo = (estado: Partial<EstadoCorreo>): EstadoCorreo => ({
    triaged_at: estado.triaged_at ?? null,
    triage_status: estado.triage_status ?? "pending",
    triage_category: estado.triage_category ?? null,
    summary: estado.summary ?? null,
    dismissed_at: estado.dismissed_at ?? null,
    triage_model:
      estado.triage_model === undefined ? CRITERIO_ACTUAL : estado.triage_model,
  });

  const casos: { id: string; estado: Partial<EstadoCorreo> }[] = [];

  beforeAll(async () => {
    let n = 0;
    // Todas las combinaciones que pueden darse de verdad en la tabla.
    for (const triaged_at of [null, AYER]) {
      for (const triage_status of ["pending", "done", "failed"]) {
        for (const triage_category of [null, "family", "work", "none"]) {
          for (const summary of [null, "un resumen"]) {
            for (const dismissed_at of [null, AYER]) {
              for (const triage_model of [
                null,
                "haiku-4.5/v2",
                CRITERIO_ACTUAL,
                MARCA_USUARIO,
              ]) {
                const estado = {
                  triaged_at,
                  triage_status,
                  triage_category,
                  summary,
                  dismissed_at,
                  triage_model,
                };
                const id = `m${n++}`;
                casos.push({ id, estado });
                await guardar(estado, id);
              }
            }
          }
        }
      }
    }
  });

  it("el prefiltro no deja fuera a nadie que la regla reclame", async () => {
    const traidos = await traidosPorElPrefiltro();

    for (const { id, estado } of casos) {
      if (!tocaFiltro(completo(estado))) continue;
      expect({ id, traido: traidos.has(id) }).toEqual({ id, traido: true });
    }
  });

  it("y lo que trae de más lo descarta la regla, no la consulta", async () => {
    // Traer de más es barato —una comprobación en memoria— y traer de menos
    // deja un correo sin dueño para siempre. Aquí se ve que el exceso existe
    // y que está contenido.
    const traidos = await traidosPorElPrefiltro();
    const porId = new Map(casos.map((c) => [c.id, c.estado]));
    const sobrantes = [...traidos].filter(
      (id) => !tocaFiltro(completo(porId.get(id)!)),
    );
    // Los que trae de más son justo los que llevan tu sello o tu descarte.
    for (const id of sobrantes) {
      const estado = completo(porId.get(id)!);
      expect(
        estado.dismissed_at !== null || estado.triage_model === MARCA_USUARIO,
      ).toBe(true);
    }
  });

  it("la consulta de lectura recoge exactamente lo que dice la regla", async () => {
    const enLectura = await seleccionados(SQL_LECTURA, [
      [...ESTADOS_LEIBLES],
      [...CATEGORIAS_PROPIAS],
    ]);

    for (const { id, estado } of casos) {
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
    const traidos = await traidosPorElPrefiltro();
    const enLectura = await seleccionados(SQL_LECTURA, [
      [...ESTADOS_LEIBLES],
      [...CATEGORIAS_PROPIAS],
    ]);

    let huerfanos = 0;
    for (const { id, estado } of casos) {
      if (traidos.has(id) || enLectura.has(id)) continue;
      huerfanos += 1;
      expect({ id, terminado: estaTerminado(completo(estado)) }).toEqual({
        id,
        terminado: true,
      });
    }

    expect(huerfanos).toBeGreaterThan(0);
  });

  it("tus descartes no los devuelve ninguna consulta", async () => {
    // La promesa, comprobada contra el SQL real y no solo contra la regla.
    const traidos = await traidosPorElPrefiltro();
    const porId = new Map(casos.map((c) => [c.id, c.estado]));

    let comprobados = 0;
    for (const id of traidos) {
      const estado = completo(porId.get(id)!);
      const tuyo =
        estado.dismissed_at !== null ||
        (estado.triaged_at !== null && estado.triage_model === MARCA_USUARIO);
      if (!tuyo) continue;
      // Puede traerlos el prefiltro, pero la regla los para en seco.
      expect(tocaFiltro(estado)).toBe(false);
      comprobados += 1;
    }
    expect(comprobados).toBeGreaterThan(0);
  });
});
