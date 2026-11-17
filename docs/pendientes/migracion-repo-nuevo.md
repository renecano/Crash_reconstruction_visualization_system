# Plan: migrar Croquis a un repositorio nuevo (después de la demo)

- **Pedido:** René, 2026-11-17. Se hace después de la presentación con CESVI. **Este documento no ejecuta nada:** es la lista para ese día.
- **Por qué:** el historial público de `renecano/Crash_reconstruction_visualization_system` trae el video de referencia del tráiler, que no tiene licencia. Además, René quiere quitar las líneas de coautoría de los commits.
- **Lo que ya existe:**
  - una reescritura de prueba en `D:\dev-cache\reescritura\croquis`;
  - los respaldos `D:\respaldos\croquis-antes-de-reescribir-2026-11-16.bundle` y `…-2026-11-17.bundle`.

  La reescritura de prueba ya está vieja: `main` siguió avanzando. El día de la migración se rehace desde cero con el procedimiento de abajo. Los respaldos se conservan.

## Lo que se quita del historial

- **`video_referencia.MP4`** (1.9 MB). Entró por error en `ba581373` y se borró en `02a9b985`. Hoy no está en el árbol de `main`, pero sigue en su historial.
  - Es el único archivo de video o audio del historial fuera de `apps/web/public/portada/`. Los de la portada son nuestros y se quedan.
  - Desde el 2026-11-17, el CI y el gancho de pre-commit (`tools/git/sin-medios.mjs`) impiden que vuelva a pasar.
- **Las líneas de coautoría** de los mensajes (`Co-Authored-By:` y `Co-authored-by:`): 943 líneas en los 530 commits de `main` al 2026-11-17, con cinco variantes de nombre. Se quitan todas. El resto del mensaje no cambia.
- **Nada más.** El árbol final de `main` queda idéntico byte a byte (mismo hash de árbol), y los autores y las fechas se conservan.

## Cómo quedan los commits

- **Todos los hashes cambian.** Los commits que nombran a otros por su hash (por ejemplo, «entró por error en ba581373») apuntarán a hashes que ya no existen. `git filter-repo` reescribe esas referencias abreviadas en los mensajes cuando las reconoce.
- **El commit que solo agregaba el video** queda con el resto de sus cambios. El que solo lo borraba queda vacío y `filter-repo` lo quita: puede haber uno menos.
- **Los «Merge pull request #NNN»:** en el repo nuevo, `#NNN` apuntaría a otro PR o a ninguno. Se reescriben como `renecano/Crash_reconstruction_visualization_system#NNN`, para que el enlace lleve al PR original mientras el repo viejo exista.
- **Ramas:**
  - solo se migran `main` y las ramas vivas de ese día (hoy: `perf/unity-armado-por-partes-v2` y las de los PR abiertos);
  - las 26 ramas remotas restantes son de PR ya fusionados y se quedan en el repo viejo;
  - las ramas vivas se reescriben en la misma corrida que `main`, para que sigan compartiendo historia con él.

## Pasos

### 1. Antes (René y Claude, con el repo viejo)

1. Que no haya PR abiertos: se fusionan o se cierran. Lo que quede vivo se anota.
2. Respaldo nuevo:
   ```
   git -C <repo> bundle create D:\respaldos\croquis-antes-de-migrar-<fecha>.bundle --all
   git bundle verify D:\respaldos\croquis-antes-de-migrar-<fecha>.bundle
   ```
3. Inventario de lo que hay que recrear:
   - secretos y variables de Actions;
   - la regla «main protegida»;
   - los colaboradores;
   - los releases;
   - el webhook o la integración de Vercel.

   Al 2026-11-17 eso es:
   - el secreto `VERCEL_DEPLOY_HOOK_MAIN`;
   - la regla 27338684;
   - cuatro colaboradores;
   - siete releases, unos 415 MB;
   - el repo tenía 0 forks.

### 2. Reescribir (Claude, en un clon aparte; nada se sube todavía)

