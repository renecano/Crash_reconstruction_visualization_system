using System;
using System.Collections.Generic;
using Croquis.Generated;
using UnityEngine;
using Material = UnityEngine.Material;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.UI;

namespace Croquis.Visor
{
    /// <summary>
    /// Dibuja el escenario que calculó TS (ADR 0112): el cielo y la luz, la vía, el suelo, el entorno
    /// procedural, las luminarias y la lluvia. No calcula geometría del caso: la convierte a mallas de
    /// Unity sobre la función de altura del piso (`Terreno`). El marco es el de siempre: (x, z, y).
    /// </summary>
    public static class EscenarioVista
    {
        private const int LuminariasEncendidasMax = 6;

        /// <summary>
        /// El radio, desde el centro de la acción, donde no se dibuja desgaste procedural (grietas,
        /// parches, manchas): es un visor forense, y una mancha inventada junto al hecho se podría
        /// confundir con una evidencia. Lo fija `VisorCaso` con la zona de interés del caso.
        /// </summary>
        public static float ClaroDelHecho { get; set; } = 14f;

        /// <summary>El centro de la acción, en planta (x, y).</summary>
        public static Vector2 CentroDelHecho { get; set; }

        public static void Construir(Transform raiz, Escenario e, Light sol, Camera camara, Terreno terreno)
        {
            var escenario = new GameObject("escenario").transform;
            escenario.SetParent(raiz, false);
            Ambiente(e.Ambiente, sol, camara);
            var urbana = e.Entorno.Zona == ZonaEntorno.Urbana;
            var centro = new Vector2((float)e.Centro.X, (float)e.Centro.Y);
            Via(escenario, e.Via, e.Ambiente, terreno, e.Semilla, urbana, centro);
            foreach (var s in e.Suelo)
            {
                Suelo(escenario, s, e.Ambiente, urbana, e.Semilla);
            }

            EntornoVista.Construir(escenario, e.Entorno, e.Ambiente, e.Semilla);
            Luminarias(escenario, e.Luminarias, e.Ambiente, new Vector2((float)e.Centro.X, (float)e.Centro.Y));
            var p = e.Ambiente.Precipitacion;
            if (p.StartsWith("lluvia", StringComparison.Ordinal) || p == "granizo")
            {
                Lluvia(escenario, e.Centro, p == "lluvia_ligera" ? 2500 : 6000, camara);
            }

            Sonda(escenario, e);

            Leyenda(escenario);
        }

        // ---- Cielo, luz y aire ------------------------------------------------------------------------

        private static void Ambiente(AmbienteEscenario a, Light sol, Camera camara)
        {
            var d = a.DireccionLuz;
            var haciaLaLuz = new Vector3((float)d[0], (float)d[2], (float)d[1]).normalized;
            sol.transform.rotation = Quaternion.LookRotation(-haciaLaLuz);
            var lluvia = a.Precipitacion != "ninguna";
            var bajo = !a.Noche && a.SolElevacionDeg < 12.0;
            // Las intensidades del visor web son de three.js; en URP una direccional de 1 ya es sol
            // pleno. Se conserva su proporción entre día, crepúsculo, nublado y noche.
            // De noche la direccional es la luna: tenue y azul, pero suficiente para que la vía y los
            // vehículos se distingan lejos de las luminarias (es un visor forense, no una postal).
            sol.intensity = a.Noche ? (lluvia ? 0.16f : 0.3f) : (float)a.IntensidadSol * 0.56f;
            sol.color = a.Noche
                ? new Color(0.62f, 0.72f, 1f)
                : Color.Lerp(new Color(1f, 0.74f, 0.52f), new Color(1f, 0.96f, 0.9f), Mathf.Clamp01((float)a.SolElevacionDeg / 28f));
            sol.shadows = LightShadows.Soft;
            sol.shadowStrength = lluvia ? 0.55f : a.Noche ? 0.7f : 0.92f;

            // El cielo es un HDRI CC0, girado para que su sol caiga donde va el del hecho.
            var nombre = a.Noche ? "noche" : lluvia || a.Turbidez > 6.0 ? "nublado" : bajo ? "crepusculo" : "dia";
            var cielo = Materiales.Cielo(nombre, out var azimutHdri);
            // En el HDRI el azimut se mide desde su centro; en la escena, desde el norte hacia el este.
            cielo.SetFloat("_Rotation", Mathf.Repeat(azimutHdri - (float)a.SolAzimutDeg, 360f));
            cielo.SetFloat("_Exposure", a.Noche ? 0.75f : lluvia ? 0.8f : 1f);
            RenderSettings.skybox = cielo;
            RenderSettings.sun = sol;
            if (a.Noche)
            {
                // El HDRI nocturno casi no alumbra: el ambiente es el resplandor del cielo sobre una
                // ciudad, más claro arriba y con nubes (lluvia) todavía más.
                var k = lluvia ? 1.35f : 1f;
                // Como sonda explícita: al cambiar el modo en ejecución, los modos de color no
                // actualizaban la sonda y las caras sin luz directa salían negras.
                var sh = new SphericalHarmonicsL2();
                sh.AddAmbientLight(new Color(0.07f, 0.078f, 0.1f) * k);
                sh.AddDirectionalLight(Vector3.up, new Color(0.2f, 0.25f, 0.38f) * k, 1f);
                RenderSettings.ambientMode = AmbientMode.Custom;
                RenderSettings.ambientProbe = sh;
            }
            else
            {
                RenderSettings.ambientMode = AmbientMode.Skybox;
                // Un poco más de cielo en las sombras: una fachada a contraluz se tiene que leer.
                RenderSettings.ambientIntensity = (float)a.IntensidadAmbiente * 1.3f;
            }

            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Skybox;
            RenderSettings.reflectionIntensity = a.Noche ? 0.85f : 1f;
            Gradacion(a, lluvia, bajo);
            camara.clearFlags = CameraClearFlags.Skybox;
            camara.farClipPlane = 3000f;

            var horizonte = Materiales.Hex(a.ColorCielo, new Color(0.6f, 0.75f, 0.9f));
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            // Aun sin niebla declarada hay aire: lo lejano se funde con el horizonte.
            // De noche la niebla tiene tope: con lluvia, la acera de enfrente se perdía en negro.
            // De día también: con lluvia, la vista cenital quedaba en blanco y no se leía el hecho.
            RenderSettings.fogDensity = Mathf.Clamp((float)a.DensidadNiebla, 0.00055f, a.Noche ? 0.004f : 0.006f);
            RenderSettings.fogColor = a.Noche
                ? (lluvia ? new Color(0.085f, 0.09f, 0.11f) : new Color(0.04f, 0.05f, 0.075f))
                : Color.Lerp(horizonte, Color.white, lluvia ? 0.2f : 0.12f);
            DynamicGI.UpdateEnvironment();
        }

