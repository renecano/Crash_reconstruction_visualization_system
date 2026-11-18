using System;
using System.Collections.Generic;
using Croquis.Core;
using UnityEngine;
using Material = UnityEngine.Material;

namespace Croquis.Visor
{
    /// <summary>
    /// El piso del modo «mapa real» (ronda 4, punto 9; ADR 0124): la imagen del lugar, norte arriba,
    /// tendida sobre el piso del caso (con su relieve, si lo hay) y una orilla neutra hasta el horizonte.
    /// La imagen se ilumina como el resto de la escena (de noche se ve lo que alumbran luminarias y
    /// faros), recibe las sombras de los vehículos y no proyecta. Qué se apaga mientras está puesta lo
    /// decide `VisorCaso`.
    /// </summary>
    public sealed class PisoMapaVista
    {
        private static readonly Color ColorOrilla = new Color(0.36f, 0.37f, 0.36f);

        private readonly List<Mesh> mallas = new List<Mesh>();
        private GameObject raiz;
        private Texture2D textura;
        private Material material;

        /// <summary>Si hay imagen puesta.</summary>
        public bool Puesto => textura != null;

        /// <summary>El crédito de la imagen puesta (para la leyenda); null sin piso.</summary>
        public string Atribucion { get; private set; }

        /// <summary>
        /// Abre la imagen de una data URL como textura con mipmaps. Revisa tipo y medidas antes de
        /// abrirla (`PisoMapa`): una imagen que no sirve no llega a pedir memoria.
        /// </summary>
        /// <exception cref="FormatException">La imagen no sirve como piso.</exception>
        public static Texture2D Abrir(string dataUrl)
        {
            var bytes = PisoMapa.Decodificar(dataUrl, out _);
            if (!PisoMapa.Medidas(bytes, out var ancho, out var alto))
            {
                throw new FormatException("No se pudieron leer las medidas de la imagen del piso.");
            }

            var problema = PisoMapa.RevisarPixeles(ancho, alto);
            if (problema != null)
            {
                throw new FormatException(problema);
            }

            // Con mipmaps: vista de lado, a lo lejos, la foto no hierve.
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, true) { name = "piso_mapa" };
            if (!ImageConversion.LoadImage(tex, bytes, true))
            {
                UnityEngine.Object.Destroy(tex);
                throw new FormatException("La imagen del piso no se pudo abrir.");
            }

            tex.wrapMode = TextureWrapMode.Clamp;
            tex.filterMode = FilterMode.Trilinear;
            tex.anisoLevel = 4;
            return tex;
        }

        /// <summary>
        /// Pone la imagen (ya abierta con `Abrir`; desde aquí es de esta vista y la destruye al quitarla)
        /// cubriendo `ladoM` metros alrededor de (`centroX`, `centroY`) de la escena.
        /// </summary>
        public void Poner(Transform padre, Texture2D tex, double centroX, double centroY, double ladoM, string atribucion, Terreno terreno)
        {
            Quitar();
            terreno = terreno ?? new Terreno();
            textura = tex;
            Atribucion = atribucion ?? string.Empty;
            raiz = new GameObject("piso_mapa");
            raiz.transform.SetParent(padre, false);

            // Una copia del opaco liso (URP Lit) con la imagen como color: casi mate, para que una foto
            // no brille como charco.
            material = new Material(Materiales.Liso(Color.white, 0.05f)) { name = "piso_mapa" };
            material.SetTexture("_BaseMap", tex);
            material.SetColor("_BaseColor", Color.white);

            // La imagen: una rejilla de n × n celdas, con la textura de (0, 0) al suroeste a (1, 1) al
            // noreste. En el marco de Unity la escena es (x, z, y): el norte es +Z.
            var n = PisoMapa.Divisiones(ladoM, terreno.Plano);
            var esquinas = PisoMapa.Esquinas(centroX, centroY, ladoM);
            var x0 = esquinas[0].X;
            var y0 = esquinas[0].Y;
            var alto = (float)PisoMapa.AlturaSobrePiso;
            var m = new Malla();
            for (var j = 0; j <= n; j++)
            {
                for (var i = 0; i <= n; i++)
                {
                    var x = (float)(x0 + ladoM * i / n);
                    var y = (float)(y0 + ladoM * j / n);
                    m.Vertice(new Vector3(x, terreno.Z(x, y) + alto, y), new Vector2((float)i / n, (float)j / n));
                }
            }

            for (var j = 0; j < n; j++)
            {
                for (var i = 0; i < n; i++)
                {
                    // a, b, c, d antihorarios vistos desde arriba, como `Malla.Cuadro`: la cara mira arriba.
                    var a = j * (n + 1) + i;
                    var b = a + 1;
                    var c = a + n + 2;
                    var d = a + n + 1;
                    m.Triangulo(a, c, b);
                    m.Triangulo(a, d, c);
                }
            }

            Guardar(m.Poner(raiz.transform, "imagen", material, false, true));

            // La orilla: un cuadro neutro debajo, hasta donde la niebla ya cubre el horizonte.
            var orilla = new Malla();
            var media = (float)(ladoM / 2.0 + PisoMapa.MargenOrillaM);
            var cx = (float)centroX;
            var cy = (float)centroY;
            var h = (float)PisoMapa.AlturaOrilla;
            orilla.Tarjeta(
                new Vector3(cx - media, h, cy - media),
                new Vector3(cx + media, h, cy - media),
                new Vector3(cx + media, h, cy + media),
                new Vector3(cx - media, h, cy + media));
            Guardar(orilla.Poner(raiz.transform, "orilla", Materiales.Liso(ColorOrilla, 0.05f), false, true));
        }

        private void Guardar(GameObject go)
        {
            var mf = go.GetComponent<MeshFilter>();
            if (mf != null && mf.sharedMesh != null)
            {
                mallas.Add(mf.sharedMesh);
            }
        }

        /// <summary>Quita la imagen y libera su textura, su material y sus mallas.</summary>
        public void Quitar()
        {
            if (raiz != null)
            {
                UnityEngine.Object.Destroy(raiz);
            }

            foreach (var m in mallas)
            {
                if (m != null)
                {
                    UnityEngine.Object.Destroy(m);
                }
            }

            mallas.Clear();
            if (material != null)
            {
                UnityEngine.Object.Destroy(material);
            }

            if (textura != null)
            {
                UnityEngine.Object.Destroy(textura);
            }

            raiz = null;
            material = null;
            textura = null;
            Atribucion = null;
        }
    }
}
