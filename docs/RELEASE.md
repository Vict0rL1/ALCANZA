# Publicar Clara (beta)

Clara sigue siendo un **prototipo local**: los datos viven solo en el dispositivo de cada persona.
Publicar significa poner los archivos de la app en una dirección web; no hay servidor que guarde datos.

Este documento tiene dos partes:

- **Lo que tienes que hacer tú**: pasos que solo puede hacer el dueño del repositorio (Victor), con los
  valores exactos. Nada de esto se hace solo.
- **Cómo funciona**: qué comprueba cada parte de la automatización.

---

## Lo que tienes que hacer tú

### A. Proteger la rama `main` (una sola vez)

Hazlo después de que el PR de la beta tenga CI en verde al menos una vez: GitHub solo te deja elegir
comprobaciones que ya se ejecutaron alguna vez.

0. **Rama por defecto = `main`.** Hoy la rama por defecto del repositorio es
   `claude/margen-personal-finance-app-cdvrt3` (de una fase anterior). En GitHub › **Settings** ›
   **General** › **Default branch** › botón ⇄ › elige `main` › **Update** › confirma. Así los PR nuevos
   apuntan a `main` y la insignia y las reglas hablan de la misma rama. No borra ninguna rama.
1. Abre el repositorio en GitHub › **Settings** › **Rules** › **Rulesets** › **New ruleset** ›
   **New branch ruleset** (en la versión antigua: **Settings** › **Branches** › **Add branch protection rule**).
   - Nombre: `main protegida`. **Enforcement status**: `Active`.
   - **Target branches** › **Add target** › **Include default branch** (o escribe el patrón `main`).
2. Marca **Require a pull request before merging**.
3. Marca **Require status checks to pass** y añade estas comprobaciones (escríbelas tal cual):
   - `check`
   - `e2e (celular)`
   - `e2e (celular-pequeno)`
   - `e2e (escritorio)`
   - `deploy-preview / Cloudflare Pages` (el despliegue de prueba; aparece cuando se haya ejecutado
     una vez, es decir, después de los pasos de B)
4. Marca **Block force pushes** (en la versión antigua: deja **Allow force pushes** sin marcar).
5. Pulsa **Create** (o **Save changes**).

Para comprobarlo: en un PR, el botón de fusionar debe quedar bloqueado mientras alguna de esas
comprobaciones no esté en verde.

### B. Cloudflare Pages (una sola vez)

Clara se publica en Cloudflare Pages desde GitHub Actions: GitHub compila, prueba y sube la carpeta
`dist/`. Cloudflare no lee el repositorio ni compila nada. El plan gratuito basta y no pide tarjeta.

1. **Cuenta y proyecto.**
   1. Crea una cuenta gratuita en <https://dash.cloudflare.com/sign-up> y confirma el correo.
   2. En el panel: **Workers & Pages** › **Create** › pestaña **Pages** › **Use direct upload**
      («Subir recursos», **no** «Connect to Git»).
   3. **Project name**: `clara`. Pulsa **Create project**. Si después te pide subir archivos, sube la
      carpeta `dist/` de una compilación local (`npm run build`) o cierra esa pantalla: el primer
      despliegue real lo hará GitHub.
   4. Si prefieres la terminal, lo mismo en un solo paso:
      `npx wrangler login` y luego `npx wrangler pages project create clara --production-branch=main`.
   5. La rama de producción debe ser `main` (proyecto `clara` › **Settings** › **Builds & deployments**
      › **Production branch**).
2. **Token de la API con un solo permiso.**
   1. Arriba a la derecha: tu perfil › **My Profile** › **API Tokens** › **Create Token** ›
      **Create Custom Token** › **Get started**.
   2. **Token name**: `clara-github-deploy`.
   3. **Permissions**: `Account` · `Cloudflare Pages` · `Edit`. **Ningún otro permiso.**
   4. **Account Resources**: `Include` · tu cuenta.
   5. **Continue to summary** › **Create Token**. Copia el token: Cloudflare solo lo muestra una vez.
      No lo pegues en ningún archivo, chat ni correo.
3. **Secretos en GitHub.**
   1. Copia tu **Account ID**: **Workers & Pages** › columna derecha › **Account ID** (también es el
      número largo que aparece en la dirección del panel, `dash.cloudflare.com/<Account ID>/…`).
   2. En GitHub: el repositorio › **Settings** › **Secrets and variables** › **Actions** ›
      **New repository secret**, dos veces:
      - Name `CLOUDFLARE_API_TOKEN` · Secret: el token del paso 2.
      - Name `CLOUDFLARE_ACCOUNT_ID` · Secret: el Account ID.