        /// <summary>
        /// La exposición y el color de cada ambiente, sobre el perfil base (tono ACES, resplandor y
        /// viñeta). Se cambia la copia del volumen, no el asset.
        /// </summary>
        private static void Gradacion(AmbienteEscenario a, bool lluvia, bool bajo)
        {
            var volumen = UnityEngine.Object.FindFirstObjectByType<Volume>();
            if (volumen == null || !volumen.profile.TryGet<ColorAdjustments>(out var color))
            {
                return;
            }

            float exposicion, contraste, saturacion;
            Color filtro;
            if (a.Noche)
            {
                exposicion = lluvia ? 0.95f : 0.75f;
                contraste = 10f;
                saturacion = -4f;
                filtro = new Color(0.94f, 0.97f, 1f);
            }
            else if (lluvia || a.Turbidez > 6.0)
            {
                exposicion = 0.35f;
                contraste = 14f;
                saturacion = -8f;
                filtro = new Color(0.96f, 0.98f, 1f);
            }
            else if (bajo)
            {
                exposicion = 0.3f;
                contraste = 16f;
                saturacion = 8f;
                filtro = new Color(1f, 0.96f, 0.9f);
            }
            else
            {
                exposicion = 0.2f;
                contraste = 13f;
                saturacion = 10f;
                filtro = new Color(1f, 0.985f, 0.96f);
            }

            color.postExposure.Override(exposicion);
            color.contrast.Override(contraste);
            color.saturation.Override(saturacion);
            color.colorFilter.Override(filtro);
        }

        /// <summary>
        /// La sonda de reflejos de la escena: una vez armado el escenario se toma un cubo desde el
        /// centro de la acción, y la pintura, los vidrios y el asfalto mojado reflejan las fachadas, los
        /// árboles y las luminarias en vez de solo el cielo. Los vehículos no entran en ella (capa 1):
        /// se mueven, y la sonda se toma una sola vez.
        /// </summary>
        private static void Sonda(Transform padre, Escenario e)
        {
            var go = new GameObject("sonda_reflejos");
            go.transform.SetParent(padre, false);
            go.transform.position = new Vector3((float)e.Centro.X, 1.6f, (float)e.Centro.Y);
            var sonda = go.AddComponent<ReflectionProbe>();
            sonda.mode = ReflectionProbeMode.Realtime;
            sonda.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
            sonda.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
            sonda.resolution = 128;
            // En WebGL una sonda en tiempo real con HDR devuelve pixeles sin número: todo lo que la usa
            // salía negro, y con resplandor, blanco (medido el 2026-11-09 con builds de diagnóstico;
            // ADR 0113). Ahí va sin HDR.
            sonda.hdr = Application.platform != RuntimePlatform.WebGLPlayer;
            sonda.boxProjection = true;
            sonda.size = new Vector3(90f, 40f, 90f);
            sonda.center = new Vector3(0f, 18.4f, 0f);
            sonda.blendDistance = 8f;
            sonda.nearClipPlane = 0.3f;
            sonda.farClipPlane = 600f;
            sonda.cullingMask = ~(1 << CapaVehiculos);
            sonda.shadowDistance = 60f;
            sonda.RenderProbe();
        }

        /// <summary>La capa de los vehículos: fuera de la sonda de reflejos.</summary>
        public const int CapaVehiculos = 1;

        // ---- Vía --------------------------------------------------------------------------------------

