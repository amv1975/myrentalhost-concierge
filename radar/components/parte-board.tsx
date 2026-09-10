import Link from "next/link";
import { ParteRow } from "@/components/parte-row";
import { RefreshButton } from "@/components/refresh-button";
import type { Parte, ParteEntry } from "@/lib/parte";

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
        <>
          <Section
            title="Hay que mirarlo hoy"
            entries={parte.urgent}
            urgent
          />
          <Section title="Lo demás que es tuyo" entries={parte.rest} />
        </>
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

function Section({
  title,
  entries,
  urgent = false,
}: {
  title: string;
  entries: ParteEntry[];
  urgent?: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <section className={urgent ? "parte-urgent" : undefined}>
      <h2>
        {title}
        <span className="count">{entries.length}</span>
      </h2>
      <div>
        {entries.map((entry) => (
          <ParteRow key={`${entry.kind}-${entry.id}`} entry={entry} />
        ))}
      </div>
    </section>
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