4. **Deja Cloudflare Web Analytics desactivado** (proyecto `clara` › **Metrics** › **Web Analytics**:
   no lo actives). Su script lo bloquearía la CSP de Clara y rompería la promesa de «sin terceros».
5. **Dirección pública.** Tras el primer despliegue a producción, la app queda en
   `https://clara.pages.dev` (si ese nombre ya estaba ocupado, Cloudflare añade un sufijo, p. ej.
   `https://clara-abc.pages.dev`: lo verás en el proyecto, arriba). Escríbela en el README, en
   «Dirección pública».

Hasta que existan los dos secretos, el trabajo `deploy-preview` de cada PR falla con el mensaje
«Faltan los secretos de Cloudflare»: no se despliega nada y no se finge que se desplegó.

---

## Cómo funciona

### Integración continua (`.github/workflows/ci.yml`)

Se ejecuta en cada PR y en cada `push` a `main`. Si llega un `push` nuevo a la misma rama, la ejecución
anterior se cancela.

| Trabajo | Qué hace | Límite |
|---|---|---|
| `check` | `npm ci`, `npm run check` (tipos, lint, textos sin traducir, pruebas unitarias), `npm run build`, `npm run size` (presupuesto de tamaño) y sube `dist/` como artefacto | 15 min |
| `e2e (celular)`, `e2e (celular-pequeno)`, `e2e (escritorio)` | Instala Chromium y ejecuta todas las pruebas de navegador de ese tamaño con `--fail-on-flaky-tests` | 30 min |

- En CI cada prueba se reintenta **una** vez. Si falla y luego pasa, cuenta como **inestable** y el
  trabajo falla igualmente: una prueba inestable es un error que hay que entender, no ruido.
- Si un trabajo de navegador falla, GitHub guarda durante 7 días el artefacto
  `playwright-<tamaño>` con las trazas (`test-results/`) y el informe HTML (`playwright-report/`).
  Para verlo: descárgalo desde la ejecución en la pestaña **Actions** y ábrelo con
  `npx playwright show-report playwright-report` o `npx playwright show-trace <archivo>.zip`.
- Si algún trabajo de navegador tarda más de 15 minutos en GitHub, se divide en dos mitades
  (`--shard=1/2` y `--shard=2/2`) en lugar de subir el límite.

### Despliegues (`.github/workflows/deploy.yml`)

`ci.yml` llama a `deploy.yml` solo cuando `check` y los tres `e2e` están en verde, así que nada sin
pruebas llega a Cloudflare y el resultado aparece como una comprobación más del mismo commit:

| Cuándo | Trabajo | Qué hace |
|---|---|---|
| Cada PR | `deploy-preview / Cloudflare Pages` | Sube el `dist/` ya probado como vista previa de la rama (`wrangler pages deploy dist --project-name=clara --branch=<rama>`), ejecuta `npm run test:smoke -- --project=celular` contra esa dirección y deja la dirección en un comentario del PR (uno solo, que se actualiza). |
| Cada push a `main` | `deploy-production / Cloudflare Pages` | Lo mismo como despliegue de producción y prueba rápida contra él. |

- Las pruebas rápidas se ejecutan contra la dirección única de ese despliegue
  (`https://<id>.clara.pages.dev`): es exactamente lo que se acaba de subir.
- Sin los secretos de Cloudflare el trabajo falla con «Faltan los secretos de Cloudflare» y no sube nada.
- Para probar a mano cualquier dirección: `BASE_URL=https://… npm run test:smoke -- --project=celular`
  (con `BASE_URL` no se compila ni se sirve nada en local).

### Pruebas rápidas (`npm run test:smoke`)

Unas diez pruebas marcadas con `@smoke` recorren lo esencial: configuración inicial, agregar un gasto,
pegar varias líneas en el asistente, eliminar y «Deshacer», modo privado, cambio de idioma, exportar
una copia, recargar sin conexión y la pantalla de datos de una versión más nueva. Sirven para el ciclo
local rápido y para comprobar cada despliegue.

```bash
npm run test:smoke                       # los tres tamaños
npm run test:smoke -- --project=celular  # solo celular
```

### Presupuesto de tamaño (`npm run size`)

`scripts/check-size.mjs` suma el JavaScript que `index.html` carga al abrir la app y falla si pasa de
la referencia de `scripts/size-baseline.json` en más de un 10 %. Si el aumento es intencionado:

```bash
npm run build
npm run size -- --update
```

y guarda `scripts/size-baseline.json` **en su propio commit**, explicando el motivo.
