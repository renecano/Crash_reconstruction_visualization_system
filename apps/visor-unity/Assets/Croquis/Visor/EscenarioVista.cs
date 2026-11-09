using System;
using System.Collections.Generic;
using Croquis.Generated;
using UnityEngine;
using UnityEngine.UI;

namespace Croquis.Visor
{
    /// <summary>
    /// Dibuja el escenario que calculó TS (ADR 0112): la vía, el suelo, el entorno procedural, el cielo,
    /// la luz y la lluvia. No calcula geometría del caso: solo la convierte a mallas de Unity. El marco
    /// es el de siempre: posición de Unity = (x, z, y).
    /// </summary>
    public static class EscenarioVista
    {
        private static readonly Color Asfalto = new Color(0.16f, 0.165f, 0.17f);
        private static readonly Color Concreto = new Color(0.56f, 0.55f, 0.52f);
        private static readonly Color Blanco = new Color(0.86f, 0.86f, 0.82f);
        private static readonly Color Amarillo = new Color(0.86f, 0.68f, 0.16f);
        private static readonly Color Tierra = new Color(0.47f, 0.40f, 0.30f);

        private static Mesh cubo;
        private static Mesh cilindro;
        private static Mesh esfera;
        private static Mesh capsula;

        public static void Construir(Transform raiz, Escenario e, Light sol, Camera camara)
        {
            Primitivas();
            var escenario = new GameObject("escenario").transform;
            escenario.SetParent(raiz, false);
            Ambiente(e.Ambiente, sol, camara);
            Via(escenario, e.Via, e.Ambiente);
            foreach (var s in e.Suelo)
            {
                Suelo(escenario, s, e.Ambiente);
            }

            Entorno(escenario, e.Entorno, e.Ambiente);
            Luminarias(escenario, e.Luminarias, e.Ambiente);
            if (e.Ambiente.Precipitacion.StartsWith("lluvia", StringComparison.Ordinal) || e.Ambiente.Precipitacion == "granizo")
            {
                Lluvia(escenario, e.Centro, e.Ambiente.Precipitacion == "lluvia_ligera" ? 2500 : 6000);
            }

            Leyenda(escenario);
        }

        private static void Primitivas()
        {
            if (cubo != null)
            {
                return;
            }

            Mesh De(PrimitiveType t)
            {
                var go = GameObject.CreatePrimitive(t);
                var m = go.GetComponent<MeshFilter>().sharedMesh;
                UnityEngine.Object.Destroy(go);
                return m;
            }

            cubo = De(PrimitiveType.Cube);
            cilindro = De(PrimitiveType.Cylinder);
            esfera = De(PrimitiveType.Sphere);
            capsula = De(PrimitiveType.Capsule);
        }

        private static Vector3 U(double x, double y, double z)
        {
            return new Vector3((float)x, (float)z, (float)y);
        }

        // ---- Cielo, luz y aire ------------------------------------------------------------------------

        private static void Ambiente(AmbienteEscenario a, Light sol, Camera camara)
        {
            var d = a.DireccionLuz;
            var haciaLaLuz = U(d[0], d[1], d[2]).normalized;
            sol.transform.rotation = Quaternion.LookRotation(-haciaLaLuz);
            // Las intensidades vienen del visor web (three.js); en URP una luz direccional de 1 ya es sol
            // pleno, así que se escalan para el mismo contraste.
            sol.intensity = (float)a.IntensidadSol * (a.Noche ? 0.35f : 0.5f);
            sol.color = a.Noche
                ? new Color(0.62f, 0.7f, 0.95f)
                : Color.Lerp(new Color(1f, 0.78f, 0.6f), new Color(1f, 0.97f, 0.92f), Mathf.Clamp01((float)a.SolElevacionDeg / 30f));
            sol.shadows = LightShadows.Soft;

            var cielo = Materiales.Hex(a.ColorCielo, new Color(0.56f, 0.76f, 0.92f));
            var ambiente = Materiales.Hex(a.ColorAmbiente, cielo);
            var suelo = Materiales.Hex(a.ColorSuelo, new Color(0.35f, 0.4f, 0.25f));
            var k = (float)a.IntensidadAmbiente * 0.55f;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = ambiente * k;
            RenderSettings.ambientEquatorColor = Color.Lerp(ambiente, suelo, 0.5f) * k;
            RenderSettings.ambientGroundColor = suelo * (k * 0.5f);

            var cieloMat = new Material(Shader.Find("Skybox/Procedural"));
            cieloMat.SetColor("_SkyTint", cielo);
            cieloMat.SetColor("_GroundColor", Color.Lerp(suelo, cielo, 0.5f));
            cieloMat.SetFloat("_AtmosphereThickness", Mathf.Clamp((float)a.Turbidez / 4f, 0.5f, 2.5f));
            cieloMat.SetFloat("_Exposure", a.Noche ? 0.12f : 1.25f);
            cieloMat.SetFloat("_SunSize", a.Noche ? 0f : 0.035f);
            RenderSettings.skybox = cieloMat;
            RenderSettings.sun = sol;
            camara.clearFlags = CameraClearFlags.Skybox;
            camara.farClipPlane = 2600f;

            RenderSettings.fog = a.DensidadNiebla > 0;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = (float)a.DensidadNiebla;
            RenderSettings.fogColor = a.Noche ? new Color(0.05f, 0.06f, 0.09f) : Color.Lerp(cielo, Color.white, 0.35f);
            DynamicGI.UpdateEnvironment();
        }

