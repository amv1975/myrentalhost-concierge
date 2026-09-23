/**
 * Lo que se ve mientras el parte se arma.
 *
 * Sin esto, tocar «Radar» o la casita desde el Feed no hacía nada visible: el
 * parte se construye en el servidor —consultas a la base de datos, y a veces
 * un arranque en frío—, y Next no puede precargar una página dinámica, así que
 * el móvil se quedaba igual dos o tres segundos. Desde fuera eso no se
 * distingue de un enlace roto: tocas, no pasa nada, vuelves a tocar.
 *
 * No hace falta un esqueleto elaborado. Basta con que algo cambie en el mismo
 * instante en que se toca.
 */
export default function Loading() {
  return (
    <div className="parte">
      <header>
        <p className="parte-eyebrow">Parte de la mañana</p>
        <h1 className="parte-date">Abriendo…</h1>
      </header>
    </div>
  );
}
