/**
 * Las exportaciones del dictamen de /cesvi (ADR 0057): Word con el mismo contenido que el PDF, el
 * croquis a escala de cada versión (PNG, sin mapa de fondo) y la huella de las entradas para la
 * trazabilidad. El caso en JSON lo arma el recorrido con estos mismos datos.
 */
import {
  distanciaM,
  enMetros,
  FASES,
  rectanguloVehiculo,
  type Calle,
  type LonLat,
  type Medidas,
  type VersionCroquis,
} from "@croquis/cesvi";
import { sha256Hex } from "@croquis/extraction";
import type { Content } from "pdfmake/interfaces";

/** La huella de las entradas: SHA-256 (los primeros 12 hexadecimales) de su JSON. */
export function huellaEntradas(entradas: unknown): string {
  return sha256Hex(JSON.stringify(entradas)).slice(0, 12);
}

/* ------------------------------------------------------------------------------------------ */
/* Word                                                                                       */
/* ------------------------------------------------------------------------------------------ */

type Corrida = { text: string; bold?: boolean; italics?: boolean; color?: string; size?: number };

/** Las corridas de texto de un nodo de pdfmake (texto, arreglo de corridas o anidado). */
function corridas(n: unknown, heredado: Omit<Corrida, "text"> = {}): Corrida[] {
  if (typeof n === "string") return [{ text: n, ...heredado }];
  if (Array.isArray(n)) return n.flatMap((x) => corridas(x, heredado));
  if (n && typeof n === "object" && "text" in n) {
    const o = n as {
      text: unknown;
      bold?: boolean;
      italics?: boolean;
      color?: string;
      fontSize?: number;
    };
    return corridas(o.text, {
      bold: o.bold ?? heredado.bold,
      italics: o.italics ?? heredado.italics,
      color: (o.color ?? heredado.color)?.replace("#", ""),
      size: o.fontSize ? o.fontSize * 2 : heredado.size,
    });
  }
  return [];
}

