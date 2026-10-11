# data/raw

Descargas crudas. **No se versionan** (salvo este archivo). Se obtienen con los scripts del paquete `croquis-data`:

```powershell
uv run croquis-data atus download   # descarga y verifica los archivos de INEGI ATUS
uv run croquis-data atus summary    # calcula las cifras y escribe eval/results/atus_summary.json
```

Cada archivo descargado queda documentado en `data/SOURCES.md` con URL, fecha, tamaño y licencia.
