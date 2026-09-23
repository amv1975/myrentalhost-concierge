import Link from "next/link";

export const metadata = {
  title: "Privacidad · Radar",
  description: "Qué datos lee Radar, dónde se guardan y qué no hace nunca.",
};

/**
 * La política de privacidad, pública y sin sesión.
 *
 * Google la exige para sacar la app del modo Testing —donde el permiso caduca
 * cada siete días— y tiene que poder abrirse sin haber entrado. Está fuera del
 * grupo (app) a propósito: dentro pasaría por el middleware y acabaría
 * redirigida al login, que para una página que existe para leerse antes de
 * entrar no sirve de nada.
 *
 * El contenido no es una plantilla: dice lo que la app hace de verdad, que es
 * poco y está todo en el código.
 */
export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <div className="parte">
        <header>
          <p className="parte-eyebrow">Radar</p>
          <h1 className="parte-date">Privacidad</h1>
        </header>

        <section className="estado-bloque">
          <h2>Qué es esto</h2>
          <p>
            Radar es una aplicación privada de un solo usuario. Lee su bandeja
            de Gmail, resume lo que le toca y le ayuda a apuntar citas en su
            propio Google Calendar. No hay registro abierto, no hay clientes y
            no se ofrece a nadie más.
          </p>
        </section>

        <section className="estado-bloque">
          <h2>Qué datos usa</h2>
          <ul className="lista">
            <li>
              <b>Gmail, solo lectura.</b> Remitente, asunto, fecha y —de los
              pocos correos que pasan el filtro— el cuerpo, para poder
              resumirlos.
            </li>
            <li>
              <b>Google Calendar.</b> Lee los eventos de hoy y mañana para
              decir qué hay, y crea eventos únicamente cuando el usuario pulsa
              el botón de ponerlos.
            </li>
            <li>
              <b>Tu cuenta.</b> Correo electrónico y el testigo de Google que
              permite refrescar el acceso.
            </li>
          </ul>
        </section>

        <section className="estado-bloque">
          <h2>Qué no hace, nunca</h2>
          <ul className="lista">
            <li>No envía correos, no responde, no reenvía.</li>
            <li>No borra, no archiva y no cambia etiquetas.</li>
            <li>No modifica ni borra eventos que no haya creado ella misma.</li>
            <li>No comparte datos con terceros ni los vende.</li>
            <li>No se usa para entrenar ningún modelo.</li>
          </ul>
          <p className="nota">
            El permiso que pide a Google es <code>gmail.readonly</code>: la
            propia API rechazaría cualquier escritura sobre el correo. Y no
            existe en el código ninguna llamada que lo intente — hay una prueba
            automática que falla si alguien añade una.
          </p>
        </section>

        <section className="estado-bloque">
          <h2>Dónde se guarda</h2>
          <p>
            En una base de datos Postgres propia (Supabase, en la Unión
            Europea) y en el alojamiento de la aplicación (Vercel). El texto de
            los correos que se resumen se manda a la API de Anthropic para
            generar el resumen; Anthropic no lo usa para entrenar modelos.
          </p>
          <p>
            Los correos se conservan mientras sirven para el parte y se van
            quedando atrás con el tiempo. Nada sale de ahí hacia ningún otro
            sitio.
          </p>
        </section>

        <section className="estado-bloque">
          <h2>Retirar el acceso</h2>
          <p>
            En cualquier momento, desde{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
            >
              la página de permisos de la cuenta de Google
            </a>
            . Al retirarlo, Radar deja de poder leer nada.
          </p>
        </section>

        <section className="estado-bloque">
          <h2>Contacto</h2>
          <p>agustinvillafanie@gmail.com</p>
        </section>

        <p className="parte-foot">
          <Link href="/terminos">Términos de servicio</Link>
        </p>
      </div>
    </main>
  );
}
