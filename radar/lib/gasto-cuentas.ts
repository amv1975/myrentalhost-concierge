/**
 * La aritmética del gasto, sin base de datos delante.
 *
 * Vive separada de `lib/gasto.ts` por una razón mecánica: aquel importa
 * `server-only` y eso lo vuelve intocable desde los tests. Lo que puede mentir
 * aquí es el reparto —numeric que llega como texto, medianoche de Madrid, una
 * pasada vieja sin desglose—, y justo eso es lo que hay que poder probar.
 */
/**
 * Lo que va costando, y en qué.
 *
 * Esto existe por una pregunta concreta: "¿cada vez que actualiza se cobra?".
 * La respuesta corta es que no —el filtro y la lectura solo arrancan si hay
 * correo pendiente, así que pulsar con la cola vacía no llama al modelo ni una
 * vez— pero una respuesta corta dicha por mí no es comprobable. El número sí,
 * y está en la cuenta de pasadas que salieron a cero.
 *
 * El total va primero porque es lo que se paga. El desglose va debajo porque
 * es lo único que deja decidir algo: si un mes sale caro, que sea el filtro
 * —entra mucho correo— o la lectura —entra mucho correo bueno— o el Feed
 * —lo has sincronizado mucho— lleva a tres arreglos distintos.
 */
export interface Gasto {
  hoy: number;
  semana: number;
  mes: number;
  /** El total del mes repartido: filtro, lectura, feed. Ordenado de más a menos. */
  conceptos: { nombre: string; usd: number }[];
  /** De las pasadas del mes, cuántas no costaron nada. */
  gratis: number;
  pasadas: number;
  feedVeces: number;
  /** El día más caro del mes: el techo real de lo que esto cuesta al día. */
  peorDia: { dia: string; usd: number } | null;
  error?: string;
}

export const VACIO: Gasto = {
  hoy: 0,
  semana: 0,
  mes: 0,
  conceptos: [],
  gratis: 0,
  pasadas: 0,
  feedVeces: 0,
  peorDia: null,
};

export interface FilaRun {
  cost_usd: unknown;
  desglose: Record<string, unknown> | null;
  started_at: string;
}

export interface FilaFeed {
  cost_usd: unknown;
  created_at: string;
}

/** Puro, para poder probarlo sin base de datos. */
export function sumar(
  runs: FilaRun[],
  feed: FilaFeed[],
  ahora = Date.now(),
): Gasto {
  const desdeMedianoche = medianocheMadrid(ahora);
  const hace7 = ahora - 7 * 24 * 3600_000;
  const gasto: Gasto = { ...VACIO, conceptos: [] };
  const porDia = new Map<string, number>();
  const porConcepto = new Map<string, number>();

  const anotar = (usd: number, cuando: number) => {
    gasto.mes += usd;
    if (cuando >= hace7) gasto.semana += usd;
    if (cuando >= desdeMedianoche) gasto.hoy += usd;
    const dia = diaMadrid(cuando);
    porDia.set(dia, (porDia.get(dia) ?? 0) + usd);
  };

  const sumarConcepto = (nombre: string, usd: number) => {
    if (usd <= 0) return;
    porConcepto.set(nombre, (porConcepto.get(nombre) ?? 0) + usd);
  };

  for (const run of runs) {
    const usd = aNumero(run.cost_usd);
    gasto.pasadas += 1;
    if (usd === 0) gasto.gratis += 1;
    anotar(usd, Date.parse(run.started_at));

    // Las pasadas anteriores al desglose solo tienen el total. Antes de
    // inventarles un reparto, se dicen tal cual: "sin desglosar" es un dato
    // honesto y desaparece solo en treinta días.
    const partes = run.desglose ?? {};
    let repartido = 0;
    for (const [nombre, valor] of Object.entries(partes)) {
      const parte = aNumero(valor);
      sumarConcepto(nombre, parte);
      repartido += parte;
    }
    sumarConcepto("sin desglosar", usd - repartido);
  }

  for (const digest of feed) {
    const usd = aNumero(digest.cost_usd);
    gasto.feedVeces += 1;
    anotar(usd, Date.parse(digest.created_at));
    sumarConcepto("feed", usd);
  }

  gasto.conceptos = [...porConcepto.entries()]
    .map(([nombre, usd]) => ({ nombre, usd }))
    .sort((a, b) => b.usd - a.usd);

  for (const [dia, usd] of porDia) {
    if (usd > 0 && (gasto.peorDia === null || usd > gasto.peorDia.usd)) {
      gasto.peorDia = { dia, usd };
    }
  }

  return gasto;
}

/**
 * Sumar dólares que llegan como texto.
 *
 * `numeric` de Postgres viaja como string por JSON —si no, 0.000012 dejaría de
 * ser 0.000012 en algún punto del camino—, así que aquí hay que convertirlo a
 * mano. Sumarlos con `+` sin convertir da "00.0000120.000034", que como cifra
 * de gasto es memorable pero poco útil.
 */
function aNumero(valor: unknown): number {
  const n = typeof valor === "string" ? Number(valor) : Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function diaMadrid(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/**
 * Medianoche de hoy en Madrid, en milisegundos.
 *
 * Se prueban los dos husos posibles de España y se queda el que, leído de
 * vuelta en Madrid, sigue siendo hoy. Más corto que una tabla de cambios de
 * hora, y no caduca.
 */
function medianocheMadrid(ahora: number): number {
  const hoy = diaMadrid(ahora);
  for (const offset of ["+02:00", "+01:00"]) {
    const t = Date.parse(`${hoy}T00:00:00${offset}`);
    if (diaMadrid(t) === hoy) return t;
  }
  return Date.parse(`${hoy}T00:00:00Z`);
}
