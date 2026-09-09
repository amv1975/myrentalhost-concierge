import { LoginButton } from "./login-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold tracking-tight">Radar</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Los compromisos que llegan por correo, en un solo sitio.
        </p>

        {error ? (
          <p className="mt-6 rounded-lg border border-[var(--color-danger)] bg-red-50 px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <div className="mt-8">
          <LoginButton next={next} />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-[var(--color-muted)]">
          Radar pide permiso de <strong>solo lectura</strong> sobre Gmail y
          permiso para crear eventos en Calendar. No envía correos, no responde
          a nadie y no borra nada.
        </p>
      </div>
    </main>
  );
}
