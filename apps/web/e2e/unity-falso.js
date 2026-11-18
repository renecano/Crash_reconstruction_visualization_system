// Un visor Unity de mentira para las e2e (U6): se sirve en lugar del cargador del build de Blob y
// habla el puente (packages/scene-schema/visor-puente.md) sin WebGL ni 70 MB de descarga. Contesta
// `listo`, `cargado` y `captura` (un PNG de un color por vista), guarda lo que recibe en
// `window.__unityFalso.recibidos` y deja que la prueba mande mensajes con `__unityFalso.decir`.
// También se queda con el teclado de la página, como el Unity real (`__unityFalso.teclas`).
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
  window.__unityFalso = { recibidos: [], teclas: [], decir: decir };
  window.createUnityInstance = function (lienzo, config, progreso) {
    if (progreso) progreso(1);
    // Como el Unity real: oye el teclado de toda la ventana y cancela cada tecla
    // (`WebGLInput.captureAllKeyboardInput`, activo por defecto). Así lo registra su framework
    // (`JSEvents.registerOrRemoveHandler`): una función `jsEventHandler` en `window`.
    ["keydown", "keypress", "keyup"].forEach(function (tipo) {
      var jsEventHandler = function jsEventHandler(event) {
        window.__unityFalso.teclas.push(tipo + ":" + event.key);
        event.preventDefault();
      };
      window.addEventListener(tipo, jsEventHandler, true);
    });
    // Como el real, dibuja un cuadro en cada vuelta del navegador (B7: el video sale de estos
    // cuadros): un color que cambia con el instante fijado y el instante escrito.
    var tFijado = 0;
    var g2 = lienzo.getContext("2d");
    var dibujar = function () {
      if (g2) {
        lienzo.width = Math.max(1, Math.round(lienzo.clientWidth * (window.devicePixelRatio || 1)));
        lienzo.height = Math.max(
          1,
          Math.round(lienzo.clientHeight * (window.devicePixelRatio || 1)),
        );
        g2.fillStyle = "hsl(" + Math.round(((tFijado + 10) * 36) % 360) + ", 60%, 45%)";
        g2.fillRect(0, 0, lienzo.width, lienzo.height);
        g2.fillStyle = "#fff";
        g2.font = Math.round(lienzo.height / 12) + "px sans-serif";
        g2.fillText("t = " + tFijado.toFixed(2), lienzo.width * 0.05, lienzo.height * 0.2);
      }
      requestAnimationFrame(dibujar);
    };
    requestAnimationFrame(dibujar);
    var instancia = {
      SendMessage: function (objeto, metodo, texto) {
        var datos = texto ? JSON.parse(texto) : {};
        window.__unityFalso.recibidos.push({ objeto: objeto, metodo: metodo, datos: datos });
        if (metodo === "fijarTiempo") tFijado = Number(datos.t) || 0;
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
