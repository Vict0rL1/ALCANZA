# Auditoría independiente de CLARA — 9–10 de octubre de 2026

Base auditada: `9f3b1d03b9a5df20a266bd12797dedf08ea0e738`. Rama local de la auditoría: `qa/auditoria-2026-10-09`.
La auditoría solo añadió pruebas y documentación; no cambió lógica de producción.

> **Estado tras la reparación (10 de octubre de 2026, rama `fix/auditoria-2026-10-10`).** Las ocho
> regresiones `QA-01`…`QA-08` están corregidas en el código de producción y esta suite pasa entera
> (**37 de 37**). Forma parte de `npm run check` (`vite.config.ts` incluye `qa/**/*.test.ts`), que es el
> trabajo `check` obligatorio de CI, así que no puede volver a quedar roja sin que se note. El informe de
> cierre, con la evidencia por hallazgo y el veredicto, está en `docs/AUDIT-2026-10-10.md`; los recorridos
> de `PLAN-E2E.md` están automatizados en `tests/e2e/audit-regressions.spec.ts`. Lo que sigue describe la
> auditoría tal como se entregó: sus cifras son **históricas** (base sin reparar).

## Ejecutar

Desde la raíz del repositorio, con Node compatible con `package.json`:

```sh
npm ci
npm run check
npx tsc -p qa/tsconfig.json
npx vitest run --config qa/vitest.config.ts --reporter=verbose
```

Resultado **histórico** de la auditoría sobre la base sin reparar: **37 pruebas nuevas; 29 aprobadas y
8 fallidas**. El código de salida 1 era intencional: las ocho pruebas `QA-01` a `QA-08` expresaban el
comportamiento correcto pendiente de implementar. No se marcaron como `it.fails` ni se cambió el resultado
esperado para acomodar el error. El `npm run check` de entonces no incluía `qa/` y aprobó 654 pruebas, con
una omitida. (Tras la reparación: 37 aprobadas, 0 fallidas; `npm run check` incluye `qa/`.)

Las fechas del dominio están fijadas al 28 de septiembre de 2026; los recorridos de
navegador se hicieron los días 9–10 de octubre. Los importes de pruebas son unidades
menores: `100000` equivale a CAD 1000.00.

## Contenido y límites

- `financial-audit.test.ts`: los 12 escenarios solicitados, validación de importes,
  fechas, idempotencia, metas, transferencias, simulación, papelera y 10.000 movimientos;
  seis regresiones financieras abiertas.
- `security-storage.test.ts`: cifrado correcto/frase incorrecta, copias inválidas,
  50.000 movimientos, conflictos y guardados concurrentes con `fake-indexeddb`;
  dos regresiones de seguridad abiertas.
- `PLAN-E2E.md`: especificación de aceptación para extender Playwright después de reparar.

La prueba QA-08 usa un doble de WebCrypto: **no ejecuta** una derivación de clave de
coste excesivo. QA-07 inspecciona texto CSV; no abre Excel ni ejecuta fórmulas.
Las pruebas de almacenamiento simulan IndexedDB y no sustituyen pruebas en dispositivos.
La medida de 50.000 registros es una muestra en Node, no un objetivo de latencia móvil.

## Regresiones de la auditoría (abiertas el 2026-10-09; cerradas el 2026-10-10)

| ID | Criterio de aceptación |
|---|---|
| QA-01 | No cambiar la moneda de un presupuesto con saldo de referencia no nulo. |
| QA-02 | Autoconfirmar únicamente el remanente de un cobro parcial. |
| QA-03 | No sugerir más dinero para gastar que la liquidez efectiva al desactivar arrastre. |
| QA-04 | No aplicar apartados posteriores a una instantánea histórica. |
| QA-05 | Rechazar moneda explícita del CSV incompatible con el presupuesto. |
| QA-06 | No perder obligaciones actuales tras 2000 ocurrencias históricas. |
| QA-07 | Neutralizar fórmulas en campos de texto exportados a hojas de cálculo. |
| QA-08 | Rechazar parámetros de cifrado fuera de límites antes de derivar claves. |

QA-03 era una discrepancia de seguridad del producto con la semántica de «Puedes gastar»:
la fórmula de «sin arrastre» estaba documentada, pero podía exceder el saldo real. La regla
acordada en la reparación (decisión 131, `docs/FORMULAS.md` §31): sin arrastre, la base es el menor
entre la asignación del periodo y el saldo real; la asignación del periodo se conserva aparte.

## Verificación de navegador (histórica)

`npm run test:e2e -- --project=celular --workers=2 --reporter=json` no pudo iniciar Chromium
en el sandbox macOS (MachPortRendezvous / Permission denied 1100). Los 247 errores de
arranque **no son 247 defectos de CLARA**. Se realizaron recorridos manuales en el navegador
integrado y se consultó la CI existente del mismo commit:

https://github.com/Vict0rL1/CLARA/actions/runs/37982076912

CI: 247 aprobadas en celular pequeño, 247 en celular y 246 aprobadas + 1 omitida en
escritorio. Son 740 ejecuciones aprobadas sobre una suite compartida, no 740 casos únicos.
