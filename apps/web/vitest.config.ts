import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Las pruebas de cálculo que reconstruyen casos completos (el solver con sus muestras): en CI corren en
 * su propio job, en paralelo con el de la web, para que ninguno pase de 10 minutos (CLAUDE.md: «si
 * tarda más, recorta lo que lo hace lento, no las pruebas de cálculo»). Localmente, `vitest run` corre
 * todas; `CROQUIS_PRUEBAS=ligeras` deja fuera estas y `CROQUIS_PRUEBAS=pesadas` corre solo estas.
 */
export const PESADAS = [
  "src/lib/solver-rango.test.ts",
  "src/lib/axa-lectura-fisica.test.ts",
  "src/lib/carambola-detenido.test.ts",
  "src/lib/velocidad-del-perito.*.test.ts",
  "src/lib/visor-unity/deformacion-medida.test.ts",
  "src/lib/objetos-narrados.test.ts",
];
const cuales = process.env.CROQUIS_PRUEBAS;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: cuales === "pesadas" ? PESADAS : ["src/**/*.test.{ts,tsx}"],
    exclude:
      cuales === "ligeras" ? [...configDefaults.exclude, ...PESADAS] : configDefaults.exclude,
  },
});