        // ---- Vía --------------------------------------------------------------------------------------

        private static void Via(Transform padre, ViaEscenario v, AmbienteEscenario a)
        {
            var via = new GameObject("via").transform;
            via.SetParent(padre, false);
            var lisuraAsfalto = a.Mojado ? 0.82f : 0.18f;
            foreach (var c in v.Capas)
            {
                var (color, lisura) = MaterialDeCapa(c.Nombre, lisuraAsfalto);
                var malla = Planta(c.Posiciones, c.Indices, (float)c.AlturaM);
                var mat = (c.Nombre == Nombre.RayasBlancas || c.Nombre == Nombre.PasoPeatonal || c.Nombre == Nombre.RayasAmarillas) && a.Noche
                    ? Materiales.Emisivo(color, color * 0.06f)
                    : Materiales.Liso(color, lisura);
                Pieza(via, c.Nombre.ToString(), malla, mat);
            }

            if (v.Guarniciones.Length > 0)
            {
                Pieza(via, "guarniciones", Paredes(v.Guarniciones, 0f, (float)v.AlturaGuarnicionM), Materiales.Liso(Concreto * 0.92f, 0.15f));
            }

            var metal = Materiales.Liso(new Color(0.62f, 0.64f, 0.66f), 0.55f, 0.8f);
            foreach (var b in v.Barreras)
            {
                for (var i = 0; i + 1 < b.Length; i++)
                {
                    Viga(via, "barrera", b[i], b[i + 1], 0.55f, 0.31f, 0.06f, metal);
                }

                var resto = 0.0;
                for (var i = 0; i + 1 < b.Length; i++)
                {
                    var largo = Math.Sqrt(Math.Pow(b[i + 1].X - b[i].X, 2) + Math.Pow(b[i + 1].Y - b[i].Y, 2));
                    for (var s = resto; s < largo; s += 4.0)
                    {
                        var f = s / largo;
                        var p = U(b[i].X + (b[i + 1].X - b[i].X) * f, b[i].Y + (b[i + 1].Y - b[i].Y) * f, 0.375);
                        Objeto(via, "poste_barrera", cubo, metal, p, Quaternion.identity, new Vector3(0.08f, 0.75f, 0.08f));
                    }

                    resto = (resto + Math.Ceiling(largo / 4.0) * 4.0) - largo;
                }
            }
        }

        private static (Color, float) MaterialDeCapa(Nombre n, float lisuraAsfalto)
        {
            switch (n)
            {
                case Nombre.Calzada:
                    return (Asfalto, lisuraAsfalto);
                case Nombre.Acotamiento:
                    return (Asfalto * 1.25f, lisuraAsfalto * 0.8f);
                case Nombre.Banqueta:
                case Nombre.Camellon:
                    return (Concreto, 0.12f);
                case Nombre.RayasAmarillas:
                    return (Amarillo, 0.3f);
                default:
                    return (Blanco, 0.3f);
            }
        }

