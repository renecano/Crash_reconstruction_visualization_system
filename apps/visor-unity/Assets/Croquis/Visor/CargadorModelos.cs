using System;
using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using GLTFast;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Croquis.Visor
{
    /// <summary>Un modelo no se pudo bajar o abrir: la web abre el visor ligero.</summary>
    public sealed class ModeloNoCargo : Exception
    {
        public ModeloNoCargo(string mensaje) : base(mensaje)
        {
        }
    }

    /// <summary>
    /// Baja de Vercel Blob los mismos glTF CC-BY del visor web, uno por clase, y arma con ellos cada
    /// vehículo del caso. Un modelo se baja una sola vez aunque el caso traiga dos de esa clase.
    /// </summary>
    public sealed class CargadorModelos
    {
        /// <summary>La clase que dibuja cada modelo; bicicleta y scooter no tienen.</summary>
        private static readonly Dictionary<string, string> ModeloDeClase = new Dictionary<string, string>
        {
            { "sedan_compacto", "sedan" },
            { "sedan_mediano", "sedan" },
            { "hatchback", "hatchback" },
            { "suv_compacta", "suv" },
            { "suv_grande", "suv" },
            { "pickup", "pickup" },
            { "camion_unitario", "camion" },
            { "motocicleta", "moto" },
            { "van", "van" },
            { "microbus_combi", "combi" },
            { "autobus", "autobus" },
            { "tractocamion", "tracto" },
        };

        private readonly Dictionary<string, GltfImport> plantillas = new Dictionary<string, GltfImport>();
        private JObject manifiesto;
        private string baseUrl;

        /// <summary>El papel de cada pieza de un modelo (pintura, faro, calavera…), por su nombre.</summary>
        private readonly Dictionary<string, Dictionary<string, string>> papeles =
            new Dictionary<string, Dictionary<string, string>>();

        /// <summary>
        /// Los modelos marcan cada pieza con su papel en `extras.role`, y glTFast no lo importa: se lee
        /// del encabezado JSON del .glb.
        /// </summary>
        private static Dictionary<string, string> PapelesDe(byte[] glb)
        {
            var papeles = new Dictionary<string, string>();
            var largo = BitConverter.ToInt32(glb, 12);
            var json = JObject.Parse(System.Text.Encoding.UTF8.GetString(glb, 20, largo));
            foreach (var n in (JArray)json["nodes"])
            {
                var nombre = (string)n["name"];
                var papel = (string)n["extras"]?["role"];
                if (nombre != null && papel != null)
                {
                    papeles[nombre] = papel;
                }
            }

            return papeles;
        }

        public async Awaitable<PartesVehiculo> ArmarAsync(Transform destino, ResultadoVehiculo v, Color? color)
        {
            var d = v.Dimensiones;
            var medidas = new MedidasVehiculo(d.LargoM, d.AnchoM, d.AltoM, d.DistanciaEntreEjesM);
            if (!ModeloDeClase.TryGetValue(v.Clase, out var modelo))
            {
                ArmadorVehiculo.Procedural(destino, medidas);
                return null;
            }

            await LeerManifiestoAsync();
            var entrada = manifiesto["clases"]?[modelo] as JObject;
            if (entrada == null)
            {
                throw new ModeloNoCargo("El manifiesto no trae el modelo «" + modelo + "».");
            }

            if (!plantillas.TryGetValue(modelo, out var gltf))
            {
                gltf = new GltfImport();
                var url = baseUrl + (string)entrada["archivos"]["alta"]["archivo"];
                using var pedido = UnityWebRequest.Get(url);
                await pedido.SendWebRequest();
                if (pedido.result != UnityWebRequest.Result.Success)
                {
                    throw new ModeloNoCargo("No se pudo bajar " + url + ": " + pedido.error);
                }

                var bytes = pedido.downloadHandler.data;
                papeles[modelo] = PapelesDe(bytes);
                if (!await gltf.Load(bytes, new Uri(url)))
                {
                    throw new ModeloNoCargo("No se pudo abrir " + url);
                }

                plantillas[modelo] = gltf;
            }

            var plantilla = new GameObject("plantilla");
            plantilla.SetActive(false);
            try
            {
                if (!await gltf.InstantiateMainSceneAsync(plantilla.transform))
                {
                    throw new ModeloNoCargo("No se pudo instanciar el modelo «" + modelo + "».");
                }

                return ArmadorVehiculo.Armar(destino, plantilla.transform, entrada, v.Clase, medidas, papeles[modelo], color);
            }
            finally
            {
                UnityEngine.Object.Destroy(plantilla);
            }
        }

        private async Awaitable LeerManifiestoAsync()
        {
            if (manifiesto != null)
            {
                return;
            }

            var recursos = Resources.Load<TextAsset>("recursos_visor");
            if (recursos == null)
            {
                throw new ModeloNoCargo("El build no trae recursos_visor.json.");
            }

            baseUrl = (string)JObject.Parse(recursos.text)["vehiculos"];
            using var pedido = UnityWebRequest.Get(baseUrl + "vehiculos.json");
            await pedido.SendWebRequest();
            if (pedido.result != UnityWebRequest.Result.Success)
            {
                throw new ModeloNoCargo("No se pudo bajar el manifiesto de modelos: " + pedido.error);
            }

            manifiesto = JObject.Parse(pedido.downloadHandler.text);
        }
    }
}
