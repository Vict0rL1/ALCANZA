# Registro de cambios

Todos los cambios importantes de Clara se anotan aquí. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones siguen
[SemVer](https://semver.org/lang/es/). Los detalles y los porqués están en `docs/DECISIONS.md`.

## [Sin publicar]

### Novedades

- **Copia de seguridad por la hoja Compartir**: en el iPhone (y donde el navegador lo permita),
  «Exportar copia» abre Compartir para **Guardar en Archivos**; cancelar no es un error.
- **Ajustes › Instalar Clara**: explica solo lo que ese navegador permite (botón de instalar, los pasos
  de Safari o «ya está instalada») y avisa de que la app instalada del iPhone empieza vacía.
- **«Protege tus datos»** en Inicio: pide al navegador que no borre los datos y propone la primera
  copia.
- **Restaurar una copia desde la bienvenida**, también cifrada: para estrenar otro dispositivo o la
  app instalada sin inventar una configuración.
- **Enlaces de Atajos de iPhone**: `#/movimientos/nuevo?importe=12,50&comercio=Starbucks&source=shortcut`
  rellena el formulario y sugiere la categoría; nunca guarda solo. Origen «Atajo» en los filtros.
- **«Pegar del atajo»** en la hoja «+»: lee lo que copió un atajo (tras un toque) y abre la vista
  previa del asistente. Ajustes › **Atajos** explica los dos caminos (portapapeles y enlace) y copia las plantillas.
- **Ajustes › Enviar comentarios**: un correo con datos técnicos (versión, navegador, pantalla) que
  ves entero antes de enviarlo.
- **Ajustes › Acerca de › Informe de errores**: los últimos 20 fallos en este dispositivo, sin
  importes, notas, comercios ni nombres, con «Copiar informe» y «Borrar informe».

### Cambios

- El CSV del historial tiene una columna final **«Origen»** (Manual, Asistente, Importado, Programado, Favorito o Atajo).
- La versión se publica en Cloudflare Pages desde GitHub Actions: cada PR pasa comprobaciones,
  pruebas en tres tamaños y un presupuesto de tamaño, y obtiene un despliegue de prueba con pruebas
  rápidas (`docs/RELEASE.md`). Volver atrás solo si el esquema de datos es el mismo (`docs/ROLLBACK.md`).

### Correcciones

- Sin conexión: la app abre aunque el servidor añada `Vary: Origin` a sus archivos.
- Fichas de categoría de la configuración repartidas según el ancho real: ninguna palabra se parte ni se
  sale; sin guiones automáticos en las pestañas. En francés, «Aides publiques».
- Contraste suficiente en el botón secundario de la guía al pasar el puntero.

## [1.0.0-beta.1] — primera beta pública

Clara es un prototipo local de finanzas personales: tus datos viven solo en este navegador, sin
cuentas, sin servidor, sin conexión con el banco y sin IA. Esta beta reúne tres rondas de trabajo.

### Novedades

- **«Puedes gastar»**: lo que queda hasta tu próximo ingreso después de reservar pagos y apartados,
  con «¿Cómo se calculó?», ingresos y gastos del periodo y un resumen por día.
- **Navegar periodos** en Inicio con ‹ ›: los periodos pasados se ven al cierre y en solo lectura.
- **Registrar** desde una sola entrada (la pestaña «+»): gasto, ingreso, transferencia, devolución,
  favoritos, plantillas y el asistente que entiende «café 4.50» o varias líneas pegadas.
- **Repetir** un movimiento al guardarlo crea su programado sin contarlo dos veces.
- **Selector de categoría** con búsqueda, recientes, grupos y alta rápida, el mismo en toda la app.
- **Historial** con búsqueda, filtros combinables (categorías, etiquetas, importe y origen), acciones
  en lote con «Deshacer», deslizar para eliminar o editar, papelera y exportación CSV.
- **Plan**: límites por categoría con alertas, metas con gráfico y fecha estimada, gastos
  planificados, calendario de pagos, presupuestos por periodo, proyección a 30 días y escenarios.
- **Estadísticas** por periodo con comparación, gráficos accesibles con tabla y exportación a PDF.
- **Ajustes** por secciones con búsqueda: cuentas y tarjetas de crédito, categorías, reglas,
  etiquetas, copias locales automáticas, copia cifrada con contraseña, bloqueo con PIN, idioma
  (español, inglés, portugués y francés), moneda y formato, modo privado y tema claro u oscuro.
- **Sin conexión**: la app funciona sin internet una vez abierta y avisa cuando hay una versión nueva.
- **Datos guardados en IndexedDB**, con migración probada desde las versiones anteriores y una copia
  de los datos originales antes de migrar.

### Correcciones

- Pegar varias líneas en el asistente ya no pierde movimientos; una coma entre dígitos
  («rent 1,450») nunca parte un importe.
- Plan sin desplazamiento horizontal a 320 px en los cuatro idiomas; avisos en el idioma elegido.
- «Transferencia a ahorros» se sugiere como transferencia y nunca como gasto; un importe
  desproporcionado pide confirmación una vez.
- Agrupar los miles al escribir nunca cambia el importe; un texto inválido muestra su error.
- Las hojas se cierran con Esc o deslizando y devuelven el foco; con «reducir movimiento» no hay
  animaciones.
- Dos pestañas (o dos versiones) ya no se sobrescriben en silencio, y un fallo al guardar se avisa
  sin perder lo último guardado.

### Conocido

- Los datos están solo en este navegador: si se borran los datos del sitio, se pierden. Exporta una
  copia con frecuencia. En iPhone, la app instalada en la pantalla de inicio tiene datos separados de
  Safari.
- No hay sincronización, cuentas, notificaciones del teléfono ni conexión con el banco.
- El dictado y la foto del recibo dependen de lo que ofrezca el navegador; si no hay soporte, se
  escribe a mano.
- Volver a una versión anterior después de una migración de datos no es posible: la versión vieja no
  sabe leer los datos nuevos (ver `docs/ROLLBACK.md`).
