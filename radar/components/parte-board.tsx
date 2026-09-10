import Link from "next/link";
import { ParteList } from "@/components/parte-list";
import { RefreshButton } from "@/components/refresh-button";
import type { Parte } from "@/lib/parte";

export function ParteBoard({ parte }: { parte: Parte }) {
  const total = parte.urgent.length + parte.rest.length;

  return (
    <div className="parte">
      <header>
        <p className="parte-eyebrow">Parte de la mañana</p>
        <h1 className="parte-date">
          {longDate()} <em>{new Date().getFullYear()}</em>
        </h1>
        <div className="parte-tally">
          <span>
            <b>{parte.scanned}</b> correos mirados
          </span>
          <span className="sep">/</span>
          <span>
            <b>{total}</b> para ti
          </span>
          {parte.updatedAt ? (
            <>
              <span className="sep">/</span>
              <span>
                al día a las <b>{hhmm(parte.updatedAt)}</b>
              </span>
            </>
          ) : null}
        </div>
      </header>

      <div className="parte-refresh">
        <RefreshButton />
      </div>

      {total === 0 ? (
        <p className="parte-empty">
          {parte.scanned === 0
            ? "Todavía no hay parte."
            : "Todo despejado."}
          <span>
            {parte.scanned === 0
              ? "Pulsa Actualizar y te leo la bandeja."
              : `${parte.scanned} correos revisados y ninguno pide nada de ti.`}
          </span>
        </p>
      ) : (
        <ParteList urgent={parte.urgent} rest={parte.rest} />
      )}

      {parte.discarded > 0 ? (
        <details className="parte-noise">
          <summary>{parte.discarded} correos descartados por ruido</summary>
          {parte.noise.length > 0 ? (
            <ul>
              {parte.noise.map((entry, index) => (
                <li key={`${entry.who}-${index}`}>
                  <span className="nfrom">{entry.who}</span>
                  <span className="nsubj">{entry.subject}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="note">
            Está aquí para que puedas comprobar que no se tiró nada que
            importara. Si ves algo mal descartado, dilo en Ajustes.
          </p>
        </details>
      ) : null}

      <p className="parte-foot">
        <span>
          Se lee tu bandeja entera cada mañana y solo sube lo que te toca.
        </span>
        <span>
          <Link href="/familia">Solo Familia</Link>
          {" · "}
          <Link href="/trabajo">Solo Trabajo</Link>
          {" · "}
          <Link href="/familia/ajustes">Ajustes</Link>
        </span>
      </p>
    </div>
  );
}

function longDate(): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
