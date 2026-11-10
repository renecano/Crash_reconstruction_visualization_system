// Unity → web: cada mensaje del puente (packages/scene-schema/visor-puente.md) como texto JSON.
mergeInto(LibraryManager.library, {
  CroquisEnviarAWeb: function (ptr) {
    var texto = UTF8ToString(ptr);
    if (typeof window.croquisVisorMensaje === "function") {
      window.croquisVisorMensaje(texto);
    }
  },
  // El dpr de la pantalla, para el tope de dpr de cada nivel de calidad (U5, ADR 0115).
  CroquisDpr: function () {
    return window.devicePixelRatio || 1;
  },
});
