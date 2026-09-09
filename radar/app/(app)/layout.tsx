import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVisibleSpaces } from "@/lib/spaces";
import { SpaceTabs } from "@/components/space-tabs";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const spaces = await getVisibleSpaces();

  if (spaces.length === 0) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-xl font-semibold">Sin acceso</h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          La cuenta {user.email} no está dada de alta en ningún espacio. Añádela
          a <code>allowed_members</code> y vuelve a entrar.
        </p>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {/* Una sola barra de espacios, y nunca una vista que los mezcle. */}
      <SpaceTabs spaces={spaces} userEmail={user.email ?? ""} />
      <main className="flex-1 px-4 pb-24 pt-4 sm:px-6">{children}</main>
    </div>
  );
}
