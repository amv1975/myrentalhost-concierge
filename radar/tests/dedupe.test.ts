import { describe, expect, it } from "vitest";
import {
  buildDedupeKey,
  diffItems,
  findMatchingItem,
  normalizeTitle,
  titleSimilarity,
  type ExistingItem,
} from "@/lib/extraction/dedupe";

function existing(overrides: Partial<ExistingItem> = {}): ExistingItem {
  const title = overrides.title ?? "Reunión de padres 2º B";
  return {
    id: "item-1",
    type: "event",
    title,
    normalized_title: overrides.normalized_title ?? normalizeTitle(title),
    dedupe_key: "event|2026-03-12|reunion padres 2 b",
    status: "confirmed",
    starts_at: "2026-03-12T16:30:00.000Z",
    due_date: null,
    google_event_id: "gcal-abc",
    description: "Traer la autorización firmada",
    location: "Col·legi Lestonnac",
    all_day: false,
    gmail_thread_id: "thread-1",
    ...overrides,
  };
}

describe("normalizeTitle", () => {
  it("quita tildes, mayúsculas y puntuación", () => {
    expect(normalizeTitle("Reunión de Padres, 2º B")).toBe("reunion padres 2 b");
  });

  it("hace colisionar el mismo aviso en catalán y castellano", () => {
    const castellano = normalizeTitle("Recordatorio: Reunión de padres");
    const catalan = normalizeTitle("RECORDATORI: Reunió de pares");
    expect(titleSimilarity(castellano, catalan)).toBeGreaterThan(0.72);
  });

  it("no deja la clave vacía cuando el título es todo palabras de relleno", () => {
    // Si devolviera "", dos avisos distintos compartirían clave y uno
    // sobrescribiría al otro.
    expect(normalizeTitle("Información importante")).not.toBe("");
  });
});

describe("findMatchingItem", () => {
  const candidate = {
    type: "event",
    normalizedTitle: normalizeTitle("Reunión de padres 2º B"),
    dedupeKey: "event|2026-03-12|reunion padres 2 b",
    date: "2026-03-12",
    threadId: "thread-1",
  };

  it("empareja por clave idéntica", () => {
    expect(findMatchingItem(candidate, [existing()])?.id).toBe("item-1");
  });

  it("empareja el aviso de cambio de hora que llega en el mismo hilo", () => {
    // Este es el caso que motiva todo el matching: el cole mueve la reunión de
    // las 17:30 a las 18:00 y lo comunica en el mismo hilo. Es el mismo
    // compromiso, no uno nuevo.
    const cambio = {
      ...candidate,
      date: "2026-03-12",
      dedupeKey: "event|2026-03-12|reunion pares 2 b canvi hora",
      normalizedTitle: normalizeTitle("Reunió de pares 2n B"),
    };
    expect(findMatchingItem(cambio, [existing()])?.id).toBe("item-1");
  });

  it("no empareja compromisos distintos que se llaman parecido", () => {
    const otro = {
      ...candidate,
      dedupeKey: "event|2026-03-12|excursion zoo",
      normalizedTitle: normalizeTitle("Excursión al Zoo"),
    };
    expect(findMatchingItem(otro, [existing()])).toBeNull();
  });

  it("no empareja fuera de la ventana de fechas si no comparten hilo", () => {
    const lejano = {
      ...candidate,
      date: "2026-09-12",
      dedupeKey: "event|2026-09-12|reunion padres 2 b",
      threadId: "otro-hilo",
    };
    expect(findMatchingItem(lejano, [existing()])).toBeNull();
  });

  it("no resucita un ítem que descartaste a mano", () => {
    const descartado = existing({ status: "dismissed" });
    expect(findMatchingItem(candidate, [descartado])).toBeNull();
  });

  it("no cruza eventos con acciones", () => {
    // Misma cosa nombrada igual y el mismo día, pero una es "ir a la reunión" y
    // la otra "pagar antes de la reunión": son compromisos distintos.
    const accion = {
      ...candidate,
      type: "action",
      dedupeKey: buildDedupeKey({
        type: "action",
        normalizedTitle: candidate.normalizedTitle,
        date: candidate.date,
      }),
    };
    expect(findMatchingItem(accion, [existing()])).toBeNull();
  });

  it("prefiere el del mismo hilo cuando hay dos candidatos parecidos", () => {
    const otroHilo = existing({
      id: "item-2",
      gmail_thread_id: "thread-9",
      dedupe_key: "event|2026-03-12|reunion padres 2 b bis",
    });
    const mismoHilo = existing({
      id: "item-3",
      gmail_thread_id: "thread-1",
      dedupe_key: "event|2026-03-12|reunion padres 2 b ter",
    });
    const sinClaveIgual = { ...candidate, dedupeKey: "event|2026-03-12|otra" };
    expect(findMatchingItem(sinClaveIgual, [otroHilo, mismoHilo])?.id).toBe(
      "item-3",
    );
  });
});

describe("diffItems", () => {
  it("detecta el cambio de hora", () => {
    const changes = diffItems(existing(), {
      title: "Reunión de padres 2º B",
      description: "Traer la autorización firmada",
      startsAt: new Date("2026-03-12T17:00:00.000Z"),
      dueDate: null,
      location: "Col·legi Lestonnac",
    });
    expect(Object.keys(changes)).toEqual(["starts_at"]);
    expect(changes.starts_at.after).toBe("2026-03-12T17:00:00.000Z");
  });

  it("no marca cambio cuando el correo repite lo mismo", () => {
    const changes = diffItems(existing(), {
      title: "Reunión de padres 2º B",
      description: "Traer la autorización firmada",
      startsAt: new Date("2026-03-12T16:30:00.000Z"),
      dueDate: null,
      location: "Col·legi Lestonnac",
    });
    expect(changes).toEqual({});
  });
});

describe("buildDedupeKey", () => {
  it("no depende del orden en que el modelo devuelva los ítems", () => {
    const a = buildDedupeKey({
      type: "event",
      normalizedTitle: "reunion padres",
      date: "2026-03-12",
    });
    const b = buildDedupeKey({
      type: "event",
      normalizedTitle: "reunion padres",
      date: "2026-03-12",
    });
    expect(a).toBe(b);
  });

  it("distingue una acción de un evento con el mismo título y fecha", () => {
    const evento = buildDedupeKey({
      type: "event",
      normalizedTitle: "excursion zoo",
      date: "2026-03-12",
    });
    const accion = buildDedupeKey({
      type: "action",
      normalizedTitle: "excursion zoo",
      date: "2026-03-12",
    });
    expect(evento).not.toBe(accion);
  });
});
