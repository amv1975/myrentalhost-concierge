import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