1. Instalar `git-filter-repo` (`uv tool install git-filter-repo`). Es la herramienta que recomienda Git en lugar de `filter-branch`.
2. Clon espejo nuevo: `git clone --mirror <url viejo> D:\dev-cache\migracion\croquis.git`.
3. Una sola corrida:
   - `--path video_referencia.MP4 --invert-paths`;
   - un `--message-callback` que quita las líneas `Co-Authored-By:` y `Co-authored-by:` (sin distinguir mayúsculas), quita la línea en blanco que sobra al final y reescribe `Merge pull request #NNN` a la referencia completa del repo viejo.
4. **Comprobaciones** (todas deben pasar antes de seguir):
   - el árbol de `main` nuevo es igual al viejo: `git rev-parse main^{tree}` da lo mismo;
   - `git log --all -- video_referencia.MP4` no da nada;
   - `git log --all --format=%B | grep -ci co-authored-by` da 0;
   - el número de commits es el mismo, o uno menos (el que solo borraba el video);
   - `node tools/git/sin-medios.mjs` pasa en un checkout del resultado;
   - un escaneo de secretos de todo el historial (`gitleaks detect` o `trufflehog git file://…`) no encuentra nada. Si encuentra algo, se rota esa llave antes de publicar.

### 3. Repo nuevo (René crea el repo; Claude sube y configura)

1. René crea el repo vacío en GitHub: el nombre lo decide él; público como el actual, sin README ni licencia.
2. Claude sube `main` y las ramas vivas (`git push <nuevo> main <ramas>`). No hace falta un push forzado: el repo está vacío.
3. **Cambiar el nombre del repo en el código** (PR `chore:` en el repo nuevo). Al 2026-11-17 aparece en:
   - `apps/web/src/components/sitio/pie.tsx` y `apps/web/scripts/build-paginas.mjs` (el enlace al código del sitio: despliega);
   - `apps/web/src/data/recorrido.json` (11 enlaces) y `apps/web/src/data/historia.json`;
   - `tools/unity/visor-local.mjs` (de dónde baja el visor de Unity la demo local);
   - `tools/colaborador/desde-release.ps1` y `tools/colaborador/tanda.ps1` (el paquete de la RTX);
   - `LEEME-TANDA-RTX.md`, `docs/PROGRESS.md` y `data/croquis_data/nhtsa_ctd.py` (un comentario).

   Se buscan otra vez con `git grep "Crash_reconstruction_visualization_system"` antes del PR.

4. **Releases:** se recrean en el repo nuevo con sus mismos nombres:
   - `visor-web-64b29e877ba9c856` (36 MB): sin él, la demo local, las e2e con Unity y la RTX no encuentran el visor;
   - `rtx-t4` (126 MB): el paquete de la RTX.

   Los otros cinco son históricos: se quedan en el repo viejo, salvo que René pida moverlos. Para cada uno: `gh release download <tag> -R <viejo>` y luego `gh release create <tag> -R <nuevo> --prerelease --notes-file …` con los mismos archivos.

### 4. Lo que hay que reconfigurar