        private static void Via(Transform padre, ViaEscenario v, AmbienteEscenario a, Terreno terreno, long semilla, bool urbana, Vector2 centroAccion)
        {
            var via = new GameObject("via").transform;
            via.SetParent(padre, false);
            var sufijo = a.Mojado ? "_mojado" : "";
            foreach (var c in v.Capas)
            {
                var m = new Malla();
                Material mat;
                var sombra = false;
                switch (c.Nombre)
                {
                    case NombreCapa.Calzada:
                        mat = Materiales.Pbr("asfalto" + sufijo);
                        m.Planta(c.Posiciones, c.Indices, (float)c.AlturaM, terreno, Materiales.Mosaico("asfalto"));
                        break;
                    case NombreCapa.Acotamiento:
                        mat = Materiales.Pbr("asfalto" + sufijo, new Color(1.5f, 1.45f, 1.38f));
                        m.Planta(c.Posiciones, c.Indices, (float)c.AlturaM, terreno, Materiales.Mosaico("asfalto") * 0.7f);
                        break;
                    case NombreCapa.Banqueta:
                    case NombreCapa.Camellon:
                        mat = Materiales.Pbr("concreto" + sufijo);
                        m.Planta(c.Posiciones, c.Indices, (float)c.AlturaM, terreno, Materiales.Mosaico("concreto"));
                        sombra = true;
                        break;
                    case NombreCapa.RayasAmarillas:
                        mat = Materiales.RayaGastada(new Color(0.83f, 0.62f, 0.1f, 0.92f));
                        m.Planta(c.Posiciones, c.Indices, (float)c.AlturaM, terreno, 1f);
                        break;
                    default:
                        mat = Materiales.RayaGastada(new Color(0.86f, 0.86f, 0.82f, 0.92f));
                        m.Planta(c.Posiciones, c.Indices, (float)c.AlturaM, terreno, 1f);
                        break;
                }

                m.Poner(via, c.Nombre.ToString().ToLowerInvariant(), mat, sombra);
            }

            if (v.Guarniciones.Length > 0)
            {
                var g = new Malla();
                var pintada = new Malla();
                var alto = (float)v.AlturaGuarnicionM;
                foreach (var s in v.Guarniciones)
                {
                    var p0 = terreno.P(s.Ax, s.Ay);
                    var p1 = terreno.P(s.Bx, s.By);
                    // En la ciudad, la guarnición de las esquinas va pintada de amarillo. Las esquinas
                    // son los tramos cortos: los arcos de la vuelta.
                    var m = urbana && (p1 - p0).magnitude < 1.6f ? pintada : g;
                    m.Cuadro(p0, p1, p1 + Vector3.up * alto, p0 + Vector3.up * alto, 0.5f, true);
                }

                pintada.Poner(via, "guarniciones_pintadas", Materiales.Liso(new Color(0.78f, 0.6f, 0.1f), 0.2f));

                // Lisa: con su mapa de normales, una cara tan angosta centelleaba de noche.
                g.Poner(via, "guarniciones", Materiales.Liso(new Color(0.42f, 0.41f, 0.39f), 0.15f));
            }

            if (v.Barreras.Length > 0)
            {
                Barreras(via, v.Barreras, terreno);
            }

            if (a.Superficie == "encharcado" || a.Precipitacion == "lluvia_fuerte")
            {
                Charcos(via, v, terreno, semilla);
            }

            Desgaste(via, v, terreno, semilla, centroAccion);
        }

