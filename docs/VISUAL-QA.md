# QA visual · ronda 2 (antes / después)

Capturas generadas con `npm run shots -- --label=<antes|after>` (`tests/visual/screens.spec.ts`),
en los tres tamaños de las pruebas (Pixel 7 412×915, 320×640 y escritorio 1280×800) y los dos temas.
En el repositorio se versionan las de Pixel 7 en ambos temas y unas pocas de 320 px y escritorio; el
resto se regenera con el mismo comando. Cada captura existe en dos versiones: la pantalla visible
(`.png`) y la página completa (`-full.jpg`).

Las guardas de maquetación que acompañan a estas capturas están en `tests/e2e/layout-guards.spec.ts`
(`npm run test:e2e -- layout-guards`). Sobre `c75532b` fallaban B1, B2, B3, B10, C1, C2 y C3 en los
tres tamaños; al cerrar la ronda deben pasar todas.

Rutas: `docs/screenshots/before/` y `docs/screenshots/after/`, archivo `<proyecto>-<tema>-<pantalla>.png`.

| Pantalla | Antes (Pixel 7, oscuro) | Después | Qué cambió |
|---|---|---|---|
| Bienvenida | `before/celular-dark-bienvenida.png` | _pendiente_ | — |
| Categorías (configuración) | `before/celular-dark-setup-categorias.png` | _pendiente_ | — |
| Inicio (primer uso) | `before/celular-dark-inicio-primer-uso.png` | _pendiente_ | — |
| Inicio (demo) | `before/celular-dark-inicio-demo.png` | _pendiente_ | — |
| Hoja «¿Qué quieres registrar?» | `before/celular-dark-hoja-agregar.png` | _pendiente_ | — |
| Formulario de movimiento | `before/celular-dark-formulario-movimiento.png` | _pendiente_ | — |
| Asistente (vista previa) | `before/celular-dark-asistente-vista-previa.png` | _pendiente_ | — |
| Movimientos | `before/celular-dark-movimientos.png` | _pendiente_ | — |
| Plan › Planes | `before/celular-dark-plan-planes.png` | _pendiente_ | — |
| Plan › Calendario | `before/celular-dark-plan-calendario.png` | _pendiente_ | — |
| Plan › Metas | `before/celular-dark-plan-metas.png` | _pendiente_ | — |
| Plan › Periodos | `before/celular-dark-plan-periodos.png` | _pendiente_ | — |
| Plan › Proyección | `before/celular-dark-plan-proyeccion.png` | _pendiente_ | — |
| Estadísticas | `before/celular-dark-estadisticas.png` | _pendiente_ | — |
| Ajustes (índice) | `before/celular-dark-ajustes.png` | _pendiente_ | — |
| Ajustes › Categorías | `before/celular-dark-ajustes-categorias.png` | _pendiente_ | — |
| Ajustes › Copia de seguridad | `before/celular-dark-ajustes-copia.png` | _pendiente_ | — |
| Ajustes › Notificaciones | `before/celular-dark-ajustes-notificaciones.png` | _pendiente_ | — |
| Cuenta | `before/celular-dark-cuenta.png` | _pendiente_ | — |
| Pro | `before/celular-dark-pro.png` | _pendiente_ | — |

## Hallazgos del «antes» (medidos por las guardas)

- **B1** · Categorías partidas a media palabra en la configuración inicial, en los cuatro idiomas y
  en los tres tamaños («Teléfon|o», «Mascot|as», «Combu|stible», «Inversio|nes», «Cuidad|o person|al»).
- **B2** · El botón flotante «Agregar movimiento» tapa, en algún punto del desplazamiento,
  «¿Cómo se calculó?», «¿Me alcanza?», «Marcar pagado…», «Marcar recibido…», «Actualizar saldo» y
  hasta la fila «Agregar movimiento» de su propia hoja; en Planes tapa una meta y «Nuevo plan».
- **B3** · Tres controles «Agregar» en Inicio (pestaña, botón flotante y botón del héroe).
- **B10** · Selectores recortados en Movimientos ya a 412 px («Realizados y previstos»,
  «Todas las categorías») y en Ajustes a 320 px.
- **C1** · En el primer uso la primera tarjeta es «Tu primer movimiento», no la cifra principal; la
  demo no muestra ingresos/gastos en la primera pantalla y ocupa más de 3 pantallas.
- **C2** · En Movimientos el cuadro de búsqueda queda a 1013 px (segunda pantalla) y no se ve
  ninguna fila sin desplazarse.
- **C3** · Ajustes es una sola página de más de 12 pantallas; `/ajustes/<id>` no existe.
