// Un visor Unity de mentira para las e2e (U6): se sirve en lugar del cargador del build de Blob y
// habla el puente (packages/scene-schema/visor-puente.md) sin WebGL ni 70 MB de descarga. Contesta
// `listo`, `cargado` y `captura` (un PNG de un color por vista), guarda lo que recibe en
// `window.__unityFalso.recibidos` y deja que la prueba mande mensajes con `__unityFalso.decir`.
// La versión del puente la pone la prueba en `window.__unityFalsoVersion`.
(function () {
  var decir = function (m) {
    var f = window.croquisVisorMensaje;
    if (typeof f === "function") f(JSON.stringify(m));
  };
  var COLORES = { antes: "#3366cc", impacto: "#cc3333", reposo: "#33aa55" };
  var png = function (vista, ancho, alto) {
    var c = document.createElement("canvas");
    c.width = Math.min(ancho || 64, 256);
    c.height = Math.min(alto || 36, 144);
    var g = c.getContext("2d");
    g.fillStyle = COLORES[vista] || "#888888";
    g.fillRect(0, 0, c.width, c.height);
    return c.toDataURL("image/png").slice("data:image/png;base64,".length);
  };
  window.__unityFalso = { recibidos: [], decir: decir };
  window.createUnityInstance = function (lienzo, config, progreso) {
    if (progreso) progreso(1);
    var instancia = {
      SendMessage: function (objeto, metodo, texto) {
        var datos = texto ? JSON.parse(texto) : {};
        window.__unityFalso.recibidos.push({ objeto: objeto, metodo: metodo, datos: datos });
        if (metodo === "cargarCaso") {
          var caso = JSON.parse(datos.json);
          setTimeout(function () {
            decir({ tipo: "cargado", escena_id: caso.resultado.escena_id });
          }, 30);
        } else if (metodo === "capturar") {
          setTimeout(function () {
            decir({
              tipo: "captura",
              vista: datos.vista,
              png: png(datos.vista, datos.ancho, datos.alto),
            });
          }, 30);
        }
      },
      Quit: function () {
        return Promise.resolve();
      },
    };
    setTimeout(function () {
      decir({ tipo: "listo", version: window.__unityFalsoVersion || "0.0.0" });
    }, 30);
    return Promise.resolve(instancia);
  };
})();
