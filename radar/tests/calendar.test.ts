import { describe, expect, it } from "vitest";
import { needsSync } from "@/lib/calendar/needs-sync";

type SyncCandidate = Parameters<typeof needsSync>[0];

function item(overrides: Partial<SyncCandidate> = {}): SyncCandidate {
  return {
    status: "confirmed",
    starts_at: "2026-03-12T16:30:00.000Z",
    google_event_id: "gcal-abc",
    synced_at: "2026-03-01T10:00:00.000Z",
    updated_at: "2026-03-01T09:00:00.000Z",
    ...overrides,
  };
}

/**
 * "Si esto falla, en una semana tengo el calendario lleno de duplicados."
 *
 * La sincronización corre en cada pasada del cron sobre los mismos ítems
 * confirmados. Lo único que impide que cree un evento por pasada es esta
 * función.
 */
describe("needsSync", () => {
  it("no vuelve a tocar un evento ya sincronizado que no ha cambiado", () => {
    expect(needsSync(item())).toBe(false);
  });

  it("sincroniza un evento confirmado que nunca subió", () => {
    expect(
      needsSync(item({ google_event_id: null, synced_at: null })),
    ).toBe(true);
  });

  it("actualiza el evento cuando el compromiso cambió después de subirlo", () => {
    // El cole movió la hora: updated_at es posterior a synced_at.
    expect(
      needsSync(
        item({
          synced_at: "2026-03-01T10:00:00.000Z",
          updated_at: "2026-03-02T08:00:00.000Z",
        }),
      ),
    ).toBe(true);
  });

  it("retira del calendario un evento descartado que ya estaba puesto", () => {
    expect(needsSync(item({ status: "dismissed" }))).toBe(true);
  });

  it("no hace nada al descartar algo que nunca llegó al calendario", () => {
    expect(
      needsSync(item({ status: "dismissed", google_event_id: null })),
    ).toBe(false);
  });

  it("ignora un evento sin hora de inicio", () => {
    expect(needsSync(item({ starts_at: null, google_event_id: null }))).toBe(
      false,
    );
  });

  it("veinte pasadas seguidas del cron solo actuarían en la primera", () => {
    // Primera pasada: hay que crear el evento.
    let current = item({ google_event_id: null, synced_at: null });
    expect(needsSync(current)).toBe(true);

    // Tras crearlo, la sincronización sella synced_at.
    current = item({
      google_event_id: "gcal-nuevo",
      synced_at: "2026-03-01T11:00:00.000Z",
      updated_at: "2026-03-01T09:00:00.000Z",
    });

    for (let i = 0; i < 20; i++) {
      expect(needsSync(current)).toBe(false);
    }
  });
});
