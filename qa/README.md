# Auditoría independiente de CLARA — 9–10 de octubre de 2026

Base: `9f3b1d03b9a5df20a266bd12797dedf08ea0e738`. Rama local: `qa/auditoria-2026-10-09`.
Solo se añaden pruebas y documentación; no se cambia lógica de producción.

## Ejecutar

Desde la raíz del repositorio, con Node compatible con `package.json`:

```sh
npm ci
npm run check
npx tsc -p qa/tsconfig.json
npx vitest run --config qa/vitest.config.ts --reporter=verbose
```

Resultado de esta auditoría: **37 pruebas nuevas; 29 aprobadas y 8 fallidas**.
El código de salida 1 de esta suite es intencional: las ocho pruebas `QA-01` a `QA-08`
expresan el comportamiento correcto pendiente de implementar. No están marcadas como
`it.fails` ni cambian el resultado esperado para acomodar el error. El `npm run check`
original no incluye `qa/` y aprobó 654 pruebas, con una omitida.

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

## Regresiones abiertas

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

QA-03 es una discrepancia de seguridad del producto con la semántica de «Puedes gastar»:
la fórmula actual de «sin arrastre» está documentada, pero puede exceder el saldo real.
La reparación debe acordar esa regla y preservar por separado el presupuesto del periodo.

## Verificación de navegador

`npm run test:e2e -- --project=celular --workers=2 --reporter=json` no pudo iniciar Chromium
en el sandbox macOS (MachPortRendezvous / Permission denied 1100). Los 247 errores de
arranque **no son 247 defectos de CLARA**. Se realizaron recorridos manuales en el navegador
integrado y se consultó la CI existente del mismo commit:

https://github.com/Vict0rL1/CLARA/actions/runs/37982076912

CI: 247 aprobadas en celular pequeño, 247 en celular y 246 aprobadas + 1 omitida en
escritorio. Son 740 ejecuciones aprobadas sobre una suite compartida, no 740 casos únicos.