        /// <summary>
        /// El desgaste de la calzada: rodadas por carril, grietas, parches de bacheo y manchas de aceite,
        /// repartidos con la semilla de la escena. Son calcas pegadas al piso (en WebGL no hay
        /// proyectores de calcas), y ninguna cae dentro del claro del hecho.
        /// </summary>
        private static void Desgaste(Transform via, ViaEscenario v, Terreno terreno, long semilla, Vector2 centro)
        {
            var rodadas = new Malla();
            foreach (var r in v.Rodadas ?? new SegmentoPlano[0])
            {
                var p0 = new Vector2((float)r.Ax, (float)r.Ay);
                var p1 = new Vector2((float)r.Bx, (float)r.By);
                var largo = (p1 - p0).magnitude;
                if (largo < 1f)
                {
                    continue;
                }

                var dir = (p1 - p0) / largo;
                var lado = new Vector2(-dir.y, dir.x) * 0.32f;
                // En tramos de 6 m, para que la rodada siga el relieve.
                for (var s = 0f; s < largo; s += 6f)
                {
                    var a0 = p0 + dir * s;
                    var a1 = p0 + dir * Mathf.Min(largo, s + 6f);
                    var i = rodadas.Vertice(terreno.P(a0.x - lado.x, a0.y - lado.y, 0.008f), new Vector2(s / 6f, 0f));
                    rodadas.Vertice(terreno.P(a1.x - lado.x, a1.y - lado.y, 0.008f), new Vector2(s / 6f + 1f, 0f));
                    rodadas.Vertice(terreno.P(a1.x + lado.x, a1.y + lado.y, 0.008f), new Vector2(s / 6f + 1f, 1f));
                    rodadas.Vertice(terreno.P(a0.x + lado.x, a0.y + lado.y, 0.008f), new Vector2(s / 6f, 1f));
                    rodadas.Triangulo(i, i + 2, i + 1);
                    rodadas.Triangulo(i, i + 3, i + 2);
                }
            }

            rodadas.Poner(via, "rodadas", Materiales.Rodada(new Color(0.015f, 0.015f, 0.018f, 0.36f)), false);

            CapaEscenario calzada = null;
            foreach (var c in v.Capas)
            {
                if (c.Nombre == NombreCapa.Calzada)
                {
                    calzada = c;
                }
            }

            if (calzada == null || calzada.Indices.Length < 3)
            {
                return;
            }

            // Triángulos de la calzada con su área, para repartir por superficie y no por triángulo.
            var n = calzada.Indices.Length / 3;
            var acumulada = new float[n];
            var total = 0f;
            Vector2 Vert(int t, int i) => new Vector2(
                (float)calzada.Posiciones[2 * (int)calzada.Indices[3 * t + i]],
                (float)calzada.Posiciones[2 * (int)calzada.Indices[3 * t + i] + 1]);
            for (var t = 0; t < n; t++)
            {
                var ab = Vert(t, 1) - Vert(t, 0);
                var ac = Vert(t, 2) - Vert(t, 0);
                total += Mathf.Abs(ab.x * ac.y - ab.y * ac.x) / 2f;
                acumulada[t] = total;
            }

            var azar = new Azar(semilla + 211);
            var grietas = new Malla();
            var parches = new Malla();
            var aceite = new Malla();
            // Una pieza cada tantos metros cuadrados, con tope: la densidad no depende del largo de la vía.
            var piezas = Mathf.Min(220, Mathf.RoundToInt(total / 55f));
            for (var k = 0; k < piezas; k++)
            {
                var objetivo = azar.Siguiente() * total;
                var t = System.Array.BinarySearch(acumulada, objetivo);
                t = Mathf.Clamp(t < 0 ? ~t : t, 0, n - 1);
                var u = azar.Siguiente();
                var w = azar.Siguiente();
                if (u + w > 1f)
                {
                    u = 1f - u;
                    w = 1f - w;
                }

                var c = Vert(t, 0) + (Vert(t, 1) - Vert(t, 0)) * u + (Vert(t, 2) - Vert(t, 0)) * w;
                var clase = azar.Siguiente();
                var giro = azar.Entre(0f, Mathf.PI * 2f);
                var medida = azar.Siguiente();
                if ((c - centro).magnitude < ClaroDelHecho)
                {
                    continue;
                }

                if (clase < 0.45f)
                {
                    Calca(grietas, terreno, c, giro, Mathf.Lerp(1.6f, 3.4f, medida), Mathf.Lerp(1.6f, 3.4f, medida), 0.011f);
                }
                else if (clase < 0.62f)
                {
                    Calca(parches, terreno, c, Mathf.Round(giro / (Mathf.PI / 2f)) * (Mathf.PI / 2f) + azar.Entre(-0.06f, 0.06f), Mathf.Lerp(1.2f, 3.2f, medida), Mathf.Lerp(0.9f, 1.8f, azar.Siguiente()), 0.009f);
                }
                else
                {
                    var r = Mathf.Lerp(0.25f, 0.7f, medida);
                    Calca(aceite, terreno, c, giro, r * 2f, r * azar.Entre(1.2f, 2f), 0.01f);
                }
            }

            grietas.Poner(via, "grietas", Materiales.Grietas(), false);
            parches.Poner(via, "parches", Materiales.Parche(), false);
            aceite.Poner(via, "manchas_de_aceite", Materiales.ManchaOscura(0.38f), false);
        }

        /// <summary>Una calca rectangular pegada al piso, girada, con su textura entera.</summary>
        public static void Calca(Malla m, Terreno terreno, Vector2 c, float giro, float largo, float ancho, float altura)
        {
            var u = new Vector2(Mathf.Cos(giro), Mathf.Sin(giro)) * (largo / 2f);
            var v = new Vector2(-Mathf.Sin(giro), Mathf.Cos(giro)) * (ancho / 2f);
            Vector3 P(Vector2 q) => terreno.P(q.x, q.y, altura);
            var i = m.Vertice(P(c - u - v), new Vector2(0f, 0f));
            m.Vertice(P(c + u - v), new Vector2(1f, 0f));
            m.Vertice(P(c + u + v), new Vector2(1f, 1f));
            m.Vertice(P(c - u + v), new Vector2(0f, 1f));
            m.Triangulo(i, i + 2, i + 1);
            m.Triangulo(i, i + 3, i + 2);
        }