        /// <summary>Una malla en planta a una altura. Croquis la da antihoraria desde arriba; Unity quiere horaria.</summary>
        private static Mesh Planta(double[] posiciones, long[] indices, float altura)
        {
            var n = posiciones.Length / 2;
            var v = new Vector3[n];
            var uv = new Vector2[n];
            for (var i = 0; i < n; i++)
            {
                v[i] = new Vector3((float)posiciones[2 * i], altura, (float)posiciones[2 * i + 1]);
                uv[i] = new Vector2(v[i].x, v[i].z) * 0.25f;
            }

            var t = new int[indices.Length];
            for (var i = 0; i + 2 < indices.Length; i += 3)
            {
                t[i] = (int)indices[i];
                t[i + 1] = (int)indices[i + 2];
                t[i + 2] = (int)indices[i + 1];
            }

            var m = new Mesh { indexFormat = n > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            m.vertices = v;
            m.uv = uv;
            m.triangles = t;
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }

        /// <summary>Paredes verticales sobre segmentos en planta, visibles por los dos lados.</summary>
        private static Mesh Paredes(SegmentoPlano[] segmentos, float abajo, float arriba)
        {
            var v = new List<Vector3>();
            var t = new List<int>();
            foreach (var s in segmentos)
            {
                var b = v.Count;
                v.Add(U(s.Ax, s.Ay, abajo));
                v.Add(U(s.Bx, s.By, abajo));
                v.Add(U(s.Bx, s.By, arriba));
                v.Add(U(s.Ax, s.Ay, arriba));
                t.AddRange(new[] { b, b + 2, b + 1, b, b + 3, b + 2, b, b + 1, b + 2, b, b + 2, b + 3 });
            }

            var m = new Mesh { indexFormat = v.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            m.SetVertices(v);
            m.SetTriangles(t, 0);
            m.RecalculateNormals();
            return m;
        }

        // ---- Suelo ------------------------------------------------------------------------------------

        private static void Suelo(Transform padre, SueloEscenario s, AmbienteEscenario a)
        {
            var n = (int)s.Segmentos + 1;
            var lado = (float)s.LadoM;
            var x0 = (float)s.Centro.X - lado / 2f;
            var y0 = (float)s.Centro.Y - lado / 2f;
            // El parche fino va 3 cm abajo de la vía y el lejano 5 cm, como en el visor web.
            var bajo = s.HuecoM.HasValue ? -0.05f : -0.03f;
            var v = new Vector3[n * n];
            var uv = new Vector2[n * n];
            for (var j = 0; j < n; j++)
            {
                for (var i = 0; i < n; i++)
                {
                    var k = j * n + i;
                    v[k] = new Vector3(x0 + i * lado / (n - 1), (float)s.AlturasM[k] + bajo, y0 + j * lado / (n - 1));
                    uv[k] = new Vector2(i / (float)(n - 1), j / (float)(n - 1));
                }
            }

            var t = new List<int>();
            var hueco = s.HuecoM.HasValue ? (float)s.HuecoM.Value / 2f : -1f;
            for (var j = 0; j + 1 < n; j++)
            {
                for (var i = 0; i + 1 < n; i++)
                {
                    var cx = x0 + (i + 0.5f) * lado / (n - 1) - (float)s.Centro.X;
                    var cy = y0 + (j + 0.5f) * lado / (n - 1) - (float)s.Centro.Y;
                    if (Mathf.Abs(cx) < hueco && Mathf.Abs(cy) < hueco)
                    {
                        continue;
                    }

                    var a0 = j * n + i;
                    t.AddRange(new[] { a0, a0 + n, a0 + 1, a0 + 1, a0 + n, a0 + n + 1 });
                }
            }

            var m = new Mesh { indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            m.vertices = v;
            m.uv = uv;
            m.SetTriangles(t, 0);
            m.RecalculateNormals();
            m.RecalculateBounds();

            // Las parcelas y la orilla seca se pintan en una textura, un pixel por nodo.
            var pasto = Materiales.Hex(a.ColorSuelo, new Color(0.33f, 0.42f, 0.22f));
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color32[n * n];
            for (var k = 0; k < n * n; k++)
            {
                var tono = (float)s.Tonos[k];
                var c = new Color(pasto.r * (1f + 0.35f * tono), pasto.g * (1f + 0.12f * tono), pasto.b * (1f - 0.2f * tono));
                if (s.Seco != null && s.Seco.Length == n * n)
                {
                    c = Color.Lerp(c, Tierra, (float)s.Seco[k] * 0.8f);
                }

                px[k] = c;
            }

            tex.SetPixels32(px);
            tex.Apply(false, true);
            Pieza(padre, s.HuecoM.HasValue ? "suelo_lejano" : "suelo", m, Materiales.ConTextura(tex, a.Mojado ? 0.35f : 0.05f));
        }

        // ---- Entorno procedural -----------------------------------------------------------------------

        private static void Entorno(Transform padre, EntornoEscenario en, AmbienteEscenario a)
        {
            var entorno = new GameObject("entorno_procedural").transform;
            entorno.SetParent(padre, false);
            var tronco = Materiales.Liso(new Color(0.3f, 0.24f, 0.18f), 0.1f);
            foreach (var arbol in en.Arboles)
            {
                Arbol(entorno, arbol, tronco);
            }

            foreach (var b in en.Edificios)
            {
                Edificio(entorno, b);
            }

            var madera = Materiales.Liso(new Color(0.36f, 0.3f, 0.24f), 0.1f);
            foreach (var p in en.Postes)
            {
                Objeto(entorno, "poste", cilindro, madera, U(p.X, p.Y, p.Z + 4.5), Quaternion.identity, new Vector3(0.22f, 4.5f, 0.22f));
                var r = Quaternion.Euler(0f, 90f - (float)(p.RumboRad * Mathf.Rad2Deg), 0f);
                Objeto(entorno, "cruceta", cubo, madera, U(p.X, p.Y, p.Z + 8.4), r, new Vector3(1.6f, 0.1f, 0.1f));
            }

            var alambre = Materiales.Liso(new Color(0.4f, 0.38f, 0.35f), 0.2f);
            foreach (var c in en.Cercas)
            {
                var a0 = new PuntoPlano { X = c.Ax, Y = c.Ay };
                var b0 = new PuntoPlano { X = c.Bx, Y = c.By };
                Viga(entorno, "cerca", a0, b0, 1.0f, 0.03f, 0.03f, alambre);
                Viga(entorno, "cerca", a0, b0, 0.6f, 0.03f, 0.03f, alambre);
                var largo = Math.Sqrt(Math.Pow(c.Bx - c.Ax, 2) + Math.Pow(c.By - c.Ay, 2));
                for (var s = 0.0; s <= largo; s += 2.5)
                {
                    var f = largo > 0 ? s / largo : 0;
                    Objeto(entorno, "poste_cerca", cubo, madera, U(c.Ax + (c.Bx - c.Ax) * f, c.Ay + (c.By - c.Ay) * f, 0.6), Quaternion.identity, new Vector3(0.08f, 1.2f, 0.08f));
                }
            }

            foreach (var s in en.Senales)
            {
                Senal(entorno, s);
            }

            var lejos = Materiales.Liso(new Color(0.36f, 0.42f, 0.36f), 0.05f);
            foreach (var c in en.Cerros)
            {
                Pieza(entorno, "cerros", Cerro(c), lejos);
            }

            var urbano = Materiales.Liso(new Color(0.5f, 0.52f, 0.56f), 0.1f);
            foreach (var s in en.Silueta)
            {
                const float Radio = 420f;
                var ancho = 2f * Radio * Mathf.Sin((float)s.AberturaRad / 2f);
                var p = new Vector3(Mathf.Cos((float)s.AnguloRad) * Radio, (float)s.AltoM / 2f, Mathf.Sin((float)s.AnguloRad) * Radio);
                var r = Quaternion.Euler(0f, 90f - (float)(s.AnguloRad * Mathf.Rad2Deg), 0f);
                Objeto(entorno, "silueta", cubo, urbano, p, r, new Vector3(ancho, (float)s.AltoM, 20f));
            }
        }

        private static void Arbol(Transform padre, ArbolEscenario t, Material tronco)
        {
            var copa = Materiales.Liso(ColorDeCopa(t.Especie), 0.05f);
            var p = U(t.X, t.Y, t.Z);
            var giro = Quaternion.Euler(0f, (float)(t.RumboRad * Mathf.Rad2Deg), 0f);
            var r = (float)t.CopaM;
            var h = (float)t.TroncoM;
            switch (t.Tipo)
            {
                case 2: // arbusto
                    Objeto(padre, "arbusto", esfera, copa, p + Vector3.up * r * 0.6f, giro, new Vector3(2f * r, 1.3f * r, 2f * r));
                    break;
                case 1: // alargado: ciprés o eucalipto
                    Objeto(padre, "tronco", cilindro, tronco, p + Vector3.up * h / 2f, giro, new Vector3(0.25f, h / 2f, 0.25f));
                    Objeto(padre, "copa", capsula, copa, p + Vector3.up * (h + 1.4f * r), giro, new Vector3(1.6f * r, 1.6f * r, 1.6f * r));
                    break;
                default:
                    if (t.Especie == Especie.Palmera)
                    {
                        var alto = t.AlturaM.HasValue ? (float)t.AlturaM.Value : h + 2f * r;
                        Objeto(padre, "tronco", cilindro, tronco, p + Vector3.up * alto / 2f, giro, new Vector3(0.35f, alto / 2f, 0.35f));
                        Objeto(padre, "copa", esfera, copa, p + Vector3.up * alto, giro, new Vector3(2.2f * r, 0.7f * r, 2.2f * r));
                        break;
                    }

                    Objeto(padre, "tronco", cilindro, tronco, p + Vector3.up * h / 2f, giro, new Vector3(0.3f, h / 2f, 0.3f));
                    Objeto(padre, "copa", esfera, copa, p + Vector3.up * (h + 0.75f * r), giro, new Vector3(2f * r, 1.7f * r, 2f * r));
                    break;
            }
        }

        private static Color ColorDeCopa(Especie? e)
        {
            switch (e)
            {
                case Especie.Jacaranda:
                    return new Color(0.42f, 0.36f, 0.58f);
                case Especie.Pirul:
                    return new Color(0.33f, 0.42f, 0.24f);
                case Especie.Palmera:
                    return new Color(0.3f, 0.44f, 0.22f);
                default:
                    return new Color(0.24f, 0.38f, 0.2f);
            }
        }

        private static void Edificio(Transform padre, EdificioEscenario b)
        {
            var color = Materiales.Hex(b.Color, new Color(0.85f, 0.82f, 0.76f));
            if (b.Material == EdificioMaterial.Tabique)
            {
                color = new Color(0.62f, 0.38f, 0.28f);
            }

            var giro = Quaternion.Euler(0f, 90f - (float)(b.RumboRad * Mathf.Rad2Deg), 0f);
            var alto = (float)b.AltoM;
            var p = U(b.X, b.Y, b.Z);
            var cuerpo = Objeto(padre, "edificio", cubo, Materiales.Liso(color, 0.08f), p + Vector3.up * alto / 2f, giro, new Vector3((float)b.FondoM, alto, (float)b.LargoM));
            // Ventanas: una franja oscura por piso hacia la calle, para que no sea un bloque liso.
            var vidrio = Materiales.Liso(new Color(0.12f, 0.14f, 0.17f), 0.7f);
            var frente = new Vector3(Mathf.Cos((float)b.FrenteRad), 0f, Mathf.Sin((float)b.FrenteRad));
            var pisos = Math.Max(1, (int)b.Pisos);
            for (var i = 0; i < pisos; i++)
            {
                var y = alto * (i + 0.6f) / pisos;
                var centro = p + Vector3.up * y + frente * ((float)Math.Max(b.FondoM, b.LargoM) * 0.5f + 0.02f);
                var orient = Quaternion.LookRotation(frente);
                Objeto(cuerpo.parent, "ventanas", cubo, vidrio, centro, orient, new Vector3((float)Math.Min(b.FondoM, b.LargoM) * 0.7f, alto / pisos * 0.35f, 0.04f));
            }

            var negro = Materiales.Liso(new Color(0.08f, 0.08f, 0.08f), 0.2f);
            for (var i = 0; i < b.Tinacos; i++)
            {
                var o = new Vector3((i - (b.Tinacos - 1) / 2f) * 1.4f, alto + 0.6f, 0f);
                Objeto(padre, "tinaco", cilindro, negro, p + giro * o, Quaternion.identity, new Vector3(1.1f, 0.6f, 1.1f));
            }
        }

        private static void Senal(Transform padre, SenalEscenario s)
        {
            var p = U(s.X, s.Y, s.Z);
            var gris = Materiales.Liso(new Color(0.55f, 0.56f, 0.58f), 0.4f, 0.6f);
            Objeto(padre, "poste_senal", cilindro, gris, p + Vector3.up * 1.2f, Quaternion.identity, new Vector3(0.07f, 1.2f, 0.07f));
            Color c;
            switch (s.Tipo)
            {
                case SenaleTipo.Alto:
                    c = new Color(0.7f, 0.1f, 0.1f);
                    break;
                case SenaleTipo.Ceda:
                    c = new Color(0.85f, 0.85f, 0.82f);
                    break;
                case SenaleTipo.Informativa:
                    c = new Color(0.1f, 0.4f, 0.22f);
                    break;
                default:
                    c = new Color(0.9f, 0.9f, 0.88f);
                    break;
            }

            var giro = Quaternion.Euler(0f, 90f - (float)(s.RumboRad * Mathf.Rad2Deg), 0f);
            var tam = s.Tipo == SenaleTipo.Informativa ? new Vector3(0.05f, 0.6f, 1.2f) : new Vector3(0.05f, 0.7f, 0.7f);
            Objeto(padre, "placa_" + s.Tipo, cubo, Materiales.Liso(c, 0.4f), p + Vector3.up * 2.4f, giro, tam);
        }

        private static Mesh Cerro(CerroEscenario c)
        {
            var n = c.AlturasM.Length;
            var v = new List<Vector3>();
            var t = new List<int>();
            var r = (float)c.RadioM;
            for (var i = 0; i < n; i++)
            {
                var ang = (float)(c.DesdeRad + (c.HastaRad - c.DesdeRad) * i / Math.Max(1, n - 1));
                var x = Mathf.Cos(ang) * r;
                var z = Mathf.Sin(ang) * r;
                v.Add(new Vector3(x, -4f, z));
                v.Add(new Vector3(x, (float)c.AlturasM[i], z));
                if (i > 0)
                {
                    var b = 2 * (i - 1);
                    t.AddRange(new[] { b, b + 1, b + 2, b + 1, b + 3, b + 2, b, b + 2, b + 1, b + 1, b + 2, b + 3 });
                }
            }

            var m = new Mesh();
            m.SetVertices(v);
            m.SetTriangles(t, 0);
            m.RecalculateNormals();
            return m;
        }

        // ---- Luminarias -------------------------------------------------------------------------------

        private const int LuminariasEncendidasMax = 8;

        private static void Luminarias(Transform padre, LuminariaEscenario[] lista, AmbienteEscenario a)
        {
            var gris = Materiales.Liso(new Color(0.5f, 0.52f, 0.54f), 0.4f, 0.7f);
            var foco = a.Noche && a.Luminarias
                ? Materiales.Emisivo(new Color(1f, 0.92f, 0.75f), new Color(4f, 3.4f, 2.2f))
                : Materiales.Liso(new Color(0.8f, 0.8f, 0.78f), 0.6f);
            var encendidas = 0;
            foreach (var l in lista)
            {
                var p = U(l.X, l.Y, l.Z);
                var alto = (float)l.AlturaM;
                Objeto(padre, "luminaria", cilindro, gris, p + Vector3.up * alto / 2f, Quaternion.identity, new Vector3(0.16f, alto / 2f, 0.16f));
                var dir = new Vector3(Mathf.Cos((float)l.RumboDeg * Mathf.Deg2Rad), 0f, Mathf.Sin((float)l.RumboDeg * Mathf.Deg2Rad));
                var cabeza = p + Vector3.up * alto + dir * 1.8f;
                Objeto(padre, "brazo", cubo, gris, p + Vector3.up * alto + dir * 0.9f, Quaternion.LookRotation(dir), new Vector3(0.08f, 0.08f, 1.8f));
                Objeto(padre, "foco", cubo, foco, cabeza - Vector3.up * 0.08f, Quaternion.LookRotation(dir), new Vector3(0.3f, 0.12f, 0.6f));
                if (a.Noche && a.Luminarias && encendidas < LuminariasEncendidasMax)
                {
                    var luz = new GameObject("luz_luminaria").AddComponent<Light>();
                    luz.transform.SetParent(padre, false);
                    luz.type = LightType.Spot;
                    luz.transform.SetPositionAndRotation(cabeza - Vector3.up * 0.2f, Quaternion.LookRotation(Vector3.down));
                    luz.spotAngle = 120f;
                    luz.range = alto * 3.2f;
                    luz.intensity = 6f;
                    luz.color = new Color(1f, 0.85f, 0.62f);
                    luz.shadows = LightShadows.None;
                    encendidas++;
                }
            }
        }

        // ---- Lluvia -----------------------------------------------------------------------------------

        private static void Lluvia(Transform padre, PuntoPlano centro, int gotas)
        {
            var go = new GameObject("lluvia");
            go.transform.SetParent(padre, false);
            go.transform.position = U(centro.X, centro.Y, 25);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = true;
            main.startLifetime = 1.6f;
            main.startSpeed = 18f;
            main.startSize3D = true;
            main.startSizeX = 0.02f;
            main.startSizeY = 0.6f;
            main.startSizeZ = 0.02f;
            main.maxParticles = gotas;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startColor = new Color(0.75f, 0.8f, 0.88f, 0.45f);
            var em = ps.emission;
            em.rateOverTime = gotas / 1.6f;
            var forma = ps.shape;
            forma.shapeType = ParticleSystemShapeType.Box;
            forma.scale = new Vector3(70f, 1f, 70f);
            forma.rotation = new Vector3(90f, 0f, 0f);
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.lengthScale = 1f;
            r.velocityScale = 0.04f;
            var mat = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit"));
            mat.SetColor("_BaseColor", new Color(0.8f, 0.85f, 0.92f, 0.35f));
            mat.SetFloat("_Surface", 1f);
            mat.SetFloat("_Blend", 0f);
            mat.renderQueue = 3000;
            mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            r.sharedMaterial = mat;
            ps.Play();
        }

        // ---- Leyenda ----------------------------------------------------------------------------------

        /// <summary>La leyenda de cada vista (IA responsable, §10): ilustrativa, y el entorno es procedural.</summary>
        private static void Leyenda(Transform padre)
        {
            var go = new GameObject("leyenda");
            go.transform.SetParent(padre, false);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            var escala = go.AddComponent<CanvasScaler>();
            escala.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            escala.referenceResolution = new Vector2(1280, 720);
            var texto = new GameObject("texto").AddComponent<Text>();
            texto.transform.SetParent(go.transform, false);
            texto.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            texto.fontSize = 14;
            texto.color = new Color(1f, 1f, 1f, 0.85f);
            texto.alignment = TextAnchor.LowerLeft;
            texto.text = "Reconstrucción ilustrativa · entorno procedural: no es el lugar real";
            var rt = texto.rectTransform;
            rt.anchorMin = new Vector2(0f, 0f);
            rt.anchorMax = new Vector2(1f, 0f);
            rt.pivot = new Vector2(0f, 0f);
            rt.anchoredPosition = new Vector2(16f, 12f);
            rt.sizeDelta = new Vector2(-32f, 24f);
            var sombra = texto.gameObject.AddComponent<Shadow>();
            sombra.effectColor = new Color(0f, 0f, 0f, 0.6f);
        }

        // ---- Utilidades -------------------------------------------------------------------------------

        private static Transform Objeto(Transform padre, string nombre, Mesh malla, Material mat, Vector3 pos, Quaternion rot, Vector3 escala)
        {
            var go = new GameObject(nombre);
            go.transform.SetParent(padre, false);
            go.transform.SetPositionAndRotation(pos, rot);
            go.transform.localScale = escala;
            go.AddComponent<MeshFilter>().sharedMesh = malla;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        /// <summary>Una viga recta entre dos puntos en planta, a una altura y con su sección.</summary>
        private static void Viga(Transform padre, string nombre, PuntoPlano a, PuntoPlano b, float altura, float alto, float grueso, Material mat)
        {
            var pa = U(a.X, a.Y, altura);
            var pb = U(b.X, b.Y, altura);
            var d = pb - pa;
            if (d.sqrMagnitude < 1e-6f)
            {
                return;
            }

            Objeto(padre, nombre, cubo, mat, (pa + pb) / 2f, Quaternion.LookRotation(d), new Vector3(grueso, alto, d.magnitude));
        }

        private static void Pieza(Transform padre, string nombre, Mesh malla, Material mat)
        {
            var go = new GameObject(nombre);
            go.transform.SetParent(padre, false);
            go.AddComponent<MeshFilter>().sharedMesh = malla;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
        }
    }
}
