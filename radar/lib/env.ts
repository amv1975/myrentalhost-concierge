/**
 * Se recorta el valor a propósito.
 *
 * Copiar una clave del panel de Google o de Supabase y pegarla en Vercel se
 * lleva a menudo un salto de línea o un espacio detrás. El valor "parece"
 * correcto en pantalla, pero Google responde "The OAuth client was not found",
 * que es de los errores más difíciles de diagnosticar porque acusa a la clave
 * y no al espacio. Un trim cuesta nada y ahorra una tarde.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env.local y revisa SETUP.md.`,
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
};
