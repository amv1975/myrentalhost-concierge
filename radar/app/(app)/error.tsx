"use client";

/**
 * La última red, para lo que ni siquiera llega a la pantalla.
 *
 * En producción Next no manda el mensaje del error al navegador —solo un
 * identificador— así que aquí no se puede enseñar la causa por mucho que se
 * quiera. Lo que sí se puede es no dejar al usuario delante de la pantalla en
 * blanco del navegador, y darle el identificador, que es lo que permite
 * encontrar el fallo en los registros.
 */
export default function ParteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="parte">
      <header>
        <p className="parte-eyebrow">Parte de la mañana</p>
        <h1 className="parte-date">No se pudo cargar</h1>
      </header>

      <div className="parte-broken">
        <p className="que">Ha fallado antes de poder contarte nada.</p>
        <p className="detalle">
          {error.digest ? `Referencia: ${error.digest}` : error.message}
        </p>
        <p className="que-hacer">
          Tus correos están intactos: esto es solo la pantalla. Pásale la
          referencia a Claude.
        </p>
      </div>

      <div className="parte-actions">
        <button type="button" className="parte-btn primary" onClick={reset}>
          Reintentar
        </button>
      </div>
    </div>
  );
}
