// Los vehículos en el minimapa de baja y media (U5, ADR 0115): todas las piezas opacas de un vehículo
// en una sola malla, con el color de cada pieza en sus vértices. En el minimapa un vehículo mide unos
// cuantos pixeles; dibujarlo pieza por pieza eran de 30 a 60 llamadas por vehículo en cada cuadro.
//
// Luz difusa del ambiente y del sol o la luna, sin brillos ni faros. Con un piso de claridad: en un
// visor forense el vehículo se tiene que distinguir en el minimapa también de noche.
Shader "Croquis/MinimapaVehiculo"
{
    Properties
    {
        _Piso ("Claridad mínima", Range(0, 1)) = 0.3
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }
        Pass
        {
            Name "Vehiculo"
            Tags { "LightMode" = "UniversalForward" }
            ZWrite On
            Cull Back

            HLSLPROGRAM
            #pragma vertex Vertice
            #pragma fragment Fragmento
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half _Piso;
            CBUFFER_END

            struct Entrada
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                half4 color : COLOR;
            };

            struct Interpolado
            {
                float4 positionCS : SV_POSITION;
                half3 normalWS : TEXCOORD0;
                half3 color : TEXCOORD1;
            };

            Interpolado Vertice(Entrada e)
            {
                Interpolado o;
                o.positionCS = TransformObjectToHClip(e.positionOS.xyz);
                o.normalWS = TransformObjectToWorldNormal(e.normalOS);
                o.color = e.color.rgb;
                return o;
            }

            half4 Fragmento(Interpolado i) : SV_Target
            {
                half3 n = normalize(i.normalWS);
                Light sol = GetMainLight();
                half3 luz = SampleSH(n) + sol.color * saturate(dot(n, sol.direction));
                return half4(i.color * max(luz, _Piso), 1.0);
            }
            ENDHLSL
        }
    }
}
