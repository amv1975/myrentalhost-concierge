import { notFound } from "next/navigation";
import { ParteBoard } from "@/components/parte-board";
import { SAMPLE_AGENDA, SAMPLE_PARTE } from "@/lib/preview/parte-sample";

/**
 * El parte con datos de ejemplo, para poder mirarlo sin buzón ni base de datos.
 *
 * Existe por el modo noche y se ha quedado por la tipografía: hay decisiones
 * —un color, un tamaño, si algo cabe en una línea— que solo se juzgan
 * mirándolas, y el único sitio donde mirarlas era el móvil de Agustín después
 * de desplegar.
 *
 * Solo con RADAR_PREVIEW=1. No lee ni escribe nada.
 */
export default async function PreviewPage() {
  if (process.env.RADAR_PREVIEW !== "1") notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <ParteBoard
        parte={SAMPLE_PARTE}
        agenda={SAMPLE_AGENDA}
        espacios={["work", "personal", "family"]}
      />
    </main>
  );
}
