import type { Metadata } from "next";
import { E9App } from "@/components/e9/e9-app";

export const metadata: Metadata = {
  title: "E9 — sesión de usabilidad",
  description: "Página de quien facilita las sesiones de usabilidad de Croquis (E9).",
  robots: { index: false, follow: false },
};

export default function E9Page() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">E9: sesión de usabilidad</h1>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Para quien facilita (protocolo en <code>docs/e9/protocolo.md</code>). Mientras la sesión
          está activa, este dispositivo anota solo el momento de algunos eventos (enviar el relato,
          contestar preguntas, corregir el croquis, ver la reconstrucción), nunca el texto del
          relato. Nada sale de aquí hasta que descargas el archivo.
        </p>
      </header>
      <E9App />
    </main>
  );
}
