/**
 * La forma de un asunto, sin lo que cambia en cada correo.
 *
 * "Reservation confirmed - Alma Oetoyo arrives Sep 25" y la misma con otro
 * huésped son el mismo aviso. Sin quitar nombres, fechas y números serían dos
 * ejemplos distintos, la cuenta de veces nunca pasaría de uno, y se perdería
 * justo la señal que importa: que esto se descarta SIEMPRE.
 */
export function subjectShape(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/[^\p{L}\s#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export interface IgnoredExample {
  who: string;
  subject: string;
  count: number;
}

export interface StarredExample {
  who: string;
  subject: string;
  count: number;
}

/**
 * Lo que esta persona ha marcado a mano como importante.
 *
 * Es la otra mitad, y la que más duele cuando falta: descartar enseña qué no
 * traer, pero eso solo hace el parte más corto. Lo que hace que sea fiable es
 * aprender qué NO se puede perder — un correo que no subió y tenía que subir no
 * deja rastro en ningún sitio salvo aquí, cuando la persona lo encuentra en
 * Gmail y lo marca.
 *
 * Y pesa más que lo descartado: equivocarse por exceso cuesta un toque para
 * quitarlo; equivocarse por defecto cuesta perderse una notificación de la
 * Seguridad Social.
 */
export function buildStarredSection(examples: StarredExample[]): string {
  if (examples.length === 0) return "";

  const lines = examples.map((e) => {
    const veces = e.count > 1 ? ` (marcado ${e.count} veces)` : "";
    return `- ${e.who}: «${e.subject}»${veces}`;
  });

  return `

## Lo que esta persona ha marcado como importante

Estos correos los marcó a mano porque le importaban. Sube al parte lo que se les parezca en intención, aunque cambien los nombres, las fechas o los importes:

${lines.join("\n")}

Esta lista pesa más que la de descartados. Si un correo se parece a algo de aquí, sube aunque dudes: colar uno de más le cuesta un toque para quitarlo, y dejar fuera uno de estos le puede costar un plazo, un cobro o un cliente.`;
}

/**
 * Lo que esta persona ha marcado como que no le interesa, para el filtro.
 *
 * Va como ejemplos y no como una lista negra de remitentes a propósito. Si
 * bloqueáramos al remitente, el día que Airbnb mande algo que sí importa —una
 * incidencia, un cobro— tampoco llegaría. Lo que hay que aprender no es de
 * quién no quiere saber nada, sino qué **tipo de aviso** lleva otra persona.
 *
 * Vacío si no ha descartado nada: un encabezado sin ejemplos gasta tokens en
 * cada lote y puede hacer que el modelo se invente qué evitar.
 */
export function buildIgnoredSection(examples: IgnoredExample[]): string {
  if (examples.length === 0) return "";

  const lines = examples.map((e) => {
    const veces = e.count > 1 ? ` (descartado ${e.count} veces)` : "";
    return `- ${e.who}: «${e.subject}»${veces}`;
  });

  return `

## Lo que esta persona ya ha dicho que no le interesa

Estos correos se le enseñaron y los descartó a mano. Clasifica como **none** los que se les parezcan en intención, aunque cambien los nombres, las fechas, los importes o el piso:

${lines.join("\n")}

Fíjate en qué tipo de aviso es, no en las palabras ni en quién lo manda. Si alguien descarta los avisos de entrada de un huésped, tampoco quiere los de salida: lo que está diciendo es que eso lo lleva otra persona.

Y al revés: que un remitente aparezca aquí NO lo convierte en ruido para siempre. El mismo canal de reservas que manda avisos que no le interesan puede mandar mañana una incidencia, un cobro o una queja, y eso sí sube. Lo que se descarta es el tipo de aviso, nunca el remitente.`;
}
