import type { Metadata, Viewport } from "next";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Las dos caras del parte: una serif con carácter para la fecha, que es lo
 * primero que se ve al abrir por la mañana, y una mono para las horas y los
 * recuentos, donde los dígitos tienen que alinearse. El cuerpo sigue siendo la
 * tipografía del sistema: se lee bien en cualquier móvil y no cuesta nada.
 */
const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500"],
  variable: "--font-serif",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Radar",
  description: "Los compromisos que llegan por correo, en un solo sitio.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-icon.png",
  },
  // iOS no lee el manifest: para abrirse a pantalla completa desde el icono
  // necesita estas dos, y sin ellas se abre dentro de Safari con su barra.
  appleWebApp: {
    capable: true,
    title: "Radar",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#16171a",
  // Que el fondo llegue bajo la barra de estado y el área del gesto de inicio.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
