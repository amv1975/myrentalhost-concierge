import Link from "next/link";
import { ParteList } from "@/components/parte-list";
import { ParteAgenda } from "@/components/parte-agenda";
import { ParteRedo } from "@/components/parte-redo";
import { ParteVaciar } from "@/components/parte-vaciar";
import { ParteNoise } from "@/components/parte-noise";
import type { Parte } from "@/lib/parte";
import type { Agenda } from "@/lib/agenda";
import { SLUG_BY_SPACE, spaceLabel, type SpaceKey } from "@/lib/types";

/** Las tres vidas, en el mismo orden que los filtros de arriba. */
const ESPACIOS: readonly SpaceKey[] = ["work", "personal", "family"];

export function ParteBoard({
  parte,
  agenda,
  espacios,
}: {
  parte: Parte;
  agenda: Agenda;
  espacios: string[];
}) {
  const total = parte.urgent.length + parte.rest.length + parte.fyi.length;

  return (
    <div className="parte">
      <header>
        {/*
          El Feed vivía en el pie, debajo de los descartados, y ahí no lo ve
          nadie: hay que bajar toda la pantalla para encontrarlo. Arriba y con
          el número de boletines nuevos es un motivo para entrar; sin el
          número sería una pestaña más de la que hay que acordarse.
        */}
        <div className="parte-top">
          <p className="parte-eyebrow">Parte de la mañana</p>
          <Link className="parte-feed-badge" href="/feed">
            Feed
            {parte.feedPendientes > 0 ? (
              <span className="n">{parte.feedPendientes}</span>
            ) : null}
          </Link>
        </div>
        <h1 className="parte-date">{longDate()}</h1>
        {/*
          Una línea, y corta. Decía "702 correos mirados / 10 para ti / al día
          a las 08:29" y se partía en dos renglones en el móvil: tres frases
          para tres números que se entienden solos.
        */}
        <div className="parte-tally">
          <span>
            <b>{parte.scanned}</b> mirados
          </span>
          <span className="sep">·</span>
          <span>
            <b>{total}</b> para ti
          </span>
          {parte.reading > 0 ? (
            <>
              <span className="sep">·</span>
              <span className="leyendo">
                <b>{parte.reading}</b> sin leer
              </span>
            </>
          ) : parte.updatedAt ? (
            <>
              <span className="sep">·</span>
              <span>{hhmm(parte.updatedAt)}</span>
            </>
          ) : null}
        </div>
      </header>

      {parte.error ? (
        <div className="parte-broken">
          <p className="que">Algo se ha roto al montar el parte</p>
          <p className="detalle">{parte.error}</p>
          <p className="que-hacer">
            Tus correos están intactos. Pásale este mensaje a Claude y lo
            arregla.
          </p>
        </div>
      ) : null}

      <ParteAgenda agenda={agenda} />

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
        <ParteList
          urgent={parte.urgent}
          rest={parte.rest}
          fyi={parte.fyi}
          updatedAt={parte.updatedAt}
        />
      )}

      {parte.discarded > 0 ? (
        <ParteNoise total={parte.discarded} entries={parte.noise} />
      ) : null}

      <p className="parte-foot">
        <span>
          Se lee tu bandeja entera cada mañana y solo sube lo que te toca.
        </span>
        {parte.reading > 0 ? <ParteVaciar pendientes={parte.reading} /> : null}
        <ParteRedo espacios={espacios} />
        {/*
          Aquí había "Solo Familia · Solo Trabajo", y eran una trampa: sacaban
          del parte a la vista de fichas —otra pantalla, con otra cabecera— sin
          avisar de que se cambiaba de sitio. Filtrar ya se hace arriba, con los
          chips, y sin moverse. Del pie solo cuelga lo que de verdad es otra
          pantalla.
        */}
        {/* Cada vida tiene sus propios ajustes, y sobre todo su propia
            descripción de qué entra en ella, que es lo que lee el filtro. Con
            tres, un enlace único a "Ajustes" escondía dos de las tres. */}
        <span>
          Ajustes:{" "}
          {ESPACIOS.map((key, i) => (
            <span key={key}>
              {i > 0 ? " · " : null}
              <Link href={`/${SLUG_BY_SPACE[key]}/ajustes`}>
                {spaceLabel(key)}
              </Link>
            </span>
          ))}
        </span>
        <span>
          <Link href="/estado">Cómo va la app</Link>
          {" · "}
          <Link href="/gasto">Gasto</Link>
        </span>
      </p>

    </div>
  );
}

/** Sin año: si estás leyendo el parte de la mañana, ya sabes en qué año vives. */
function longDate(): string {
  const texto = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
