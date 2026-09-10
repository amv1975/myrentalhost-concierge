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

  const terms = enabled.map((s) => {
    const value = s.value.trim().toLowerCase();
    // Gmail entiende to: igual que from:, y con eso basta para capturar lo que
    // llega a un buzón venga de quien venga.
    const field = s.kind.startsWith("to_") ? "to" : "from";
    return `${field}:${value}`;
  });
  const unique = [...new Set(terms)];

  return `(${unique.join(" OR ")}) newer_than:${lookbackDays}d`;
}

/**
 * Comprobación del lado de Radar de que un mensaje encaja de verdad con una
 * fuente del espacio. Gmail ya filtra con la query, pero `from:` y `to:` hacen
 * match amplio (subdominios, alias) y esto evita que un correo cualquiera acabe
 * clasificado en un espacio al que no pertenece.
 *
 * Los destinatarios incluyen las copias: un correo en el que estás en CC es
 * tan tuyo como uno dirigido solo a ti.
 */
export function matchesSource(
  fromEmail: string,
  sources: Source[],
  recipients: string[] = [],
): boolean {
  const from = fromEmail.trim().toLowerCase();
  const to = recipients.map((r) => r.trim().toLowerCase()).filter(Boolean);

  const matchesAddress = (address: string, source: Source) => {
    const value = source.value.trim().toLowerCase();
    const domain = address.split("@")[1] ?? "";
    if (source.kind === "email" || source.kind === "to_email") {
      return address === value;
    }
    return domain === value || domain.endsWith(`.${value}`);
  };

  return sources.some((source) => {
    if (!source.enabled) return false;
    if (source.kind.startsWith("to_")) {
      return to.some((address) => matchesAddress(address, source));
    }
    return matchesAddress(from, source);
  });
}
