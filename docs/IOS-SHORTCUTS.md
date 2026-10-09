# Atajos de iPhone y «Tocar atrás» con Clara

Clara puede recibir un gasto desde la app **Atajos** del iPhone mediante un enlace. El enlace **solo
rellena el formulario**: nunca guarda nada sin que pulses «Guardar».

> **Estado: pendiente de probar en un iPhone real (L2).** Lo que no sabemos todavía es **dónde abre
> iOS el enlace**: si en Safari o en la app instalada en la pantalla de inicio. Son dos sitios con
> **datos separados** (ver `docs/RESTORE.md`). La prueba de abajo lo aclara; hasta entonces, nada en
> Clara promete que esto sea «automático».

## El enlace

```
https://clara.pages.dev/#/movimientos/nuevo?kind=expense&importe=12.50&comercio=Starbucks&source=shortcut
```

(Cambia `clara.pages.dev` por la dirección pública real si Cloudflare añadió un sufijo.)

| Parámetro | Qué hace |
|---|---|
| `kind=expense` | Gasto (`income` para un ingreso). |
| `importe=12.50` | Importe en unidades normales. Vale «12.50», «12,50», «C$12.50», «1.234,56» o «12 USD». Si no se entiende, el campo queda vacío y Clara lo dice. Si la moneda no es la de tu presupuesto, Clara rellena el número y te avisa (no convierte). |
| `comercio=Starbucks` | Rellena el comercio y sugiere la categoría (tus reglas, lo que Clara aprendió de tus movimientos o su diccionario). |
| `source=shortcut` | El movimiento queda marcado con origen «Atajo» (filtro del historial y CSV) y el formulario muestra «Llegó desde un atajo · revisa y guarda». |

## Atajo A: pago con Apple Pay (Wallet) → formulario de Clara

1. Abre **Atajos** › pestaña **Automatización** › **+** (Nueva automatización).
2. Busca y elige **Transacción** (Wallet).
3. Elige tus tarjetas, deja **Cuando toco** marcado y elige **Ejecutar inmediatamente**. Pulsa **Siguiente**.
4. **Nuevo atajo vacío**. Añade estas acciones, en este orden:
   1. **Codificar URL** › toca «Texto» › elige la variable **Entrada del atajo** › en el menú que aparece,
      **Comercio**.
   2. **Codificar URL** otra vez › **Entrada del atajo** › **Importe**.
   3. **Texto** y escribe exactamente (los dos `[…]` son las variables de los pasos 1 y 2; insértalas desde
      la barra de variables, no las escribas):
      `https://clara.pages.dev/#/movimientos/nuevo?kind=expense&importe=[URL codificado 2]&comercio=[URL codificado 1]&source=shortcut`
   4. **Abrir URL** con la variable **Texto**.
5. Pulsa **OK**.

## Atajo B: «Tocar atrás» → formulario vacío de Clara

1. **Atajos** › pestaña **Atajos** › **+**. Nombre: `Clara · nuevo gasto`.
2. Añade **Abrir URL** con: `https://clara.pages.dev/#/movimientos/nuevo?source=shortcut`
3. En el iPhone: **Ajustes** › **Accesibilidad** › **Tocar** › **Tocar atrás** › **Doble toque** › elige
   `Clara · nuevo gasto`.

## La prueba (la hace Victor; unos 10 minutos)

Haz las dos pruebas con Clara **instalada** en la pantalla de inicio (con datos en la app instalada) y
otra vez usando Clara **solo en una pestaña de Safari** (con datos en Safari). Antes de cada prueba,
registra en esa Clara un gasto reconocible (por ejemplo «PRUEBA-ATAJO 1,00»).

| # | Clara | Atajo | ¿Dónde se abrió? (app instalada / pestaña de Safari / otro) | ¿Se ven tus datos? (aparece «PRUEBA-ATAJO» en Movimientos) | ¿Formulario relleno y con el aviso? |
|---|---|---|---|---|---|
| 1 | Instalada | A (Apple Pay) | | | |
| 2 | Instalada | B (Tocar atrás) | | | |
| 3 | Pestaña de Safari | A (Apple Pay) | | | |
| 4 | Pestaña de Safari | B (Tocar atrás) | | | |

Anota también la versión de iOS (Ajustes › General › Información).

## Qué se decide con el resultado (L3)

- **Si el enlace llega a tus datos** en la forma en que usas Clara: se queda el enlace y Ajustes ›
  «Atajos de iPhone» ofrece las dos plantillas con un botón «Copiar».
- **Si no llega** (lo esperado con la app instalada: iOS abre los enlaces en Safari, que tiene otros
  datos): se usa el **paso por el portapapeles**:
  1. El atajo hace **Copiar al portapapeles** con un texto como `Starbucks 12.50` y luego abre Clara.
  2. En Clara, la hoja «+» tiene **Pegar del atajo** (tiene que ser un toque tuyo: el navegador solo deja
     leer el portapapeles tras un toque).
  3. Se abre la vista previa del asistente con la fila leída. Si el portapapeles no tiene un importe,
     Clara lo dice y no crea nada.
- En **Android con Chrome**, los enlaces de la dirección de Clara se abren en la app instalada: se
  comprueba en `docs/DEVICE-TEST.md`.

El resultado y la decisión se anotan en `docs/DECISIONS.md`.
