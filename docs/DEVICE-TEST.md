# Prueba en dispositivos reales (unos 20 minutos)

Las pruebas automáticas usan Chromium en una computadora. Lo que solo se ve en un teléfono de verdad
(instalar, la hoja Compartir, la cámara, el dictado, el modo avión, «Pegar» en el iPhone) se comprueba
aquí, a mano. **La hace Victor** con la dirección pública (o la de un despliegue de prueba de un PR).

Nadie ha hecho todavía esta prueba: hasta que la tabla de abajo esté rellena, ningún documento debe
decir que Clara «funciona en el iPhone» o «en Android».

## Dónde

| Código | Dispositivo | Cómo se abre Clara |
|---|---|---|
| **iS** | iPhone | Pestaña de **Safari** |
| **iA** | iPhone | **App instalada** (Safari › Compartir › Agregar a inicio) |
| **AA** | Android | **App instalada** desde Chrome |
| **E** | Computadora | Chrome, Edge o Safari (pestaña o instalada) |

En el iPhone, la pestaña de Safari y la app instalada tienen **datos separados** (`docs/RESTORE.md`).

## Resultados

Copia esta tabla en un aviso «Beta: comentario semanal» (`.github/ISSUE_TEMPLATE/beta-feedback.md`).
Marca ✅ (bien), ❌ (mal: describe qué pasó debajo) o — (no se prueba ahí).

| # | Paso | iS | iA | AA | E |
|---|---|---|---|---|---|
| 1 | Instalar | — | | | |
| 2 | Configuración inicial | | | | |
| 3 | Gasto y «Deshacer» | | | | |
| 4 | Asistente: pegar desde Notas | | | | |
| 5 | Dictado | | | | — |
| 6 | Foto de un recibo | | | | — |
| 7 | Niveles de privacidad | | | | |
| 8 | Cuatro idiomas | | — | — | |
| 9 | Modo avión y recargar | | | | — |
| 10 | Copia a Archivos y restaurar en instalación nueva | | | | |
| 11 | Aviso de versión nueva tras desplegar | | | | |
| 12 | Pantalla de datos más nuevos | — | — | — | |
| 13 | Enlace de Clara abre la app instalada (Android) | — | — | | — |
| 14 | Informe de errores y «Enviar comentarios» | | | | |

Anota también: modelo del teléfono, versión de iOS / Android y del navegador (Ajustes › Enviar
comentarios ya la escribe por ti) y la versión de Clara (Ajustes › Acerca de).

## Pasos

### 1. Instalar (iA, AA, E)

Ajustes › **Instalar Clara** explica lo que permite ese navegador.

- **iPhone**: Safari › botón Compartir › **Agregar a inicio** › **Agregar**. Abre Clara desde el icono.
- **Android / computadora**: Ajustes › Instalar Clara › **Instalar Clara** (o menú ⋮ › «Instalar Clara»).

Bien si: se abre sin la barra del navegador y Ajustes › Instalar Clara dice que ya está instalada.

### 2. Configuración inicial

En una Clara vacía: sigue la bienvenida hasta **Empezar a usar Clara**.

Bien si: Inicio muestra **Puedes gastar** como primera tarjeta, con la cifra que esperas. Debajo
aparece «Protege tus datos».

### 3. Gasto y «Deshacer»

**+** (o «Agregar») › **Gasto** › importe `4.50` › **Guardar**.

Bien si: aparece «Movimiento guardado» con **Deshacer**; al tocar Deshacer el gasto desaparece de
Movimientos y «Puedes gastar» vuelve a la cifra anterior.

### 4. Asistente: pegar desde Notas

1. En **Notas**, escribe dos líneas: `café 4.50` y `uber 12 ayer`. Selecciona y copia.
2. Clara › **+** › **Escribir o dictar** › mantén pulsado el campo **Texto** › **Pegar** › **Analizar**.

Bien si: la vista previa tiene 2 filas (4.50 hoy, 12 ayer) y nada se guarda hasta **Registrar 2
movimientos**.

Extra (iS, iA): copia `Starbucks 12.50` en Notas › Clara › **+** › **Pegar del atajo**. Si el iPhone
muestra el botón **Pegar**, tócalo. Bien si: se abre la vista previa con una fila de 12.50 y el aviso
«Llegó desde un atajo». Copia un texto sin número y repite: Clara debe decir que no hay importe y no
crear nada.

### 5. Dictado (iS, iA, AA)

Asistente › **Dictar** › di «café cuatro con cincuenta» › **Detener**.

Bien si: el texto aparece en el campo. Si el navegador no lo permite, Clara lo dice («Este navegador no
permite dictar»): anota cuál de las dos cosas pasó; las dos son correctas.

