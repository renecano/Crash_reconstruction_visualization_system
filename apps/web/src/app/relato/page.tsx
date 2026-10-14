import type { Metadata } from "next";
import Link from "next/link";
import { RelatoApp } from "@/components/relato/relato-app";

export const metadata: Metadata = {
  title: "Relato — cuenta qué pasó",
  description:
    "Escribe el relato del percance: se quitan los datos personales en tu dispositivo, se entienden los hechos con su cita y se pregunta solo lo que más importa.",
};

export default function RelatoPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-neutral-600 underline dark:text-neutral-400">
          ← Croquis
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Tu relato</h1>
      </header>
      <RelatoApp />
    </main>
  );
}