| Qué                                   | Dónde                                                | Quién                                      | Cómo                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel: el repo del proyecto**      | Panel de Vercel → proyecto → Settings → Git          | René                                       | Desconectar el repo viejo y conectar el nuevo. El proyecto, el dominio `croquis-sage.vercel.app`, sus variables de entorno y su historial de despliegues no cambian: viven en el proyecto, no en el repo. La raíz sigue en `apps/web` y el «Ignored Build Step» sigue en `apps/web/vercel.json`.                                                                                                                                      |
| **Vercel: Deploy Hook**               | Panel de Vercel → Settings → Git → Deploy Hooks      | René                                       | Crear uno nuevo para `main` del repo nuevo y borrar el viejo.                                                                                                                                                                                                                                                                                                                                                                         |
| **Secreto `VERCEL_DEPLOY_HOOK_MAIN`** | GitHub del repo nuevo → Settings → Secrets → Actions | René lo pega (Claude no ve ni pide llaves) | La URL del Deploy Hook nuevo. Lo usa `.github/workflows/produccion.yml`.                                                                                                                                                                                                                                                                                                                                                              |
| **Vercel Blob**                       | —                                                    | Nadie                                      | El almacén es de la cuenta de Vercel, no del repo: las direcciones de los modelos, el HDRI y el build de Unity no cambian. `RECURSOS_READ_WRITE_TOKEN` sigue en el `.env.local` de René.                                                                                                                                                                                                                                              |
| **Llave de Claude**                   | —                                                    | Nadie                                      | No está en GitHub: el CI usa respuestas grabadas. En Vercel es una variable del proyecto y no cambia.                                                                                                                                                                                                                                                                                                                                 |
| **Regla «main protegida»**            | GitHub del repo nuevo → Settings → Rules             | René o Claude                              | La misma: sin borrado, sin push forzado y con las verificaciones obligatorias. Al 2026-11-17: «Web y paquetes TS (lint, tipos, pruebas unitarias)», «Python (ruff, pyright, pytest 1/2)» y «2/2», «Visor Unity (Croquis.Core, fidelidad)» y «E2E de los flujos principales (Chromium)». Agregar «Peso del despliegue (vercel build, ≤ 200 MB y ≤ 50 MB por función)» cuando #265 esté en `main`. Se crea **después** del primer push. |
| **Colaborador de la RTX**             | Su computadora                                       | Él, con la instrucción de René             | Invitarlo al repo nuevo y, en su carpeta, correr `git remote set-url origin <url nueva>`. Si vuelve a clonar, mejor. `LEEME-TANDA-RTX.md` lleva la URL nueva.                                                                                                                                                                                                                                                                         |
| **Los otros colaboradores**           | GitHub del repo nuevo → Settings → Collaborators     | René                                       | Invitar a los cuatro de hoy, con el mismo permiso.                                                                                                                                                                                                                                                                                                                                                                                    |
| **Dependabot**                        | GitHub del repo nuevo → Settings → Code security     | René o Claude                              | `.github/dependabot.yml` viaja con el código, pero hay que activar las alertas y las actualizaciones de seguridad en el repo nuevo. Los PR de Dependabot abiertos en el viejo no pasan: los vuelve a abrir solo.                                                                                                                                                                                                                      |
| **GitHub Actions**                    | —                                                    | —                                          | Los workflows viajan con el código. Las cachés y los artefactos empiezan vacíos: la primera corrida tarda más.                                                                                                                                                                                                                                                                                                                        |
| **Copias locales de René**            | `D:\Documentos\proyectos\croquis`                    | Claude                                     | `git remote set-url origin <url nueva>` y `git fetch`. Las ramas locales viejas se borran: sus hashes ya no existen. `.cache/`, `trailer-salida/` y `.env.local` no se tocan.                                                                                                                                                                                                                                                         |
| **Coautoría en los commits nuevos**   | Configuración de Claude Code de René                 | René, si quiere                            | Si no quiere que vuelvan a aparecer, desactivarlas en la configuración de atribución de Claude Code. Hoy las agrega una instrucción del sistema.                                                                                                                                                                                                                                                                                      |

### 5. El repo viejo

- **Archivarlo** (Settings → Archive): queda de solo lectura y los PR, la discusión y los releases históricos siguen consultables.
- **Para que el video deje de estar a la vista,** el repo viejo tiene que volverse privado o borrarse. Archivado y público, el video sigue en su historial. Si se vuelve privado, los enlaces `renecano/Crash_reconstruction_visualization_system#NNN` del historial nuevo solo los abren quienes tengan acceso. Lo decide René.
- **Si el repo se borra o se vuelve privado,** GitHub puede conservar un tiempo vistas en caché de commits que tuvieron el video. Si hiciera falta purgarlas, se pide a GitHub Support: la solicitud se redacta ese día y René la manda.

### 6. Verificación final

1. CI completo en verde en el repo nuevo, en `main`.
2. Un merge de prueba que despliegue, para confirmar el Deploy Hook y la integración de Vercel. Se junta con el PR del nombre del repo para gastar un solo despliegue.
3. `croquis-sage.vercel.app/api/version` muestra el commit nuevo.
4. La demo local baja el visor del release nuevo (`node tools/unity/visor-local.mjs copia` en una carpeta sin `.cache`).
5. El colaborador corre la comprobación del paquete de la RTX (los 2 minutos iniciales) con la URL nueva.

## Tiempo estimado

Unas 2 horas en total:

- unos 30 minutos de René: crear el repo, el panel de Vercel, el secreto, las invitaciones y archivar el viejo;
- el resto, de Claude: la reescritura, las comprobaciones, el push, los releases, el PR del nombre y la verificación.

Subir los releases depende de la conexión (~160 MB).