const bytesDeDataUrl = (url: string): Uint8Array => {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** El dictamen en Word (.docx), a partir del mismo contenido que el PDF. */
export async function dictamenDocx(contenido: Content[], pie: string): Promise<Uint8Array> {
  const d = await import("docx");
  const parrafo = (n: unknown) =>
    new d.Paragraph({
      spacing: { after: 120 },
      children: corridas(n).map(
        (c) =>
          new d.TextRun({
            text: c.text,
            bold: c.bold,
            italics: c.italics,
            color: c.color,
            size: c.size ?? 20,
          }),
      ),
    });
  const bloques = (
    n: unknown,
  ): (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] => {
    if (n === null || n === undefined) return [];
    if (typeof n === "string" || Array.isArray(n)) {
      return Array.isArray(n) && n.some((x) => typeof x === "object" && x && !("text" in x))
        ? n.flatMap(bloques)
        : [parrafo(n)];
    }
    const o = n as Record<string, unknown>;
    if (Array.isArray(o.stack)) return o.stack.flatMap(bloques);
    if (Array.isArray(o.columns)) return o.columns.flatMap(bloques);
    if (typeof o.image === "string" && o.image.startsWith("data:image/png")) {
      const ancho = Math.min(Number(o.width ?? 500), 600);
      return [
        new d.Paragraph({
          children: [
            new d.ImageRun({
              type: "png",
              data: bytesDeDataUrl(o.image),
              transformation: { width: ancho, height: Math.round(ancho * 0.56) },
            }),
          ],
        }),
      ];
    }
    if (o.table && typeof o.table === "object") {
      const body = (o.table as { body: unknown[][] }).body;
      return [
        new d.Table({
          width: { size: 100, type: d.WidthType.PERCENTAGE },
          rows: body.map(
            (fila, i) =>
              new d.TableRow({
                tableHeader: i === 0,
                children: fila.map(
                  (celda) =>
                    new d.TableCell({
                      children: [parrafo(i === 0 ? { text: corridas(celda), bold: true } : celda)],
                    }),
                ),
              }),
          ),
        }),
      ];
    }
    if (Array.isArray(o.ol) || Array.isArray(o.ul)) {
      const items = (Array.isArray(o.ol) ? o.ol : o.ul) as unknown[];
      return items.map((x, i) => parrafo([Array.isArray(o.ol) ? `${i + 1}. ` : "• ", x]));
    }
    if ("text" in o) return [parrafo(o)];
    return [];
  };
  const doc = new d.Document({
    sections: [
      {
        footers: { default: new d.Footer({ children: [parrafo({ text: pie, fontSize: 8 })] }) },
        children: contenido.flatMap(bloques),
      },
    ],
  });
  return new Uint8Array(await d.Packer.toArrayBuffer(doc));
}

/* ------------------------------------------------------------------------------------------ */
/* Croquis a escala                                                                           */
/* ------------------------------------------------------------------------------------------ */

export interface ColoresCroquis {
  fondo: string;
  calle: string;
  texto: string;
  A: string;
  B: string;
  senal: string;
}

/**
 * El croquis a escala de una versión, en PNG (data URL): calles cercanas, las tres posiciones de
 * cada vehículo, la zona de restos, el punto de impacto, el norte y una barra de escala. Sin mapa de
 * fondo: sirve para el PDF y para descargar.
 */
export function croquisEsquema(
  v: VersionCroquis,
  calles: Calle[],
  medidas: Record<"A" | "B", Medidas>,
  nombres: Record<"A" | "B", string>,
  c: ColoresCroquis,
  titulo: string,
  ancho = 900,
  alto = 520,
): string | null {
  if (typeof document === "undefined") return null;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const g = lienzo.getContext("2d");
  if (!g) return null;
  const origen = v.impacto.punto;
  const puntos: LonLat[] = [
    ...(["A", "B"] as const).flatMap((l) => FASES.map((f) => v.vehiculos[l][f].punto)),
    v.restos.inicio,
    v.restos.fin,
  ];
  const ms = puntos.map((p) => enMetros(p, origen));
  const margenM = 8;
  const minE = Math.min(...ms.map((m) => m.este)) - margenM;
  const maxE = Math.max(...ms.map((m) => m.este)) + margenM;
  const minN = Math.min(...ms.map((m) => m.norte)) - margenM;
  const maxN = Math.max(...ms.map((m) => m.norte)) + margenM;
  const escala = Math.min((ancho - 80) / (maxE - minE), (alto - 90) / (maxN - minN));
  const cx = (ancho - (maxE - minE) * escala) / 2;
  const cy = 50 + (alto - 90 - (maxN - minN) * escala) / 2;
  const xy = (p: LonLat): [number, number] => {
    const m = enMetros(p, origen);
    return [cx + (m.este - minE) * escala, cy + (maxN - m.norte) * escala];
  };
  g.fillStyle = c.fondo;
  g.fillRect(0, 0, ancho, alto);
  g.save();
  g.beginPath();
  g.rect(0, 40, ancho, alto - 40);
  g.clip();
  g.strokeStyle = c.calle;
  g.lineWidth = Math.max(2, 3.5 * escala);
  g.lineCap = "round";
  for (const calle of calles) {
    g.beginPath();
    calle.puntos.forEach((p, i) => (i ? g.lineTo(...xy(p)) : g.moveTo(...xy(p))));
    g.stroke();
  }
  g.restore();
  if (distanciaM(v.restos.inicio, v.restos.fin) > 0.05) {
    g.strokeStyle = c.senal;
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    g.beginPath();
    g.moveTo(...xy(v.restos.inicio));
    g.lineTo(...xy(v.restos.fin));
    g.stroke();
    g.setLineDash([]);
  }
  for (const l of ["A", "B"] as const) {
    for (const f of FASES) {
      const pose = v.vehiculos[l][f];
      const poly = rectanguloVehiculo(pose.punto, pose.rumbo, medidas[l].largo, medidas[l].ancho);
      g.beginPath();
      poly.forEach((p, i) => (i ? g.lineTo(...xy(p)) : g.moveTo(...xy(p))));
      g.closePath();
      g.strokeStyle = c[l];
      g.lineWidth = 2;
      g.setLineDash(f === "inicial" ? [5, 4] : []);
      g.globalAlpha = f === "final" ? 0.9 : f === "impacto" ? 0.3 : 0;
      g.fillStyle = c[l];
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
      g.setLineDash([]);
    }
    const [x, y] = xy(v.vehiculos[l].final.punto);
    g.fillStyle = c.texto;
    g.font = "600 15px sans-serif";
    g.fillText(nombres[l], x + 14, y + 5);
  }
  const [ix, iy] = xy(v.impacto.punto);
  g.strokeStyle = c.senal;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(ix - 9, iy - 9);
  g.lineTo(ix + 9, iy + 9);
  g.moveTo(ix + 9, iy - 9);
  g.lineTo(ix - 9, iy + 9);
  g.stroke();
  // Título, norte y escala.
  g.fillStyle = c.texto;
  g.font = "600 16px sans-serif";
  g.fillText(titulo, 20, 28);
  g.font = "13px sans-serif";
  g.fillText("N ↑", ancho - 48, 28);
  const metros = [1, 2, 5, 10, 20, 50].find((m) => m * escala > 60) ?? 50;
  g.fillRect(20, alto - 26, metros * escala, 3);
  g.fillText(`${metros} m`, 24 + metros * escala, alto - 20);
  return lienzo.toDataURL("image/png");
}
