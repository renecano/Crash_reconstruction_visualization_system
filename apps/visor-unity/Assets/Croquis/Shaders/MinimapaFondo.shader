// El fondo del minimapa (U5, ADR 0115): la escena fija vista desde arriba, horneada una vez en una
// textura. Sin luz ni niebla: la imagen ya trae las de la escena.
Shader "Croquis/MinimapaFondo"
{
    Properties
    {
        _BaseMap ("Mapa", 2D) = "black" {}
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Background" }
        Pass
        {
            Name "Fondo"
            Tags { "LightMode" = "SRPDefaultUnlit" }
            ZWrite On
            Cull Off

            HLSLPROGRAM
            #pragma vertex Vertice
            #pragma fragment Fragmento
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);

            struct Entrada
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct Interpolado
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            Interpolado Vertice(Entrada e)
            {
                Interpolado o;
                o.positionCS = TransformObjectToHClip(e.positionOS.xyz);
                o.uv = e.uv;
                return o;
            }

            half4 Fragmento(Interpolado i) : SV_Target
            {
                return SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv);
            }
            ENDHLSL
        }
    }
}
