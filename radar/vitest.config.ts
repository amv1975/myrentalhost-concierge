import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    // Los tests de base de datos comparten una sola base y cada uno la deja
    // limpia al empezar. En paralelo se pisan: uno borra el esquema mientras
    // el otro lo está usando, y el fallo parece un error de la aplicación
    // cuando es de la fontanería de los tests.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
