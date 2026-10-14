import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Varias pruebas arman escenas completas y hornean con Rapier: solas tardan de 3 a 5 s en la
    // laptop de referencia (medido con --reporter=verbose) y con todos los paquetes en paralelo
    // pasaban el límite de 5 s por omisión. El límite no cambia lo que se prueba.
    testTimeout: 30_000,
  },
});
