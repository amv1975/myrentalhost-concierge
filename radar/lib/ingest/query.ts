import type { Source } from "@/lib/types";

/**
 * Query de Gmail para un espacio, a partir de sus fuentes habilitadas.
 *
 * Sin fuentes devuelve null en vez de una query vacía: una query vacía se
 * llevaría la bandeja entera, que es exactamente lo que no queremos.
 */
export function buildGmailQuery(
  sources: Source[],
  lookbackDays: number,
): string | null {
  const enabled = sources.filter((s) => s.enabled && s.value.trim() !== "");
  if (enabled.length === 0) return null;

  const senders = enabled.map((s) => `from:${s.value.trim().toLowerCase()}`);
  const unique = [...new Set(senders)];

  return `(${unique.join(" OR ")}) newer_than:${lookbackDays}d`;
}

/**
 * Comprobación del lado de Radar de que un mensaje viene de verdad de una
 * fuente del espacio. Gmail ya filtra con la query, pero `from:` hace match
 * amplio (subdominios, alias) y esto evita que un correo cualquiera acabe
 * clasificado en un espacio al que no pertenece.
 */
export function matchesSource(fromEmail: string, sources: Source[]): boolean {
  const from = fromEmail.trim().toLowerCase();
  const domain = from.split("@")[1] ?? "";

  return sources.some((source) => {
    if (!source.enabled) return false;
    const value = source.value.trim().toLowerCase();
    if (source.kind === "email") return from === value;
    return domain === value || domain.endsWith(`.${value}`);
  });
}
