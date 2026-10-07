# Rendimiento de Clara: mediciones reales

## Cómo se mide

- **Qué se mide.** La versión **compilada** (`npm run build` + `vite preview`), en Chromium
  141 headless, en una máquina de desarrollo (4 núcleos Intel Xeon a 2,1 GHz).
- **Mediana de 3 repeticiones.** Navegar, buscar, filtrar y guardar se miden 3 veces y se
  toma la mediana. Abrir se mide con 3 recargas. Exportar e importar, una vez.
- **No se extrapola a teléfonos.** Un teléfono de gama media puede ser varias veces más
  lento. Estas cifras sirven para comparar versiones en la misma máquina, no como promesa.
- **Datos sintéticos**, nunca de una persona (`src/test/synthetic.ts`, deterministas). Tienen
  4 cuentas (incluida una tarjeta), recurrentes con pagos liquidados, compras divididas,
  transferencias (también a la tarjeta y al ahorro), devoluciones, ~1 % en la papelera y,
  desde esta versión, historial: el alta de los últimos movimientos, hasta 1.000 entradas.

Para repetirlo:

```bash
BENCH_OUT=/tmp/bench npx vitest run src/test/synthetic.test.ts
npm run build && npx vite preview --port 4180 --strictPort &
node scripts/bench.mjs /tmp/bench etiqueta
```

Resultados en bruto:

- `docs/perf/results-antes.json`: línea base, versión anterior con `localStorage`.
- `docs/perf/results-intermedio.json`: IndexedDB y funciones nuevas, antes de optimizar.
- `docs/perf/results-despues.json`: versión final.

## Resultados (ms, mediana)

| Operación | 1k antes | 1k después | 10k antes | 10k después | 50k antes | 50k intermedio | 50k después |
|---|---:|---:|---:|---:|---:|---:|---:|
| Abrir (recarga) | 94 | 118 | 198 | 232 | **no cabe** | 2.746 | **581** |
| Primera apertura | 229 | 247 | 307 | 395 | no cabe | 2.696 | 858 |
| Inicio | 26 | 26 | 45 | 63 | — | 232 | 171 |
| Movimientos | 34 | 31 | 42 | 37 | — | 52 | 56 |
| Buscar en la lista | 21 | 18 | 28 | 37 | — | 107 | 120 |
| Filtrar | 18 | 18 | 20 | 27 | — | 37 | 26 |
| Búsqueda global | 37 | 29 | 81 | 100 | — | 224 | 228 |
| Proyección | 28 | 32 | 26 | 38 | — | 108 | 96 |
| Bandeja de pendientes | 24 | 28 | 61 | 63 | — | 166 | 176 |
| Guardar un movimiento | 92 | 78 | **1.270** | 148 | — | 330 | 302 |
| Exportar | 71 | 74 | 166 | 157 | — | 429 | 545 |
| Importar: leer y validar | 52 | 50 | 279 | 163 | — | 1.950 | **477** |
| Importar: aplicar | 69 | 83 | 109 | 92 | — | 224 | 195 |
| Nuevo movimiento (formulario) | — | 20 | — | 45 | — | 39 | 68 |
| Historial | — | 23 | — | 40 | — | 122 | 146 |
| Plan ante un faltante | — | 20 | — | 55 | — | 189 | 147 |
| ¿Qué cambió? (desde ayer) | — | 17 | — | 54 | — | 99 | 104 |
| ¿Qué cambió? (1.000 entradas) | — | 49 | — | 501 | — | 8.294 | **2.168** |

«—» = no existía o no se pudo medir. Las diferencias de ±20 ms entre ejecuciones son ruido de
la máquina. Los archivos de esta versión pesan más (3,37 MB frente a 2,94 MB con 10k) porque
incluyen el historial.

## Cuellos de botella encontrados y corregidos

| Problema medido | Causa | Corrección | Efecto |
|---|---|---|---|
| 50k movimientos no se podían guardar | `localStorage` rechaza ~15 MB (`QuotaExceededError`) | IndexedDB con migración verificada (`docs/STORAGE.md`) | Se abren y guardan |
| Una copia de 50k exportada por la app no se podía restaurar | Límite de importación de 5 MB / 50k registros | 100 MB / 500k registros, con prueba | Se restaura |
| Guardar con 10k: 1,27 s | El formulario recalculaba lo ya devuelto de cada gasto con un recorrido por gasto (cuadrático) | Una pasada con un mapa | 10k: 1.270 → 148 ms |
| Abrir e importar con 50k: ~2–3 s | La validación buscaba la compra original y las otras devoluciones de cada devolución recorriendo todos los movimientos | Índice por lista (`domain/txIndex.ts`), mismas reglas | Validar en Node: 1.786 → 230 ms. Abrir: 2.746 → 581 ms. Importar: 1.950 → 477 ms |
| «¿Qué cambió?» con 1.000 entradas: 8,3 s | Reconstruir el estado copiaba la lista de 50k movimientos por cada cambio | Aplicar los cambios en bloque, una reconstrucción por colección. Prueba de equivalencia con el método anterior | Reconstruir en Node: 2.805 → 10 ms. Navegador: 8.294 → 2.168 ms |
| «¿Qué cambió?» con 50k: la pantalla se congelaba 1,4 s | Cada línea del desglose buscaba su registro recorriendo los 50k movimientos (1.000 × 50.000) | Conjunto de ids por lista; cálculo en trozos con avance; saldos en una pasada | 10k: 560–680 → 222–286 ms. 50k: ≈ 3,0 → 1,6 s; bloqueo más largo 1,4 s → ≤ 66 ms |
| «Ver más» con 2.460 filas: 174 ms | React repintaba todas las filas en cada página | Fila memorizada (`TxRow`); `content-visibility` se probó y no mejoró | 174 → 91–105 ms |