### 6. Foto de un recibo (iS, iA, AA)

Asistente › **Foto de un recibo** › toma la foto de un recibo real.

Bien si: aparece una fila con la foto para revisar (con o sin importe leído, según el navegador) y no se
registra nada hasta **Registrar**.

### 7. Niveles de privacidad

En Inicio, toca el botón del ojo tres veces: **Visible** → **Importes ocultos** → **Discreto (importes y
descripciones)** → Visible.

Bien si: en cada nivel las cifras (y en «Discreto», también las descripciones) se ocultan en Inicio y en
Movimientos, y vuelven al final.

### 8. Cuatro idiomas (iS, E)

Ajustes › **Formato** › **Idioma**: English, Português, Français y vuelve a Español. En cada uno mira
Inicio y la hoja **+**.

Bien si: ningún texto se sale, se corta ni se monta sobre otro, y no queda nada en otro idioma.

### 9. Modo avión y recargar (iS, iA, AA)

Con Clara abierta al menos una vez antes: activa el **modo avión**, cierra Clara del todo (o recarga la
pestaña) y vuelve a abrirla.

Bien si: abre con tus datos y puedes registrar un gasto. Desactiva el modo avión al terminar.

### 10. Copia a Archivos y restaurar en una instalación nueva

1. Donde tienes datos: Ajustes › **Copias de seguridad** › **Exportar copia**.
   - iPhone / Android: se abre la hoja **Compartir** › **Guardar en Archivos** (o Drive).
   - Computadora: se descarga el archivo.
2. Ábrelo en una Clara **vacía**:
   - iPhone: si exportaste en Safari (iS), la app instalada (iA) recién instalada está vacía.
   - Android / computadora: una ventana de incógnito o privada.
3. Bienvenida › **Restaurar una copia** › elige el archivo › revisa el resumen › **Restaurar**.

Bien si: «Puedes gastar», los movimientos y los ajustes son iguales a los del sitio original.
Guía completa: `docs/RESTORE.md`.

### 11. Aviso de versión nueva tras desplegar

Necesita un despliegue a producción nuevo (cualquier PR fusionado en `main`).

1. Antes de fusionar: abre Clara y mira la compilación en Ajustes › **Acerca de**.
2. Fusiona y espera a que termine `deploy-production` en GitHub.
3. Vuelve a Clara (ciérrala y ábrela, o espera unos minutos con ella abierta).

Bien si: aparece «Hay una versión nueva de Clara» con **Actualizar ahora**; al tocarlo, Acerca de
muestra la compilación nueva y los datos siguen ahí. Si tienes un formulario abierto, el aviso pide
terminarlo antes.

### 12. Pantalla de datos más nuevos (solo E, en una ventana privada)

Simula datos guardados por una versión futura. **Solo en una ventana de incógnito con la demostración**
(«Explorar con datos de demostración»), nunca con tus datos reales.

1. Menú › Herramientas para desarrolladores › **Consola**. Pega y pulsa Intro:

   ```js
   const r = indexedDB.open('clara', 1); r.onsuccess = () => { const s = r.result.transaction('kv', 'readwrite').objectStore('kv'); s.get('data').onsuccess = (e) => { const d = e.target.result; d.schemaVersion = 99; s.put(d, 'data') } }
   ```

2. Recarga la página.

Bien si: se ve «Estos datos son de una versión más nueva de Clara», con solo dos botones (**Recargar la
app** y **Descargar una copia de estos datos**) y sin «Empezar de nuevo». Cierra la ventana de
incógnito al terminar (se borra sola).

### 13. Enlace de Clara abre la app instalada (AA)

Mándate por correo o mensajes este enlace (con tu dirección pública) y tócalo en el Android que tiene
Clara instalada:

`https://clara.pages.dev/#/movimientos/nuevo?importe=12,50&comercio=Starbucks&source=shortcut`

Bien si: se abre la **app instalada** (sin barra del navegador) con el formulario relleno (12.50,
Starbucks, «Llegó desde un atajo») y no se guarda nada hasta **Guardar**. Anota si en cambio se abrió
una pestaña de Chrome. (En el iPhone esto se prueba con `docs/IOS-SHORTCUTS.md`.)

### 14. Informe de errores y «Enviar comentarios»

1. Ajustes › **Acerca de** › **Informe de errores**: lo normal es que esté vacío. Si no, pulsa
   **Copiar informe** y pégalo en el aviso.
2. Ajustes › **Enviar comentarios** › mira el texto completo › **Escribir correo**.

Bien si: tu app de correo se abre con ese mismo texto (versión, compilación, navegador, modo y
pantalla) y ningún importe, nota, comercio ni nombre de cuenta. Envíalo o descártalo.
