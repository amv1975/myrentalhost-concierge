import type { Source } from "@/lib/types";

/**
 * Qué correos se descargan del buzón.
 *
 * Radar ya no filtra por una lista de remitentes: un buzón real recibe lo que
 * importa desde direcciones que nunca estarían en esa lista — la gestoría, un
 * proveedor nuevo, el banco. Se descarga todo y se clasifica después.
 *
 * Lo único que se descarta de entrada es lo que Gmail ya ha apartado por su
 * cuenta: promociones, redes sociales y foros. Ahí no hay compromisos y es la
 * mayor parte del volumen, así que quitarlo no pierde nada y evita pagar por
 * leerlo. Los correos que el propio usuario ha enviado tampoco cuentan.
 */
export function buildInboxQuery(lookbackDays: number): string {
  return [
    `newer_than:${lookbackDays}d`,
    "-category:promotions",
    "-category:social",
    "-category:forums",
    "-in:spam",
    "-in:trash",
    "-in:sent",
    "-in:draft",
  ].join(" ");
}

/**
 * Remitentes de confianza: los que se saltan la clasificación.
 *
 * Sigue habiendo lista, pero cambia de papel. Antes decidía qué entraba; ahora
 * solo dice "de este ya sabemos de qué espacio es", lo que ahorra una llamada
 * por correo y evita que un colegio o un canal de reservas acabe clasificado
 * como ruido por un correo mal redactado.
 */
export function knownSpaceFor(
  fromEmail: string,
  recipients: string[],
  sources: (Source & { space_key?: string })[],
): string | null {
  const from = fromEmail.trim().toLowerCase();
  const to = recipients.map((r) => r.trim().toLowerCase()).filter(Boolean);

  const matches = (address: string, source: Source) => {
    const value = source.value.trim().toLowerCase();
    const domain = address.split("@")[1] ?? "";
    if (source.kind === "email" || source.kind === "to_email") {
      return address === value;
    }
    return domain === value || domain.endsWith(`.${value}`);
  };

  for (const source of sources) {
    if (!source.enabled) continue;
    const hit = source.kind.startsWith("to_")
      ? to.some((address) => matches(address, source))
      : matches(from, source);
    if (hit) return source.space_key ?? null;
  }

  return null;
}
