import { Portada, type DatosPortada } from "@/components/portada/portada";
import { Marco } from "@/components/sitio/marco";
import historia from "@/data/historia.json";
import portada from "@/data/portada.json";
import recorrido from "@/data/recorrido.json";
import type { EscenaSpec } from "@croquis/scene-schema";
import type { Lang } from "@/i18n";
import type { Pregunta } from "@/lib/relato-api";

interface Barra {
  etiqueta: { es: string };
  valor: number;
}
interface Grafica {
  barras?: Barra[];
  grupos?: { grupo: { es: string }; barras: Barra[] }[];
}

/** Una cifra de una evaluación por su etiqueta; si no está, el build falla (nada se inventa). */
function cifra(id: string, etiqueta: string, grupo?: string): number {
  const e = recorrido.evaluaciones.find((x) => x.id === id);
  const g = (e?.graficas ?? []) as Grafica[];
  const barras = grupo
    ? g.flatMap((x) => x.grupos ?? []).find((x) => x.grupo.es.startsWith(grupo))?.barras
    : g[0]?.barras;
  const b = barras?.find((x) => x.etiqueta.es === etiqueta);
  if (!b)
    throw new Error(`Falta ${etiqueta}${grupo ? ` (${grupo})` : ""} en ${id} de recorrido.json`);
  return b.valor;
}

/** Los datos de la portada, todos generados desde `eval/results` y `data/` (PLAN §11.3). */
function datosPortada(): DatosPortada {
  return {
    anio: historia.anio,
    accidentes: historia.nacional.accidentes,
    e1: { croquis: cifra("E1", "Claude Sonnet"), reglas: cifra("E1", "Reglas") },
    e3: { croquis: cifra("E3", "Croquis"), winsmash: cifra("E3", "WinSMASH") },
    e5: {
      croquis: cifra("E5", "Croquis", "Lateral"),
      uniforme: cifra("E5", "Uniforme", "Lateral"),
      lineal: cifra("E5", "Lineal simple", "Lateral"),
    },
    spec: portada.spec as unknown as EscenaSpec,
    relato: portada.relato,
    relatoEn: portada.relato_en,
    preguntas: portada.preguntas as Pregunta[],
    galeria: {
      prueba: "9064",
      foto: "/portada/e5-9064-foto.jpg",
      render: "/portada/e5-9064-croquis.jpg",
    },
  };
}

export default function InicioPagina({ lang }: { lang: Lang }) {
  return (
    <Marco lang={lang} sobreEscena>
      <Portada datos={datosPortada()} />
    </Marco>
  );
}
