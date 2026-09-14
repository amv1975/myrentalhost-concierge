import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpaceByKey } from "@/lib/spaces";
import { checkSchema } from "@/lib/schema-check";
import { getMonthSpend } from "@/lib/spend";
import { slugToSpaceKey, spaceLabel } from "@/lib/types";
import { SpaceDescription } from "@/components/space-description";
import { formatUsd } from "@/lib/usage";

/**
 * Los ajustes de una vida.
 *
 * Aquí había siete secciones: remitentes de confianza, confirmación
 * automática, lo que había aprendido a ignorar, reanalizar, calendario
 * destino... Ninguna se usaba nunca, dos mentían sobre lo que hacían y todas
 * había que mantenerlas con cada cambio de tipografía o de tema.
 *
 * Quedan tres cosas, y cada una responde a una pregunta real: qué cuenta como
 * esta vida —que es lo que lee el filtro y el único mando que de verdad
 * cambia algo—, cuánto llevo gastado, y si la base de datos tiene lo que el
 * código espera.
 */
export default async function AjustesPage({
  params,
}: {
  params: Promise<{ espacio: string }>;
}) {
  const { espacio } = await params;
  const key = slugToSpaceKey(espacio);
  if (!key) notFound();

  const space = await getSpaceByKey(key);
  if (!space) notFound();

  const [schema, spend] = await Promise.all([checkSchema(), getMonthSpend()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">
          Ajustes de {spaceLabel(space.key)}
        </h1>
        <Link
          href="/"
          className="text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          ← Volver al parte
        </Link>
      </div>

      <section>
        <h2 className="text-sm font-semibold">
          Qué cuenta como {spaceLabel(space.key)}
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Esto es literalmente lo que lee el filtro para decidir si un correo es
          tuyo, así que es el mando que más manda. Si algo se descarta y no
          debería, la causa casi siempre está aquí: describe la vida entera, no
          solo lo más obvio. Escribe quién escribe, de qué temas, y también qué
          NO entra.
        </p>
        <SpaceDescription espacio={espacio} valor={space.description} />
      </section>

      <section>
        <h2 className="text-sm font-semibold">Gasto de este mes</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Leer la bandeja entera cuesta dinero. Se enseña siempre, aunque sean
          céntimos, para que el día que suba se vea aquí y no en la factura.
        </p>
        <p className="mt-3 text-sm font-medium">
          {formatUsd(spend.usd)}
          <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
            {spend.screened} correos mirados en {spend.runs}{" "}
            {spend.runs === 1 ? "actualización" : "actualizaciones"}
          </span>
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Base de datos</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Si el código espera una columna que no existe, la app falla a mitad de
          una actualización y el motivo no se ve hasta que revientas algo.
        </p>
        <p
          className={`mt-3 text-sm font-medium ${
            schema.ok ? "text-[var(--color-ok)]" : "text-[var(--color-danger)]"
          }`}
        >
          {schema.ok
            ? "Al día. No falta nada."
            : (schema.error ?? `Faltan: ${schema.missing.join(", ")}`)}
        </p>
      </section>
    </div>
  );
}