## Lo que sigue lento (y por qué no se tocó)

- **«¿Qué cambió?» rehaciendo 1.000 entradas con 50k movimientos: ~1,6 s** (antes ~3 s medido igual).
  El coste restante es recalcular el disponible en cada paso (hasta 40 pasos de ~20 ms). Ya no
  bloquea: el cálculo va en trozos de ~12 ms con el avance visible y la pantalla responde (bloqueo
  más largo medido ≤ 66 ms). Hacerlo incremental exigiría duplicar la fórmula del disponible: se
  prefirió no arriesgar la exactitud (decisión 60).
- **Exportar 50k: ~0,5 s** (serializar 15 MB). Es una acción puntual con su propio aviso.
- **Inicio, búsqueda global y bandeja con 50k: 170–230 ms.** Por debajo de lo que se percibe
  como espera en esta máquina. En un teléfono puede notarse. No se optimizó sin una medición
  en ese dispositivo.

## Operaciones largas: progreso y cancelación

- **Importar una copia.** Muestra el progreso real de lectura (porcentaje de bytes y tamaño
  en MB), luego «Comprobando toda la copia…», y se puede **cancelar**. Cancelar, o cerrar el
  diálogo de confirmación, no aplica nada: los datos siguen como estaban.
- **«¿Qué cambió?»** muestra «Calculando el desglose…» mientras calcula.
- **Cachés.** Los índices nuevos (`txIndex`) se asocian a la lista exacta de movimientos
  (`WeakMap`). Como los datos son inmutables, cualquier cambio crea una lista nueva y el
  índice viejo deja de usarse: no hay invalidación manual que olvidar.

## Clara v2 (fases 1–11): misma máquina, misma metodología

Medido tras la Fase 11 con `node scripts/bench.mjs … v2` (resultados en bruto en `docs/perf/results-v2.json`).
La versión v2 añade al recorrido las pantallas **Estadísticas** (todas las gráficas, top 5 y saldo futuro a 90 días) y **Planes**.

| Operación | 1k v2 | 10k v2 | 50k v2 |
|---|---:|---:|---:|
| Primera apertura | 396 | 613 | 1060 |
| Abrir (recarga) | 194 | 358 | 946 |
| Inicio | 50 | 94 | 293 |
| Estadísticas (nuevo) | 33 | 98 | 227 |
| Planes (nuevo) | 35 | 32 | 28 |
| Movimientos | 65 | 78 | 94 |
| Buscar en la lista | 33 | 66 | 173 |
| Filtrar | 34 | 42 | 52 |
| Búsqueda global | 48 | 109 | 311 |
| Proyección | 39 | 48 | 151 |
| Bandeja de pendientes | 48 | 105 | 289 |
| Guardar un movimiento | 137 | 178 | 396 |
| Exportar | 148 | 244 | 631 |
| Importar: leer y validar | 148 | 279 | 757 |
| Importar: aplicar | 139 | 139 | 343 |
| Nuevo movimiento (formulario) | 49 | 52 | 78 |
| Historial | 39 | 81 | 212 |
| Plan ante un faltante | 42 | 60 | 282 |
| ¿Qué cambió? (desde ayer) | 28 | 46 | 189 |
| ¿Qué cambió? (1.000 entradas) | 70 | 664 | 2265 |

Lectura: con 10 000 movimientos todas las pantallas abren por debajo de 110 ms y guardar un movimiento tarda 178 ms;
la única operación lenta sigue siendo «¿Qué cambió?» con 1.000 entradas de historial (664 ms con 10k, 2,3 s con 50k),
que ya estaba identificada en la versión anterior (después de la revisión general: 222–286 ms con 10k y ≈ 1,6 s con 50k sin bloquear la pantalla; ver arriba). Abrir con 50k (≈ 0,9 s) y exportar/importar 15 MB (0,6–0,8 s)
son operaciones poco frecuentes. Las cifras siguen siendo de Chromium de escritorio en esta máquina: un teléfono
de gama media será varias veces más lento.
