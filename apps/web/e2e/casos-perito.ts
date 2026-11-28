/** Los 10 choques narrados de la prueba como perito en producción (2026-11-27). */
export type Objetivo = { lat: number; lon: number; que: string };
export const CASOS: { clave: string; texto: string; objetivo?: Objetivo }[] = [
  {
    clave: "moto-cruce",
    objetivo: { lat: 19.29299, lon: -99.65772, que: "cruce Lerdo de Tejada y Nicolás Bravo (OSM)" },
    texto:
      "El hecho ocurrió en el cruce de la avenida Lerdo de Tejada con la calle Nicolás Bravo, en el centro de Toluca, Estado de México, aproximadamente a las 13:20 horas, con cielo despejado. El vehículo A, una motocicleta Italika FT150 modelo 2022, circulaba por Lerdo de Tejada de oriente a poniente a unos 40 km/h. El vehículo B, un Nissan Tsuru modelo 2015, circulaba por Nicolás Bravo de sur a norte y entró al cruce sin respetar el alto. La motocicleta impactó con su parte frontal el costado izquierdo del vehículo B. La motocicleta quedó tendida a 6 metros al noroeste del punto de impacto y el vehículo B se detuvo 3 metros adelante sobre Nicolás Bravo. El motociclista resultó lesionado.",
  },
  {
    clave: "peaton-camellon",
    objetivo: { lat: 19.3699, lon: -99.14158, que: "estación Portales (OSM)" },
    texto:
      "El hecho ocurrió sobre la Calzada de Tlalpan, a la altura de la estación Portales del Metro, en la alcaldía Benito Juárez, Ciudad de México, aproximadamente a las 20:15 horas. Un peatón cruzaba la calzada de poniente a oriente, fuera del paso peatonal, después de bajar del camellón central. El vehículo A, un Volkswagen Jetta modelo 2018, circulaba por el carril izquierdo de los carriles centrales con dirección de norte a sur a unos 60 km/h. El vehículo A atropelló al peatón con su parte frontal derecha. El peatón quedó a 14 metros al sur del punto de impacto y el vehículo se detuvo 22 metros adelante. Se observaron huellas de frenado de 12 metros.",
  },
  {
    clave: "alcance-periferico",
    texto:
      "El hecho ocurrió en los carriles centrales del Anillo Periférico Sur, a la altura de la salida a San Jerónimo, en la alcaldía Álvaro Obregón, Ciudad de México, debajo del segundo piso del Periférico, aproximadamente a las 08:05 horas. El vehículo A, una camioneta Toyota Hilux modelo 2020, circulaba de norte a sur a unos 70 km/h. El vehículo B, un Kia Rio modelo 2021, circulaba adelante por el mismo carril y frenó por el tránsito. El vehículo A impactó con su parte frontal la parte posterior del vehículo B. El vehículo B fue proyectado 9 metros hacia adelante y el vehículo A se detuvo 3 metros después del punto de impacto, en el mismo carril.",
  },
  {
    clave: "noche-lluvia",
    texto:
      "El hecho ocurrió sobre el boulevard Aeropuerto Miguel Alemán, a la altura de San Pedro Totoltepec, en Toluca, Estado de México, aproximadamente a las 22:40 horas, con lluvia intensa y el pavimento mojado. El vehículo A, un Chevrolet Aveo modelo 2017, circulaba de poniente a oriente a unos 80 km/h según su conductor. Al tomar una curva suave perdió el control, cruzó al carril contrario y chocó de frente con el vehículo B, un Nissan Versa modelo 2020, que circulaba de oriente a poniente a unos 50 km/h. Los dos vehículos quedaron sobre la calzada a 4 metros uno del otro.",
  },
  {
    clave: "glorieta",
    objetivo: { lat: 19.42513, lon: -99.17163, que: "Diana Cazadora (Nominatim)" },
    texto:
      "El hecho ocurrió en la glorieta de la Diana Cazadora, sobre Paseo de la Reforma, en la alcaldía Cuauhtémoc, Ciudad de México, aproximadamente a las 16:30 horas. El vehículo A, un Mazda 3 modelo 2019, circulaba dentro de la glorieta en sentido contrario a las manecillas del reloj a unos 35 km/h. El vehículo B, un Honda City modelo 2022, entró a la glorieta desde Paseo de la Reforma con dirección de oriente a poniente sin ceder el paso. El vehículo B impactó con su parte frontal el costado derecho del vehículo A. Ambos vehículos quedaron dentro de la glorieta, a unos 5 metros del punto de impacto.",
  },
  {
    clave: "rebase-carretera",
    texto:
      "El hecho ocurrió en la carretera federal 15, tramo Toluca–Zitácuaro, kilómetro 30, cerca de Villa Victoria, Estado de México, carretera de dos carriles, uno por sentido, aproximadamente a las 11:00 horas. El vehículo A, un Volkswagen Vento modelo 2016, circulaba de oriente a poniente e invadió el carril contrario para rebasar a un camión. El vehículo B, una camioneta Ford Ranger modelo 2018, circulaba de poniente a oriente a unos 90 km/h. Los vehículos chocaron de frente, con su parte frontal izquierda. El vehículo A quedó sobre el acotamiento sur y el vehículo B sobre su carril, a 7 metros del punto de impacto.",
  },
  {
    clave: "volcadura",
    texto:
      "El hecho ocurrió en la autopista Toluca–Atlacomulco, kilómetro 35, en el municipio de Jiquipilco, Estado de México, aproximadamente a las 05:50 horas, con niebla ligera. El vehículo A, una camioneta Nissan NP300 modelo 2019 con carga, circulaba de sur a norte a unos 110 km/h. El conductor se quedó dormido, el vehículo salió del camino por el lado derecho, volcó y dio dos vueltas sobre su costado. Quedó con las llantas hacia arriba a 25 metros del borde de la carretera.",
  },
  {
    clave: "barda",
    texto:
      "El hecho ocurrió en la calle Juan Aldama, en San Mateo Atenco, Estado de México, aproximadamente a las 02:30 horas. El vehículo A, un Dodge Attitude modelo 2016, circulaba de norte a sur a unos 70 km/h. Al llegar a una curva hacia la izquierda el conductor no giró, el vehículo se subió a la banqueta y se impactó con su parte frontal contra la barda de block de una casa. La barda se derrumbó en un tramo de 3 metros y el vehículo quedó detenido contra ella.",
  },
  {
    clave: "vuelta-prohibida",
    objetivo: { lat: 19.29206, lon: -99.65442, que: "cruce Independencia y Juárez (OSM)" },
    texto:
      "El hecho ocurrió en el cruce de la avenida Independencia con la avenida Juárez, frente a los Portales, en el centro de Toluca, Estado de México, aproximadamente a las 12:10 horas. El vehículo A, un Renault Kwid modelo 2021, circulaba por Independencia de poniente a oriente y dio vuelta a la izquierda hacia Juárez donde está prohibido. El vehículo B, un Chevrolet Spark modelo 2018, circulaba por Independencia de oriente a poniente a unos 30 km/h con el semáforo en verde. El vehículo B impactó con su parte frontal el costado derecho del vehículo A. Los dos vehículos quedaron en el cruce, a 3 metros uno del otro.",
  },
  {
    clave: "desierto-chihuahua",
    texto:
      "El hecho ocurrió en la carretera federal 45, tramo Chihuahua–Ciudad Juárez, kilómetro 120, cerca de Villa Ahumada, Chihuahua, en zona desértica, aproximadamente a las 15:00 horas, con viento fuerte y polvo. El vehículo A, un tractocamión Kenworth T680 modelo 2020 con un semirremolque, circulaba de sur a norte a unos 90 km/h. El vehículo B, un Nissan Sentra modelo 2014, circulaba adelante a unos 60 km/h por la poca visibilidad. El vehículo A impactó con su parte frontal la parte posterior del vehículo B. El vehículo B salió del camino por el lado derecho y quedó a 35 metros del punto de impacto; el tractocamión se detuvo 60 metros adelante sobre el acotamiento.",
  },
];
