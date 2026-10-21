import { redirect } from "next/navigation";
import { ruta, type Lang } from "@/i18n";

/** `/relato` era la página del relato; ahora el relato es el primer paso del flujo guiado. */
export default function RelatoPagina({ lang }: { lang: Lang }): never {
  redirect(ruta(lang, "/cuenta"));
}
