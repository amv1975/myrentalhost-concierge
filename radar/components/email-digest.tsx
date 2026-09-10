import type { EmailBrief } from "@/lib/items";
import { gmailSearchUrl } from "@/lib/gmail-link";
import { sourceLabel } from "@/lib/source-label";
import { relativeDays } from "@/lib/format";

/**
 * El resto del correo, resumido.
 *
 * Arriba están los compromisos, que piden una decisión. Aquí abajo está todo lo
 * demás que ha llegado a esta vida: una línea por correo diciendo qué pasa, no
 * de qué habla. Sirve para lo contrario que una tarjeta — para descartar de un
 * vistazo, sin abrir Gmail.
 */
export function EmailDigest({ emails }: { emails: EmailBrief[] }) {
  if (emails.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2.5 flex items-baseline gap-2 px-0.5 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Qué más ha llegado
        <span className="tnum rounded-full bg-[var(--color-line-soft)] px-1.5 text-[11px] font-semibold normal-case tracking-normal text-[var(--color-body)]">
          {emails.length}
        </span>
      </h2>
      <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        {emails.map((email) => (
          <Row key={email.id} email={email} />
        ))}
      </ul>
    </section>
  );
}

function Row({ email }: { email: EmailBrief }) {
  const from = sourceLabel(email.from_email, email.from_name);
  const urgent = email.importance === "alta";

  return (
    <li>
      <a
        href={gmailSearchUrl({
          fromEmail: email.from_email,
          subject: email.subject,
          messageId: email.gmail_message_id,
        })}
        target="_blank"
        rel="noreferrer"
        className="block px-4 py-3 active:bg-[var(--color-line-soft)]"
      >
        <p
          className={`text-sm leading-snug ${
            urgent
              ? "font-semibold text-[var(--color-body)]"
              : "text-[var(--color-body)]"
          }`}
        >
          {/* Un punto, no una etiqueta: marca lo que no conviene pasar por alto
              sin gritar en cada fila. */}
          {urgent ? (
            <span
              aria-label="Importante"
              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle bg-[var(--color-danger)]"
            />
          ) : null}
          {email.summary ?? email.subject ?? "(sin asunto)"}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-faint)]">
          {from ? <span className="truncate">{from}</span> : null}
          {from ? <span aria-hidden>·</span> : null}
          <span className="shrink-0">{relativeDays(email.received_at)}</span>
        </p>
      </a>
    </li>
  );
}
