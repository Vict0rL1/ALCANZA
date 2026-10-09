# Clara — hands-on test (about 15 minutes)

A short story you follow in the app, with round numbers you can check by hand. Each step says
what to do and what you should see. Tick the box if it matches; if not, write down what you saw.

The same steps run automatically in `tests/e2e/manual-test.spec.ts` (same numbers, fixed date),
so this document is checked every time the test suite runs.

## 0. Open the app (once)

You need Node.js 22.12 or newer (see `README.md` §1). In a terminal:

```bash
git clone https://github.com/Vict0rL1/ALCANZA.git
cd ALCANZA
git checkout feature/clara-v2
npm install
npm run build
npm run preview
```

If you already have the folder: `cd ALCANZA`, then `git fetch origin`, `git checkout feature/clara-v2`
and `git pull`, then `npm install`, `npm run build` and `npm run preview`.

Clara v2 lives on the `feature/clara-v2` branch until the pull request is merged: the default
branch (`main`) still has the previous version.

Open **http://localhost:4173** in a **private/incognito window** (so you start with no data).
To test on your phone, see «Probarla en tu celular» in `README.md`.

> Amounts below are written as `$400.00`. If your browser suggests another currency, the
> numbers are the same but the format can differ (for example `$ 400` or `400,00 €`).

---

## A. First-time setup

- [ ] **A1.** You see «Hola, esto es Clara». At the top, tap **English** → the whole screen switches
  to English at once («Hi, this is Clara»). Tap **Español** to go back.
- [ ] **A2.** Tap **Configurar con mis datos** → «Tus categorías». You see «Gastos · 16 seleccionadas»
  and «Ingresos · 6 seleccionadas». Untick **Mascotas** → the counter changes to
  «Gastos · 15 seleccionadas». Tap **Continuar**.
- [ ] **A3.** «Saldo disponible»: **1200**. «Periodo del presupuesto»: **Hasta mi próximo ingreso**.
  Tap **Continuar**.
- [ ] **A4.** «Importe esperado»: **800**. «Fecha del próximo ingreso»: **10 days from today**.
  Tap **Continuar**.
- [ ] **A5.** Tap **Agregar un pago**: Nombre **Renta**, Importe **600**, «Próxima fecha de pago»
  **5 days from today**. Tap **Continuar**.
- [ ] **A6.** «Cantidad reservada»: **200**. Tap **Ver resumen** → **$400.00**
  (1200 − 600 for rent − 200 reserved). Tap **Empezar a usar Clara**.
- [ ] **A7.** Home shows «Puedes gastar **$400.00**», «· **10 días**» and «Por día **$40.00**»
  (400 ÷ 10). Reload the page → still $400.00, and setup does not appear again.

## B. Home

- [ ] **B1.** A 3-step guide appears («Paso 1 de 3»). Tap **Omitir**. Reload → it does not come back.
- [ ] **B2.** Tap **¿Cómo se calculó?** → you see $1,200.00, $600.00 and $200.00 in the explanation.
  Tap it again to close it.
- [ ] **B3.** Tap the lock button in the top-right corner of the main card (**Ocultar importes**) → the
  amount shows **$-----** and the button's tooltip now says **Modo discreto**. Tap it → discreet mode
  (lists also blur descriptions); the tooltip says **Mostrar todo**. Tap it → $400.00 is back.
- [ ] **B4.** The main card shows the boxes **INGRESOS $0.00** and **GASTOS $0.00** and the bar
  **Disponible · 33 %** (400 of 1,200 + 0). «¿Cómo se calculó?» ends with the line that explains the
  percentage.
- [ ] **B5.** The header shows a round avatar (a person icon with a green dot = guest) instead of the
  old «Prototipo local» badge. Tap it → the **Cuenta** screen; go back with **Inicio**.
- [ ] **B6.** There is no floating **+** on Home or on Plan: the only way to add is the green **+** tab
  (phone) or **Agregar** in the sidebar (desktop).

## C. Adding movements

- [ ] **C1.** Tap the green **+**. The sheet «¿Qué quieres registrar?» offers **Gasto**, **Ingreso**,
  **Transferencia** and **Escribir o dictar**. Choose **Gasto**: Importe **25**, Categoría
  **Restaurantes y café**, open **Más detalles**, Nota **Almuerzo**, tap **Guardar** → message
  «Movimiento guardado». Home: **$375.00**, por día **$37.50**.
- [ ] **C2.** **+** → **Escribir o dictar**. Type `taxi 12 y café 3.50` and tap **Analizar** → two rows:
  **12.00 · Transporte** and **3.50 · Restaurantes y café**. Go to **Inicio** without saving →
  still **$375.00** (nothing is saved before you confirm).
- [ ] **C3.** Repeat C2 and this time tap **Registrar 2 movimientos** → «2 movimientos registrados».
  Home: **$359.50** (375 − 12 − 3.50), por día **$35.95**.

## D. History

- [ ] **D1.** **Movimientos** → type `taxi` in the search box → only one row.
- [ ] **D2.** Search `almuerzo`, open it, tap **Eliminar** → «Movimiento enviado a la papelera» with
  **Deshacer**. Tap **Deshacer** → Home is back to **$359.50**.
- [ ] **D3.** In Movimientos, open the **⋯** menu (top right) and tap **Exportar CSV** → a `.csv` file
  downloads. The same menu holds Estadísticas, Favoritos, Plantillas, Papelera and Importar CSV.
