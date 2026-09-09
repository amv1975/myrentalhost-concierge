import type { MetadataRoute } from "next";

/**
 * Lo que convierte la web en algo instalable en el móvil.
 *
 * `display: standalone` es la clave: al abrirla desde el icono se ve sin barra
 * de direcciones ni pestañas, como una app normal. Y `icon-maskable` lleva más
 * margen porque Android recorta el icono a la forma del sistema.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Radar",
    short_name: "Radar",
    description: "Los compromisos que llegan por correo, en un solo sitio.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f7f8",
    theme_color: "#16171a",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