        /// <summary>Barrera metálica de dos ondas sobre postes cada 4 m, como en las autopistas.</summary>
        private static void Barreras(Transform via, PuntoPlano[][] barreras, Terreno terreno)
        {
            var viga = new Malla();
            var postes = new Malla();
            foreach (var b in barreras)
            {
                var recorrido = 0f;
                var siguiente = 0f;
                for (var i = 0; i + 1 < b.Length; i++)
                {
                    var p0 = terreno.P(b[i].X, b[i].Y);
                    var p1 = terreno.P(b[i + 1].X, b[i + 1].Y);
                    var largo = (p1 - p0).magnitude;
                    if (largo < 1e-3f)
                    {
                        continue;
                    }

                    var dir = (p1 - p0) / largo;
                    var lado = Vector3.Cross(Vector3.up, dir);
                    // El perfil de dos ondas: tres franjas en zigzag hacia la vía.
                    var alturas = new[] { 0.42f, 0.5f, 0.58f, 0.66f, 0.73f };
                    var salientes = new[] { 0f, 0.06f, 0f, 0.06f, 0f };
                    for (var k = 0; k + 1 < alturas.Length; k++)
                    {
                        var a0 = p0 + Vector3.up * alturas[k] + lado * salientes[k];
                        var a1 = p1 + Vector3.up * alturas[k] + lado * salientes[k];
                        var b0 = p0 + Vector3.up * alturas[k + 1] + lado * salientes[k + 1];
                        var b1 = p1 + Vector3.up * alturas[k + 1] + lado * salientes[k + 1];
                        viga.Cuadro(a0, a1, b1, b0, 1f, true);
                    }

                    while (siguiente <= recorrido + largo)
                    {
                        var p = p0 + dir * (siguiente - recorrido) - lado * 0.06f;
                        postes.Caja(p, dir, lado, 0.1f, 0.74f, 0.12f);
                        siguiente += 4f;
                    }

                    recorrido += largo;
                }
            }

            var metal = Materiales.Liso(new Color(0.62f, 0.64f, 0.66f), 0.62f, 0.85f);
            viga.Poner(via, "barrera", metal);
            postes.Poner(via, "postes_barrera", Materiales.Liso(new Color(0.4f, 0.41f, 0.42f), 0.4f, 0.7f));
        }

        /// <summary>Charcos en la calzada: manchas de agua quieta, con semilla, donde el piso es más bajo.</summary>
        private static void Charcos(Transform via, ViaEscenario v, Terreno terreno, long semilla)
        {
            CapaEscenario calzada = null;
            foreach (var c in v.Capas)
            {
                if (c.Nombre == NombreCapa.Calzada)
                {
                    calzada = c;
                }
            }

            if (calzada == null || calzada.Indices.Length < 3)
            {
                return;
            }

            var azar = new Azar(semilla + 77);
            var m = new Malla();
            var triangulos = calzada.Indices.Length / 3;
            for (var k = 0; k < 14; k++)
            {
                var t = (int)(azar.Siguiente() * triangulos) * 3;
                Vector2 Vert(int i) => new Vector2(
                    (float)calzada.Posiciones[2 * (int)calzada.Indices[t + i]],
                    (float)calzada.Posiciones[2 * (int)calzada.Indices[t + i] + 1]);
                var u = azar.Siguiente();
                var w = azar.Siguiente();
                if (u + w > 1f)
                {
                    u = 1f - u;
                    w = 1f - w;
                }

                var c = Vert(0) + (Vert(1) - Vert(0)) * u + (Vert(2) - Vert(0)) * w;
                var rx = azar.Entre(0.5f, 1.6f);
                var ry = azar.Entre(0.3f, 0.9f);
                var giro = azar.Entre(0f, Mathf.PI);
                var centro = m.Vertice(terreno.P(c.x, c.y, 0.006f), Vector2.zero);
                const int Lados = 14;
                for (var i = 0; i <= Lados; i++)
                {
                    var ang = 2f * Mathf.PI * i / Lados;
                    // Orilla irregular, para que no sea una elipse perfecta.
                    var r = 1f + 0.18f * Mathf.Sin(3f * ang + k) + 0.1f * Mathf.Sin(5f * ang + 2f * k);
                    var ox = Mathf.Cos(ang) * rx * r;
                    var oy = Mathf.Sin(ang) * ry * r;
                    var x = c.x + ox * Mathf.Cos(giro) - oy * Mathf.Sin(giro);
                    var y = c.y + ox * Mathf.Sin(giro) + oy * Mathf.Cos(giro);
                    m.Vertice(terreno.P(x, y, 0.006f), Vector2.zero);
                    if (i > 0)
                    {
                        m.Triangulo(centro, centro + i + 1, centro + i);
                    }
                }
            }

            m.Poner(via, "charcos", Materiales.Charco, false);
        }

        // ---- Suelo ------------------------------------------------------------------------------------

        private static void Suelo(Transform padre, SueloEscenario s, AmbienteEscenario a, bool urbana, long semilla)
        {
            var n = (int)s.Segmentos + 1;
            var lado = (float)s.LadoM;
            var x0 = (float)s.Centro.X - lado / 2f;
            var y0 = (float)s.Centro.Y - lado / 2f;
            var lejano = s.HuecoM.HasValue;
            // El parche fino va 3 cm abajo de la vía y el lejano 5 cm, como en el visor web.
            var bajo = lejano ? -0.05f : -0.03f;
            // En la ciudad, entre las cuadras hay tierra apisonada, no un prado.
            var textura = urbana ? "grava" : "pasto";
            var mosaico = Materiales.Mosaico(textura) * (lejano ? 3f : 1f);
            var pasto = new Malla();
            var capa = new Malla();
            for (var j = 0; j < n; j++)
            {
                for (var i = 0; i < n; i++)
                {
                    var k = j * n + i;
                    var x = x0 + i * lado / (n - 1);
                    var y = y0 + j * lado / (n - 1);
                    var h = (float)s.AlturasM[k] + bajo;
                    pasto.Vertice(new Vector3(x, h, y), new Vector2(x, y) / mosaico);
                    capa.Vertice(new Vector3(x, h + 0.012f, y), new Vector2((i + 0.5f) / n, (j + 0.5f) / n));
                }
            }

            var hueco = lejano ? (float)s.HuecoM.Value / 2f : -1f;
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
                    pasto.Triangulo(a0, a0 + n, a0 + 1);
                    pasto.Triangulo(a0 + 1, a0 + n, a0 + n + 1);
                    capa.Triangulo(a0, a0 + n, a0 + 1);
                    capa.Triangulo(a0 + 1, a0 + n, a0 + n + 1);
                }
            }

