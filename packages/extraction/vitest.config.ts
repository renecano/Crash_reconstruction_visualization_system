import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // La paridad del pipeline recorre 1,202 relatos por modelo y versión del prompt: en la laptop
    // de referencia, con todos los paquetes en paralelo, pasaba el límite de 5 s por omisión. El
    // límite no cambia lo que se prueba.
    testTimeout: 30_000,
  },
});
