#!/bin/bash
# Croquis en esta Mac, sin Vercel ni internet (salvo la lectura con IA y el mapa).
# Doble clic en Finder. Instrucciones: LEEME-DEMO-LOCAL.md. Lo que hace: tools/demo-local/demo-local.sh.
cd "$(dirname "$0")" || exit 1
bash "./tools/demo-local/demo-local.sh" "$@"
codigo=$?
echo
read -r -n 1 -s -p "Presiona una tecla para cerrar esta ventana."
echo
exit "$codigo"
