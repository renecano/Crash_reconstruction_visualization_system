import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VisorApp } from "@/components/visor/visor-app";

export const metadata: Metadata = {
  title: "Visor 3D — reconstrucción ilustrativa",
  description:
    "Las diez escenas canónicas reconstruidas por el solver de Croquis, en 3D en el navegador.",
};

export default function VisorPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-neutral-600 underline dark:text-neutral-400">
          ← Croquis
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Visor 3D</h1>
        <p className="max-w-3xl text-neutral-700 dark:text-neutral-300">
          Cada escena se reconstruye con el solver físico de Croquis; el visor solo muestra lo que
          el solver calculó. El tiempo 0 es el momento del impacto.
        </p>
      </header>
      <Suspense fallback={<p>Cargando…</p>}>
        <VisorApp />
      </Suspense>
    </main>
  );
}
