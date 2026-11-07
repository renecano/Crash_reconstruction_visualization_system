// Unity → web: cada mensaje del puente (packages/scene-schema/visor-puente.md) como texto JSON.
mergeInto(LibraryManager.library, {
  CroquisEnviarAWeb: function (ptr) {
    var texto = UTF8ToString(ptr);
    if (typeof window.croquisVisorMensaje === "function") {
      window.croquisVisorMensaje(texto);
    }
  },
});