- [ ] **D4.** Tap **Filtros** → a bottom sheet with chips (Tipo, Estado, Cuenta…) and dates. Pick
  **Gasto** and **Ver resultados** → a chip **Gasto** appears under the search box and the line reads
  «3 movimientos · …». Tap the chip's × → all rows are back. The month summary («Sept 2026 ·
  Gasto neto $40.50») is collapsed; tap it to open the bars.

## E. Plans

- [ ] **E1.** **Plan** → tab **Planes** → **Nuevo plan** → **Controlar un gasto**. «Límite máximo»
  **100**; tap the chips **Restaurantes y café** and **Transporte**. You see «Periodo en curso: …»
  with the current month. Tap **Guardar** → «Plan guardado», **$40.50 / $100.00**, **40 %**,
  «Quedan **$59.50**» (25 + 12 + 3.50 = 40.50).

## F. Statistics

- [ ] **F1.** **Inicio** → link **Estadísticas** (top-right corner of the main card). The month shows
  Ingresos $0.00 «Sin comparación» and Gastos **$40.50**. The future balance is not drawn; instead
  it says «El saldo futuro se muestra con al menos dos semanas de historial…».

## G. Settings

- [ ] **G1.** **Ajustes** is a grouped list (General · Gestión de gastos · Datos y seguridad · Ayuda)
  with the account and Pro rows on top and a search box. Tap the row **Formato** → language
  **English** → the bottom bar reads Home · Transactions · Add · Plan · Settings, and Home says «You
  can spend». Back in Settings, open **Format** again and choose **Español**.
- [ ] **G2.** On the same screen, theme **Claro** → the app turns light at once. Choose **Oscuro** again.
  The **Ajustes** link at the top goes back to the index.
- [ ] **G3.** Index → row **Copias locales automáticas** → **Hacer copia ahora** → «Copia local
  guardada»; the list shows «… · 3 movimientos · 1 cuenta».
- [ ] **G4.** Index → row **Demostración y borrado** → **Borrar todos los datos** → the **Borrar todo**
  button stays disabled until you tick the box and type BORRAR. Tap **Cancelar** (nothing is deleted).
- [ ] **G5.** Index → type `tema` in **Buscar en Ajustes** → only the rows whose title or keywords
  match (Formato among them). Clear the search.

## H. Account and Pro

- [ ] **H1.** In Ajustes, tap the top row **Modo invitado · Ver cuenta y sincronización** → «Modo
  invitado», with an explanation that there are no Google or Apple buttons because there is no sign-in
  service yet.
- [ ] **H2.** In Ajustes, tap the row **Descubrir Pro** → no price and no «Suscribirse» or «Comprar» button.

## K. Round 3 checks

- [ ] **K1.** **+** → **Escribir o dictar**. Paste three lines (`café 4.50` ⏎ `uber 12` ⏎
  `supermercado 45.20`) and tap **Analizar** → **three rows** with 4.50, 12.00 and 45.20. The box
  grows with the text; **Ctrl+Enter** also analyzes.
- [ ] **K2.** Replace the text with `rent 1,450` → **one row of 1,450.00** (not 1 + 450). Go back
  without registering.
- [ ] **K3.** **Ajustes** → **Formato** → **Français** → the toast reads **«Réglage enregistré»** (in
  French, not Spanish). Choose **Español** again → «Ajuste guardado».
- [ ] **K4.** **Inicio** → tap **‹** next to the month in the main card → the label says the previous
  month, an amber banner says **«Estás viendo otro periodo»**, the card shows the figures at the close
  of that month and there is no «¿Me alcanza?». Tap **›** (or **Volver al periodo actual**) → back to
  **$359.50**; nothing changed.
- [ ] **K5.** **+** → **Gasto** → tap **Categoría** → a sheet with a search box, **Recientes** and the
  groups. Type `salu` → only **Salud**; press **Esc** → the sheet closes and the focus is
  back on the field.
- [ ] **K6.** Still in the form: Importe **10**, Nota **Gimnasio**, switch **Repetir** on, Frecuencia
  **Cada mes**, tap **Guardar** → «Movimiento guardado y programado creado». Home: **$349.50**
  (359.50 − 10, not − 20). **Plan › Calendario** lists **Gimnasio** with «próximo: 28 oct».

---

## I. Things this test found

- **Fixed in round 2:** the Plans intro now appears the first time you open Plan (it no longer
  depends on having no goals); on the phone only one message shows at a time and a replaced
  «Deshacer» stays available for 8 s; the local backup list says «1 cuenta».

## J. Known gaps (these should FAIL today)

Listed so you can confirm them yourself. Each one is in the master prompt but not built yet.

- [ ] Home: no ‹ period › arrows to look at an earlier month, and no «you're viewing another period»
  banner.
- [ ] Movimientos: no filters for amount range or source, and only one category at a time.
- [ ] Movimientos: «Seleccionar» can only delete; it cannot change category or tags in bulk.
- [ ] Movimientos: swiping a row only deletes; swiping the other way does not edit.
- [ ] New movement: Categoría is a plain list, not a searchable picker with groups and «+ Nueva
  categoría»; there is no «Repetir» switch.
- [ ] Goals: no daily progress chart and no estimated finish date.
- [ ] Dictation: no waveform while you speak.
- [ ] Not possible without services (needs your decision): sign in with Google/Apple, cloud sync,
  real Pro purchase, notifications while the app is closed, remote voice and receipt reading.
