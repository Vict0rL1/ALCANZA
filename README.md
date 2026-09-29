# Margen · prototipo local de finanzas personales

Margen ayuda a responder, con tus propios números:

- ¿Cuánto puedo gastar después de reservar mis pagos y ahorros?
- ¿Cómo afecta una compra a mi presupuesto?
- ¿Cuánto debo apartar para alcanzar una meta?
- ¿En qué fechas podría quedarme corto de dinero?

Pensado primero para personas con presupuestos ajustados, estudiantes e ingresos
variables, pero útil para cualquiera.

> **Estado: prototipo local.** Funciona solo en tu navegador. No hay cuentas de usuario,
> ni servidor, ni conexión con bancos, ni IA. Los datos se guardan en este navegador
> (`localStorage`): **si borras los datos del navegador se pierden** y **todavía no se
> sincronizan entre dispositivos**. Usa *Ajustes → Copia de seguridad* para exportarlos.

---

## 1. Requisitos

- **Node.js 22.12 o superior** (recomendado: la versión LTS 22 o 24).
  Descárgalo de <https://nodejs.org> e instálalo con las opciones por defecto.
- **npm** (se instala junto con Node.js).
- Un navegador moderno (Chrome, Edge, Firefox o Safari recientes).

Para comprobarlo, abre una terminal (en Windows: «Símbolo del sistema» o «PowerShell»;
en Mac: «Terminal») y escribe:

```bash
node --version
npm --version
```

`node --version` debe mostrar `v22.12.0` o superior.

> **Copia solo las líneas de comandos.** No copies textos que empiecen con `#`:
> en la terminal de Mac no se ignoran y causan errores como `Invalid tag name "#"`.

No hace falta ninguna cuenta, clave ni archivo `.env`.

## 2. Descargar e instalar (solo la primera vez)

Descarga el proyecto desde GitHub (necesitas `git`; en Mac, si no lo tienes, el sistema
te ofrecerá instalarlo la primera vez que lo uses):

```bash
cd ~/Desktop
git clone https://github.com/Vict0rL1/ALCANZA.git
cd ALCANZA
npm install
```

Esto crea la carpeta `ALCANZA` en tu Escritorio. **Todos los comandos siguientes deben
ejecutarse dentro de esa carpeta.** Si abres una terminal nueva, entra primero con
`cd ~/Desktop/ALCANZA`. Si ves `Could not read package.json`, es que no estás dentro
de la carpeta del proyecto.

## 3. Abrir la aplicación

```bash
npm run dev
```

La terminal mostrará una dirección como `http://localhost:5173/`. Ábrela en el navegador.
Para detener la app, vuelve a la terminal y pulsa `Ctrl + C`.

### Probarla en tu celular (misma red Wi-Fi)

```bash
npm run dev -- --host
```

La terminal mostrará también una dirección «Network», por ejemplo
`http://192.168.1.20:5173/`. Escríbela en el navegador del celular. Los datos del
celular son independientes de los de la computadora.

### Versión optimizada (como quedaría publicada)

```bash
npm run build
npm run preview
```

`build` genera la carpeta `dist/` y `preview` la sirve en `http://localhost:4173/`.

## 4. Cómo usarla

1. **Primera vez:** elige «Configurar con mis datos» (moneda, saldo de hoy, próximo
   ingreso, pagos pendientes y reserva) o «Explorar con datos de demostración».
2. **Inicio:** cuánto puedes gastar hasta tu próximo ingreso, por día y por semana,
   en qué se va tu saldo, avisos y próximos pagos. Pulsa «¿Cómo se calculó?» para ver
   la cuenta completa.
3. **Movimientos:** registra gastos, ingresos, transferencias y devoluciones
   (realizados o previstos). Busca, filtra, edita y elimina (con «Deshacer»).
   Arriba verás el resumen del mes: ingresos, gasto neto, gasto por categoría y límites
   mensuales opcionales por categoría.
4. **¿Me alcanza?:** escribe un precio y compara antes y después. No guarda nada hasta
   que pulses «Registrar esta compra» y luego «Guardar».
5. **Plan:** calendario de pagos (marcar pagado, omitir), metas (apartar/liberar) y
   proyección de 30 días.
6. **Ajustes:** idioma, formato de números y fechas, zona horaria, cuentas (y tarjetas con
   límite, tasa y fechas), categorías personalizadas, copia de seguridad,
   reinicio de la demo y borrado de datos.

La demostración muestra un aviso morado permanente: **todos sus datos son ficticios**.

