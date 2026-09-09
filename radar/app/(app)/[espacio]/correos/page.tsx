import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSpaceByKey } from "@/lib/spaces";
import { slugToSpaceKey, type Email } from "@/lib/types";
import { gmailMessageUrl } from "@/lib/gmail-link";
import { formatDateTime } from "@/lib/format";
import { RefreshButton } from "@/components/refresh-button";

/**
 * Los correos tal como llegaron, antes de extraer nada. Sirve para comprobar
 * que las fuentes están bien configuradas: si aquí aparece ruido, el problema
 * está en los remitentes, no en la extracción.
 */
export default async function EmailsPage({
  params,
}: {
  params: Promise<{ espacio: string }>;
}) {
  const { espacio } = await params;
  const key = slugToSpaceKey(espacio);
  if (!key) notFound();

  const space = await getSpaceByKey(key);
  if (!space) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("emails")
    .select("*")
    .eq("space_id", space.id)
    .order("received_at", { ascending: false })
    .limit(100);

  const emails = (data ?? []) as Email[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Correos recibidos</h1>
          <p className="text-xs text-[var(--color-muted)]">
            {emails.length} en los últimos {space.lookback_days} días
          </p>
        </div>
        <RefreshButton espacio={espacio} />
      </div>

      <Link
        href={`/${espacio}`}
        className="inline-block text-sm text-[var(--color-muted)] underline underline-offset-4"
      >
        ← Volver a los compromisos
      </Link>

      {emails.length === 0 ? (
        <p className="rounded-xl border border-[var(--color-line)] bg-white px-4 py-8 text-center text-sm text-[var(--color-muted)]">
          Todavía no hay correos. Pulsa «Actualizar» para traerlos.
        </p>
      ) : (
        <ul className="space-y-2">
          {emails.map((email) => (
            <li
              key={email.id}
              className="rounded-xl border border-[var(--color-line)] bg-white p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">
                  {email.from_name ?? email.from_email}
                </span>
                <span className="shrink-0 text-xs text-[var(--color-muted)]">
                  {formatDateTime(email.received_at)}
                </span>
              </div>
              <p className="mt-1 text-sm">{email.subject ?? "(sin asunto)"}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--color-muted)]">
                {email.snippet}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <a
                  href={gmailMessageUrl(email.gmail_message_id)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  Ver en Gmail
                </a>
                <ExtractionBadge email={email} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExtractionBadge({ email }: { email: Email }) {
  const labels: Record<string, string> = {
    pending: "sin analizar",
    processing: "analizando",
    done: "analizado",
    failed: "error al analizar",
    skipped: "descartado",
  };
  return (
    <span
      className="text-[var(--color-muted)]"
      title={email.extraction_error ?? undefined}
    >
      {labels[email.extraction_status] ?? email.extraction_status}
    </span>
  );
}
