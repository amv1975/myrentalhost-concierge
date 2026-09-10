import Link from "next/link";

/**
 * Lo que se enseña cuando una pantalla no se puede montar.
 *
 * Existe porque el error.tsx de Next, en producción, no recibe el mensaje del
 * fallo —solo un identificador— y con un identificador no se arregla nada
 * desde el móvil. Si la propia página captura su error, sí puede contarlo.
 */
export function PantallaRota({
  titulo,
  error,
}: {
  titulo: string;
  error: string;
}) {
  return (
    <div className="parte">
      <header>
        <p className="parte-eyebrow">Radar</p>
        <h1 className="parte-date">{titulo}</h1>
      </header>

      <div className="parte-broken">
        <p className="que">Esta pantalla no se pudo montar.</p>
        <p className="detalle">{error}</p>
        <p className="que-hacer">
          Tus correos están intactos: esto es solo la pantalla. Pásale este
          mensaje a Claude.
        </p>
      </div>

      <p className="parte-foot">
        <Link href="/">Volver al parte</Link>
      </p>
    </div>
  );
}
