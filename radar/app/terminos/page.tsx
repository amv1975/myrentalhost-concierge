import Link from "next/link";

export const metadata = {
  title: "Términos · Radar",
  description: "Condiciones de uso de Radar.",
};

/** Como la de privacidad: pública, fuera del middleware, y corta. */
export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <div className="parte">
        <header>
          <p className="parte-eyebrow">Radar</p>
          <h1 className="parte-date">Términos de servicio</h1>
        </header>

        <section className="estado-bloque">
          <h2>Uso</h2>
          <p>
            Radar es una herramienta privada de un solo usuario, sin registro
            abierto. El acceso se concede por invitación y puede retirarse en
            cualquier momento.
          </p>
        </section>

        <section className="estado-bloque">
          <h2>Sin garantías</h2>
          <p>
            Se ofrece tal cual. Resume correos y propone citas, y puede
            equivocarse: un resumen no sustituye al correo original ni a
            comprobar una fecha antes de comprometerse con ella. Quien la usa
            es responsable de lo que decida a partir de lo que lea aquí.
          </p>
        </section>

        <section className="estado-bloque">
          <h2>Disponibilidad</h2>
          <p>
            Puede dejar de funcionar, cambiar o desaparecer sin aviso. No hay
            compromiso de servicio ni de conservación de datos.
          </p>
        </section>

        <section className="estado-bloque">
          <h2>Contacto</h2>
          <p>agustinvillafanie@gmail.com</p>
        </section>

        <p className="parte-foot">
          <Link href="/privacidad">Privacidad</Link>
        </p>
      </div>
    </main>
  );
}
