import type { Metadata } from "next";
import Link from "next/link";
import { CroquisEditor } from "@/components/croquis-editor";

export const metadata: Metadata = {
  title: "Croquis 2D — edita la escena",
  description: "Editor del croquis sincronizado con la EscenaSpec: arrastra vehículos, personas y marcas.",
};

export default function CroquisPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-neutral-600 underline dark:text-neutral-400">
          ← Croquis
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Croquis 2D</h1>
        <p className="max-w-3xl text-neutral-700 dark:text-neutral-300">
          Diez escenas canónicas listas para corregir. El dibujo y el JSON son la misma escena: lo que muevas aquí
          se refleja allá y viceversa.
        </p>
      </header>
      <CroquisEditor />
    </main>
  );
}
