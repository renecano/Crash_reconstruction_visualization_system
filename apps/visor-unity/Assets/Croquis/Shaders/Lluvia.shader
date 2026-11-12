// La lluvia de baja y media (U5, ADR 0115): las mismas gotas que el sistema de partículas de alta y
// ultra, pero movidas aquí, en la GPU. Las partículas se simulaban y se volvían geometría en la CPU en
// cada cuadro (unos 3.9 ms en la laptop con lluvia fuerte); esta malla es fija y cada vértice calcula
// dónde va su gota con el reloj.
//
// Mismos números que `EscenarioVista.Lluvia`: caja de 46 m que sigue a la cámara, gotas que nacen
// 14 m arriba, 19 m/s más 0.4 g, 1.1 s de vida, de 3 a 6 mm de ancho, estiradas 42 veces su ancho
// más 1 % de su velocidad, y el mismo color sin textura.
Shader "Croquis/Lluvia"
{
    Properties
    {
        _BaseColor ("Color", Color) = (0.82, 0.87, 0.94, 0.16)
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "RenderPipeline" = "UniversalPipeline" "Queue" = "Transparent" }
        Pass
        {
            Name "Gotas"
            Tags { "LightMode" = "UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off

            HLSLPROGRAM
            #pragma vertex Vertice
            #pragma fragment Fragmento
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;
            CBUFFER_END

            // El centro de la caja (x, z) y la altura a la que nacen las gotas (y): lo pone
            // `LluviaEnMalla` en cada cuadro, delante de la cámara.
            float4 _LluviaCentro;

            static const float Lado = 46.0;
            static const float Vida = 1.1;
            static const float Velocidad = 19.0;
            static const float Gravedad = 3.924;
            static const float Estirado = 42.0;
            static const float EstiradoPorVelocidad = 0.01;
            // El tope de tamaño en pantalla de las partículas (`maxParticleSize`).
            static const float TamanoMaximo = 0.04;

            struct Entrada
            {
                // La posición fija de la gota en el mundo (x, z); la caja la repite alrededor de la cámara.
                float4 positionOS : POSITION;
                // La esquina del rectángulo: x de −0.5 a 0.5 (ancho), y de 0 a 1 (de la punta a la cola).
                float2 uv : TEXCOORD0;
                // x: en qué momento de su vida va (0 a 1); y: su ancho en metros.
                float2 gota : TEXCOORD1;
            };

            struct Interpolado
            {
                float4 positionCS : SV_POSITION;
                half alfa : TEXCOORD0;
                half niebla : TEXCOORD1;
            };

            Interpolado Vertice(Entrada e)
            {
                Interpolado o;
                float2 xz = _LluviaCentro.xz + (frac((e.positionOS.xz - _LluviaCentro.xz) / Lado + 0.5) - 0.5) * Lado;
                float t = frac(_Time.y / Vida + e.gota.x) * Vida;
                float velocidad = Velocidad + Gravedad * t;
                float3 punta = float3(xz.x, _LluviaCentro.y - (Velocidad * t + 0.5 * Gravedad * t * t), xz.y);

                float3 aCamara = _WorldSpaceCameraPos - punta;
                float distancia = max(length(aCamara), 1e-3);
                float3 abajo = float3(0.0, -1.0, 0.0);
                float3 alLado = cross(abajo, aCamara / distancia);
                alLado = alLado / max(length(alLado), 1e-4);

                // Una gota pegada a la cámara no debe verse como un poste: el ancho tiene tope en
                // pantalla, como en las partículas, y a menos de un metro se desvanece.
                float ancho = min(e.gota.y, TamanoMaximo * 2.0 * distancia / abs(UNITY_MATRIX_P[1][1]));
                float largo = ancho * Estirado + velocidad * EstiradoPorVelocidad;
                float3 p = punta + alLado * (e.uv.x * ancho) - abajo * (e.uv.y * largo);

                o.positionCS = TransformWorldToHClip(p);
                o.alfa = smoothstep(0.3, 1.0, distancia);
                o.niebla = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 Fragmento(Interpolado i) : SV_Target
            {
                half3 color = MixFog(_BaseColor.rgb, i.niebla);
                return half4(color, _BaseColor.a * i.alfa);
            }
            ENDHLSL
        }
    }
}
