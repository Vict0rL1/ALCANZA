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
- [ ] **B3.** Tap **Ocultar importes** → the amount shows **$-----** and the button now says
  **Modo discreto**. Tap it → discreet mode (lists also blur descriptions); the button says **Mostrar todo**.
  Tap it → $400.00 is back.

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
- [ ] **D3.** In Movimientos, tap **Exportar CSV** → a `.csv` file downloads.

## E. Plans

- [ ] **E1.** **Plan** → tab **Planes** → **Nuevo plan** → **Controlar un gasto**. «Límite máximo»
  **100**; tap the chips **Restaurantes y café** and **Transporte**. You see «Periodo en curso: …»
  with the current month. Tap **Guardar** → «Plan guardado», **$40.50 / $100.00**, **40 %**,
  «Quedan **$59.50**» (25 + 12 + 3.50 = 40.50).

## F. Statistics

- [ ] **F1.** **Inicio** → link **Estadísticas** (below the main card). The month shows
  Ingresos $0.00 «Sin comparación» and Gastos **$40.50**. The future balance is not drawn; instead
  it says «El saldo futuro se muestra con al menos dos semanas de historial…».

## G. Settings

- [ ] **G1.** **Ajustes** → language **English** → the bottom bar reads Home · Transactions · Add ·
  Plan · Settings, and Home says «You can spend». Go back to Settings and choose **Español**.
- [ ] **G2.** Theme **Claro** → the app turns light at once. Choose **Oscuro** again.
- [ ] **G3.** **Hacer copia ahora** → «Copia local guardada»; the list shows «… · 3 movimientos ·
  1 cuenta».
- [ ] **G4.** **Borrar todos los datos** → the **Borrar todo** button stays disabled until you tick
  the box and type BORRAR. Tap **Cancelar** (nothing is deleted).

## H. Account and Pro

- [ ] **H1.** In Ajustes, tap **Ver cuenta y sincronización** → «Modo invitado», with an explanation
  that there are no Google or Apple buttons because there is no sign-in service yet.
- [ ] **H2.** In Ajustes, tap **Descubrir Pro** → no price and no «Suscribirse» or «Comprar» button.

---

## I. Things this test found

- **Plans intro not shown.** The master prompt asks for a 3-screen introduction the first time you
  open Plans. It only appears when you have no plans *and* no goals, and the reserve from step A6
  counts as a goal, so in this story it never appears.
- **Stacked messages.** If you act quickly (C1 → C3 → D2), up to three messages stack at the top
  of the phone screen and cover the page for a few seconds.
- **Fixed while writing this test:** the local backup list said «1 cuentas»; it now says «1 cuenta».

## J. Known gaps (these should FAIL today)

Listed so you can confirm them yourself. Each one is in the master prompt but not built yet.

- [ ] Home: no ‹ period › arrows to look at an earlier month, and no «you're viewing another period»
  banner.
- [ ] Home: the main card has no INCOME / EXPENSES boxes and no «AVAILABLE · N %» bar (those figures
  are only inside «¿Cómo se calculó?»).
- [ ] Home: no avatar in the header that opens your account.
- [ ] Movimientos: no filters for amount range or source, and only one category at a time.
- [ ] Movimientos: «Seleccionar» can only delete; it cannot change category or tags in bulk.
- [ ] Movimientos: swiping a row only deletes; swiping the other way does not edit.
- [ ] New movement: Categoría is a plain list, not a searchable picker with groups and «+ Nueva
  categoría»; there is no «Repetir» switch.
- [ ] Goals: no daily progress chart and no estimated finish date.
- [ ] Dictation: no waveform while you speak.
- [ ] Not possible without services (needs your decision): sign in with Google/Apple, cloud sync,
  real Pro purchase, notifications while the app is closed, remote voice and receipt reading.