## 5. Pruebas

### Pruebas de la lógica financiera (rápidas)

```bash
npm test
```

Comprueban redondeos, saldos negativos, ingreso retrasado, devolución parcial,
transferencias, pagos recurrentes marcados como realizados, reservas que no se
descuentan dos veces, guardado repetido y recuperación, copias inválidas, cambio de mes
y fechas límite (29/30/31, años bisiestos, zona horaria).

### Pruebas en el navegador (celular 390 px, celular 320 px y escritorio)

La primera vez hay que descargar el navegador de pruebas:

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

Recorren los flujos principales (configuración, demo, movimientos, «¿Me alcanza?»,
calendario, metas, proyección, copias de seguridad), comprueban que no haya
desplazamiento horizontal (también con texto al 200 %), la navegación con teclado y
una auditoría automática de accesibilidad (axe) en modo claro y oscuro.

### Todas las comprobaciones

```bash
npm run check
```

Revisa tipos, estilo de código y pruebas de lógica.

## 6. Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Abre la app en modo desarrollo (se recarga al guardar cambios) |
| `npm run build` | Comprueba tipos y genera la versión optimizada en `dist/` |
| `npm run preview` | Sirve la versión optimizada |
| `npm test` | Pruebas de lógica (Vitest) |
| `npm run test:e2e` | Pruebas en navegador (Playwright) |
| `npm run typecheck` | Comprobación de tipos de TypeScript |
| `npm run lint` | Revisión de estilo y errores comunes (oxlint) |
| `node scripts/generate-icons.mjs` | Regenera los iconos PNG de la PWA desde `public/icon.svg` |

## 7. Estructura del proyecto

```
src/
  domain/      Lógica financiera pura (dinero, fechas, recurrencias, saldos,
               presupuesto, metas, proyección, validación, operaciones) + pruebas
  storage/     Guardado en el navegador, copias de seguridad y migraciones
  state/       Estado de la app y conexión con el almacenamiento
  ui/          Pantallas, componentes, gráficos y formato
  i18n/        Textos en español (es.ts) e inglés (en.ts)
  demo/        Generador de datos de demostración
tests/e2e/     Pruebas en navegador
docs/          FORMULAS.md (cálculos) y ROADMAP.md (siguientes fases)
public/        Manifiesto PWA e iconos
```

La interfaz, la lógica financiera y el almacenamiento están separados: para añadir un
servidor más adelante basta con otra implementación de `DataRepository`
(`src/storage/repository.ts`), sin tocar fórmulas ni pantallas.

## 8. Qué incluye y qué no

**Incluye:** todo lo descrito arriba, persistencia local, validación de copias,
tarjetas de crédito (la compra es un gasto de la tarjeta y el pago una transferencia),
interfaz en español e inglés (se elige en la bienvenida o en Ajustes),
modo oscuro y diseño desde 320 px hasta escritorio. En la versión compilada
(`npm run build` + `npm run preview`, o publicada con https) la app se guarda en el
dispositivo y **abre sin internet** tras la primera visita; cuando hay una versión nueva
aparece el aviso «Actualizar ahora». En modo desarrollo (`npm run dev`) y al abrirla por
IP en la red local no se activa el uso sin conexión (el navegador lo exige así).

**No incluye todavía (y la app no finge tenerlo):** cuentas de usuario, sincronización,
conexión bancaria, varias monedas, notificaciones del teléfono, límites e intereses de
tarjetas, IA. Ver `docs/ROADMAP.md`.

## 9. Solución de problemas

- **`npm: command not found` / `node no se reconoce`:** instala Node.js y abre una
  terminal nueva.
- **`Could not read package.json` / `ENOENT`:** no estás dentro de la carpeta del
  proyecto. Ejecuta `cd ~/Desktop/ALCANZA` (o la ruta donde lo descargaste).
- **`Invalid tag name "#"`:** copiaste un comentario que empieza con `#`. Copia solo el
  comando.
- **La versión de Node es menor que 22.12:** instala la LTS actual desde nodejs.org.
- **El puerto 5173 está ocupado:** Vite usará otro (mira la dirección en la terminal).
- **«No se puede guardar en este navegador»:** el navegador bloquea el almacenamiento
  (por ejemplo, navegación privada estricta). Usa una ventana normal.
- **Quiero empezar de cero:** *Ajustes → Borrar todos los datos* (exporta antes una copia).

Las fórmulas y decisiones financieras están en [`docs/FORMULAS.md`](docs/FORMULAS.md).