            // La textura es de hojarasca: se lleva hacia el verde del pasto de temporada.
            var tinte = a.Noche ? new Color(0.4f, 0.52f, 0.38f) : new Color(0.66f, 0.86f, 0.5f);
            if (urbana)
            {
                tinte = a.Noche ? new Color(0.42f, 0.41f, 0.4f) : new Color(0.72f, 0.69f, 0.64f);
            }

            pasto.Poner(padre, lejano ? "suelo_lejano" : "suelo", Materiales.Pbr(textura, tinte), false);

            // Variación de tono: manchas grandes más secas, para que el suelo no sea de un solo color.
            var tonos = new Malla();
            for (var j = 0; j < n; j++)
            {
                for (var i = 0; i < n; i++)
                {
                    var x = x0 + i * lado / (n - 1);
                    var y = y0 + j * lado / (n - 1);
                    tonos.Vertice(new Vector3(x, (float)s.AlturasM[j * n + i] + bajo + 0.006f, y), new Vector2(x, y) / (lejano ? 240f : 70f));
                }
            }

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
                    tonos.Triangulo(a0, a0 + n, a0 + 1);
                    tonos.Triangulo(a0 + 1, a0 + n, a0 + n + 1);
                }
            }

            var tonoSeco = urbana ? new Color(0.3f, 0.27f, 0.23f, 0.4f) : new Color(0.5f, 0.47f, 0.24f, a.Noche ? 0.16f : 0.3f);
            tonos.Poner(padre, lejano ? "tonos_lejanos" : "tonos", Materiales.Tonos(tonoSeco), false);
            if (!lejano && !urbana)
            {
                Matas(padre, s, bajo, semilla, a.Noche);
            }

            // Las parcelas (barbecho) y la orilla seca junto a la vía: una capa de tierra cuya
            // transparencia sale de los tonos de cada nodo, suavizada entre nodos.
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear };
            var px = new Color32[n * n];
            var hayAlgo = false;
            var ocre = new Color(0.52f, 0.42f, 0.27f);
            var tierra = new Color(0.42f, 0.34f, 0.25f);
            for (var k = 0; k < n * n; k++)
            {
                var tono = (float)s.Tonos[k];
                var seco = s.Seco != null && s.Seco.Length == n * n ? (float)s.Seco[k] : 0f;
                var alfa = Mathf.Clamp01(Mathf.Max(tono * 0.38f, seco * 0.8f));
                var c = Color.Lerp(ocre, tierra, seco > tono ? 1f : 0f);
                c.a = alfa;
                px[k] = c;
                hayAlgo |= alfa > 0.02f;
            }

            if (!hayAlgo)
            {
                return;
            }

            tex.SetPixels32(px);
            tex.Apply(true, true);
            var mat = new Material(Materiales.Calca(Color.white, 0.04f)) { name = "parcelas" };
            mat.SetTexture("_BaseMap", tex);
            capa.Poner(padre, lejano ? "parcelas_lejanas" : "parcelas", mat, false);
        }

        /// <summary>
        /// Matas de pasto: tarjetas cruzadas chicas sobre el parche fino del suelo, más tupidas cerca de
        /// la vía, donde las ve la cámara. Con semilla; no van donde el suelo es orilla seca.
        /// </summary>
        private static void Matas(Transform padre, SueloEscenario s, float bajo, long semilla, bool noche)
        {
            var n = (int)s.Segmentos + 1;
            var lado = (float)s.LadoM;
            var x0 = (float)s.Centro.X - lado / 2f;
            var y0 = (float)s.Centro.Y - lado / 2f;
            var azar = new Azar(semilla + 307);
            var verdes = new Malla { NormalArriba = true };
            var secas = new Malla { NormalArriba = true };
            const int Intentos = 14000;
            for (var k = 0; k < Intentos; k++)
            {
                // Más cerca del centro que de la orilla del parche.
                var r = Mathf.Pow(azar.Siguiente(), 1.9f) * lado * 0.48f;
                var ang = azar.Entre(0f, Mathf.PI * 2f);
                var x = (float)s.Centro.X + Mathf.Cos(ang) * r;
                var y = (float)s.Centro.Y + Mathf.Sin(ang) * r;
                var alto = azar.Entre(0.14f, 0.42f);
                var giro = azar.Entre(0f, Mathf.PI);
                var esSeca = azar.Siguiente() < 0.3f;
                var fi = Mathf.Clamp((x - x0) / lado * (n - 1), 0f, n - 1.001f);
                var fj = Mathf.Clamp((y - y0) / lado * (n - 1), 0f, n - 1.001f);
                var nodo = Mathf.RoundToInt(fj) * n + Mathf.RoundToInt(fi);
                var orilla = s.Seco != null && s.Seco.Length == n * n ? (float)s.Seco[nodo] : 0f;
                // `seco` vale 1 sobre la vía y junto a ella: ahí no hay pasto.
                if (orilla > 0.55f)
                {
                    continue;
                }

                var z = (float)s.AlturasM[nodo] + bajo;
                var m = esSeca ? secas : verdes;
                for (var h = 0; h < 2; h++)
                {
                    var d = new Vector3(Mathf.Cos(giro + h * Mathf.PI / 2f), 0f, Mathf.Sin(giro + h * Mathf.PI / 2f)) * (alto * 0.75f);
                    var p = new Vector3(x, z, y);
                    m.Tarjeta(p - d, p + d, p + d + Vector3.up * alto, p - d + Vector3.up * alto);
                }
            }

            verdes.Poner(padre, "matas", Materiales.Mata(false), false);
            secas.Poner(padre, "matas_secas", Materiales.Mata(true), false);
        }

        // ---- Luminarias -------------------------------------------------------------------------------

        private static void Luminarias(Transform padre, LuminariaEscenario[] lista, AmbienteEscenario a, Vector2 centro)
        {
            if (lista.Length == 0)
            {
                return;
            }

            // Luz real solo en las más cercanas a la acción; las demás dejan su charco de luz pintado
            // en el piso, que no cuesta una luz (en WebGL hay pocas por objeto).
            var orden = new List<LuminariaEscenario>(lista);
            orden.Sort((p, q) =>
                (new Vector2((float)p.X, (float)p.Y) - centro).sqrMagnitude.CompareTo(
                    (new Vector2((float)q.X, (float)q.Y) - centro).sqrMagnitude));
            var reales = new HashSet<LuminariaEscenario>(orden.GetRange(0, Mathf.Min(LuminariasEncendidasMax, orden.Count)));
            var halos = new Malla();

            var encendidas = a.Noche && a.Luminarias;
            var postes = new Malla();
            var focos = new Malla();
            var luces = 0;
            foreach (var l in lista)
            {
                var p = new Vector3((float)l.X, (float)l.Z, (float)l.Y);
                var alto = (float)l.AlturaM;
                var ang = (float)l.RumboDeg * Mathf.Deg2Rad;
                var dir = new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang));
                var lado = Vector3.Cross(Vector3.up, dir);
                // Poste cónico con base, brazo curvo en tres tramos y cabeza tipo cobra.
                postes.Prisma(p, 0.16f, 0.5f, 10);
                postes.Prisma(p + Vector3.up * 0.5f, 0.1f, alto - 0.5f, 10, 0.06f);
                var codo = p + Vector3.up * alto;
                var tramos = new[] { 0f, 0.5f, 1.15f, 1.9f };
                var subidas = new[] { 0f, 0.28f, 0.42f, 0.42f };
                for (var k = 0; k + 1 < tramos.Length; k++)
                {
                    var q0 = codo + dir * tramos[k] + Vector3.up * subidas[k];
                    var q1 = codo + dir * tramos[k + 1] + Vector3.up * subidas[k + 1];
                    var eje = (q1 - q0).normalized;
                    postes.Caja(q0 - Vector3.up * 0.03f + eje * ((q1 - q0).magnitude / 2f), lado, eje, 0.06f, 0.06f, (q1 - q0).magnitude);
                }

                var cabeza = codo + dir * 2.2f + Vector3.up * 0.38f;
                postes.Caja(cabeza, lado, dir, 0.3f, 0.1f, 0.7f);
                focos.Caja(cabeza - Vector3.up * 0.025f, lado, dir, 0.22f, 0.03f, 0.5f);
                if (encendidas)
                {
                    // El charco de luz en el piso, bajo la cabeza. En las que llevan luz real es tenue:
                    // solo alarga su caída más allá del alcance del foco.
                    var c0 = new Vector3(cabeza.x, (float)l.Z + 0.045f, cabeza.z);
                    var radio = alto * (reales.Contains(l) ? 2.6f : 1.9f);
                    halos.Tarjeta(
                        c0 + new Vector3(-radio, 0f, -radio), c0 + new Vector3(radio, 0f, -radio),
                        c0 + new Vector3(radio, 0f, radio), c0 + new Vector3(-radio, 0f, radio));
                }

                if (encendidas && reales.Contains(l))
                {
                    var luz = new GameObject("luz_luminaria").AddComponent<Light>();
                    luz.transform.SetParent(padre, false);
                    luz.type = LightType.Spot;
                    luz.transform.SetPositionAndRotation(cabeza - Vector3.up * 0.1f, Quaternion.LookRotation(Vector3.down + dir * 0.15f));
                    // Cono muy abierto y sin núcleo: la luz cae suave desde el pie del poste, sin el
                    // círculo quemado de un cono con borde.
                    luz.spotAngle = 160f;
                    luz.innerSpotAngle = 8f;
                    luz.range = alto * 4.5f;
                    luz.intensity = 190f;
                    luz.color = new Color(1f, 0.82f, 0.56f);
                    luz.shadows = luces < 2 ? LightShadows.Soft : LightShadows.None;
                    luces++;
                }
            }

            postes.Poner(padre, "luminarias", Materiales.Liso(new Color(0.45f, 0.47f, 0.49f), 0.45f, 0.75f));
            halos.Poner(padre, "charcos_de_luz", Materiales.Halo(new Color(1f, 0.8f, 0.52f, 0.11f)), false, false);
            focos.Poner(
                padre,
                "focos",
                encendidas
                    ? Materiales.Emisivo(new Color(1f, 0.9f, 0.7f), new Color(9f, 7f, 4f))
                    : Materiales.Liso(new Color(0.85f, 0.85f, 0.82f), 0.7f),
                false);
        }

        // ---- Lluvia -----------------------------------------------------------------------------------

        private static void Lluvia(Transform padre, PuntoPlano centro, int gotas, Camera camara)
        {
            var go = new GameObject("lluvia");
            // La lluvia sigue a la cámara: siempre llueve donde se mira.
            go.transform.SetParent(padre, false);
            var sigue = go.AddComponent<SiempreVertical>();
            sigue.Altura = 14f;
            sigue.Camara = camara.transform;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = true;
            main.prewarm = true;
            main.startLifetime = 1.1f;
            main.startSpeed = 19f;
            main.startSize = new ParticleSystem.MinMaxCurve(0.003f, 0.006f);
            main.maxParticles = gotas;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = 0.4f;
            var em = ps.emission;
            em.rateOverTime = gotas / 1.1f;
            var forma = ps.shape;
            forma.shapeType = ParticleSystemShapeType.Box;
            forma.scale = new Vector3(46f, 46f, 1f);
            forma.rotation = new Vector3(90f, 0f, 0f);
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.lengthScale = 42f;
            // Una gota pegada a la cámara no debe verse como un poste.
            r.maxParticleSize = 0.04f;
            r.velocityScale = 0.01f;
            r.sharedMaterial = Materiales.Lluvia;
            r.shadowCastingMode = ShadowCastingMode.Off;
            ps.Play();
            Salpicaduras(padre, gotas, camara);
        }

        /// <summary>Las gotas al pegar en el piso: anillos chicos que se abren y se apagan.</summary>
        private static void Salpicaduras(Transform padre, int gotas, Camera camara)
        {
            var go = new GameObject("salpicaduras");
            go.transform.SetParent(padre, false);
            var sigue = go.AddComponent<SiempreVertical>();
            sigue.Altura = 0.05f;
            sigue.AlPiso = true;
            sigue.Camara = camara.transform;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = true;
            main.prewarm = true;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.18f, 0.32f);
            main.startSpeed = 0f;
            main.startSize = new ParticleSystem.MinMaxCurve(0.07f, 0.16f);
            main.maxParticles = gotas / 2;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var em = ps.emission;
            em.rateOverTime = gotas * 1.4f;
            var forma = ps.shape;
            forma.shapeType = ParticleSystemShapeType.Box;
            forma.scale = new Vector3(40f, 40f, 0.01f);
            forma.rotation = new Vector3(90f, 0f, 0f);
            var crece = ps.sizeOverLifetime;
            crece.enabled = true;
            crece.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.25f, 1f, 1f));
            var apaga = ps.colorOverLifetime;
            apaga.enabled = true;
            var g = new Gradient();
            g.SetKeys(
                new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0f, 1f) });
            apaga.color = g;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.HorizontalBillboard;
            r.sharedMaterial = Materiales.Salpicadura;
            r.shadowCastingMode = ShadowCastingMode.Off;
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
            texto.color = new Color(1f, 1f, 1f, 0.88f);
            texto.alignment = TextAnchor.LowerLeft;
            texto.text = "Reconstrucción ilustrativa · entorno procedural: no es el lugar real";
            var rt = texto.rectTransform;
            rt.anchorMin = new Vector2(0f, 0f);
            rt.anchorMax = new Vector2(1f, 0f);
            rt.pivot = new Vector2(0f, 0f);
            rt.anchoredPosition = new Vector2(16f, 12f);
            rt.sizeDelta = new Vector2(-32f, 24f);
            var sombra = texto.gameObject.AddComponent<Shadow>();
            sombra.effectColor = new Color(0f, 0f, 0f, 0.65f);
        }
    }

    /// <summary>Mantiene la lluvia sobre la cámara, cayendo derecho aunque la cámara se incline.</summary>
    public sealed class SiempreVertical : MonoBehaviour
    {
        public float Altura { get; set; }

        /// <summary>Si va a ras del piso (salpicaduras) en vez de sobre la cámara (gotas).</summary>
        public bool AlPiso { get; set; }
        public Transform Camara { get; set; }

        private void LateUpdate()
        {
            if (Camara == null)
            {
                return;
            }

            var adelante = Camara.forward;
            adelante.y = 0f;
            var p = Camara.position + adelante.normalized * 16f;
            p.y = AlPiso ? Altura : p.y + Altura;
            transform.SetPositionAndRotation(p, Quaternion.identity);
        }
    }
}
