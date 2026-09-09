import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { GOOGLE_SCOPES } from "@/lib/google/scopes";

const ROOT = path.resolve(__dirname, "..");
const SCANNED = ["app", "lib", "components"];

/**
 * "La app no envía correos, no responde a nadie, no borra nada. No hay ninguna
 * ruta de código que lo permita."
 *
 * Estos tests convierten esa frase en algo que falla si deja de ser verdad.
 */

describe("permisos de Google", () => {
  it("pide gmail solo en lectura", () => {
    const gmailScopes = GOOGLE_SCOPES.filter((s) => s.includes("gmail"));
    expect(gmailScopes).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
    ]);
  });

  it("no pide ningún scope de escritura sobre el correo", () => {
    const prohibidos = [
      "gmail.send",
      "gmail.modify",
      "gmail.compose",
      "gmail.insert",
      "gmail.settings",
      "gmail.labels",
      "mail.google.com",
    ];
    for (const scope of GOOGLE_SCOPES) {
      for (const prohibido of prohibidos) {
        expect(scope).not.toContain(prohibido);
      }
    }
  });

  it("no pide más permiso de Calendar del necesario para crear eventos", () => {
    const calendar = GOOGLE_SCOPES.filter((s) => s.includes("calendar"));
    expect(calendar).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
    ]);
  });

  it("la lista de scopes no ha crecido sin querer", () => {
    // Si este test falla, alguien añadió un permiso: revisa que sea deliberado.
    expect(GOOGLE_SCOPES).toHaveLength(5);
  });
});

describe("superficie de escritura en Gmail", () => {
  const PROHIBIDOS = [
    "gmail.googleapis.com/gmail/v1/users/me/messages/send",
    "/messages/batchModify",
    "/messages/batchDelete",
    "users/me/drafts",
    "/trash",
    "/untrash",
  ];

  it("no existe ninguna llamada a un endpoint de escritura de Gmail", () => {
    const hallazgos: string[] = [];

    for (const file of sourceFiles()) {
      const content = readFileSync(file, "utf8");
      for (const prohibido of PROHIBIDOS) {
        if (content.includes(prohibido)) {
          hallazgos.push(`${path.relative(ROOT, file)}: ${prohibido}`);
        }
      }
    }

    expect(hallazgos).toEqual([]);
  });

  it("el cliente de Gmail no usa otro verbo que GET", () => {
    const gmail = readFileSync(path.join(ROOT, "lib/google/gmail.ts"), "utf8");
    const metodos = [...gmail.matchAll(/method:\s*"(\w+)"/g)].map((m) => m[1]);
    expect(metodos.length).toBeGreaterThan(0);
    expect([...new Set(metodos)]).toEqual(["GET"]);
  });
});

describe("aislamiento del contenido del correo", () => {
  it("la extracción no declara herramientas", () => {
    // Sin tools no hay nada que un correo pueda hacer ejecutar, diga lo que
    // diga. Es la defensa estructural contra la inyección de prompt.
    const extract = readFileSync(
      path.join(ROOT, "lib/extraction/extract.ts"),
      "utf8",
    );
    expect(extract).not.toMatch(/^\s*tools:/m);
  });

  it("el cuerpo del correo va envuelto en su bloque no confiable", () => {
    const prompt = readFileSync(
      path.join(ROOT, "lib/extraction/prompt.ts"),
      "utf8",
    );
    expect(prompt).toContain("<contenido_no_confiable>");
    expect(prompt).toContain("</contenido_no_confiable>");
  });
});

function sourceFiles(): string[] {
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        files.push(full);
      }
    }
  };

  for (const dir of SCANNED) walk(path.join(ROOT, dir));
  return files;
}
