# Prueba con usuarios de Clara (prototipo local)

Guía para una prueba **controlada y moderada** con pocas personas (5–8 suele bastar para
encontrar los problemas principales). No contiene resultados: se completa durante la prueba.
Nadie ha sido contactado; reclutar participantes es decisión de la persona responsable.

## 1. Antes de empezar

- **Datos ficticios siempre.** Pide a cada participante que NO use sus datos financieros
  reales. Usa el escenario de la sección 3. La app guarda todo en el navegador del dispositivo
  usado; al terminar, borra los datos (Ajustes › Demostración y reinicio › Borrar todos los
  datos) o usa una ventana/perfil del navegador solo para la prueba.
- **Consentimiento.** Explica qué se observa (cómo se usa la app, no a la persona), que se
  puede parar cuando quiera y si se toman notas o grabación de pantalla (solo con permiso).
- **Dispositivo.** Preferiblemente el celular de la persona (ver «Probar en un teléfono» en
  `README.md`) o uno de prueba. Anota modelo, sistema, navegador y si se instaló en la
  pantalla de inicio.
- **Rol del moderador.** Lee la tarea tal cual, sin señalar botones ni nombres de pantallas.
  Si la persona pregunta «¿dónde…?», responde «¿dónde lo buscarías?». Pide que piense en voz
  alta. Ayuda solo si lleva más de 3 minutos atascada, y anótalo.
- Empieza con la app **sin datos** (pantalla de bienvenida). No uses el modo demostración
  salvo en la tarea que lo indique.

## 2. Preguntas iniciales (2 minutos)

1. ¿Cómo llevas hoy la cuenta de lo que puedes gastar (app, hoja de cálculo, de memoria…)?
2. ¿Usas tarjeta de crédito? ¿Cada cuánto cobras?

## 3. Escenario ficticio para la persona

> Tienes **$1,240.00** en tu cuenta bancaria hoy. Cobras **$900.00 cada dos semanas**; el
> próximo cobro es dentro de 9 días. Pagas **$650.00 de renta** el día 1 de cada mes y
> **$45.00 de teléfono** el día 15. Quieres no tocar **$150.00** para emergencias.

Entrégalo en papel o en otra pantalla; no lo dictes paso a paso.

## 4. Tareas (en este orden)

Lee solo el texto entre comillas.

| # | Tarea | Se completa si… |
|---|---|---|
| T1 | «Configura la app con la situación del papel.» | Llega a Inicio con saldo, próximo cobro y la renta registrados. |
| T2 | «¿Cuánto puedes gastar hasta tu próximo cobro? Explícame de dónde sale esa cifra.» | Dice la cifra y menciona al menos saldo y renta/pagos reservados. |
| T3 | «Acabas de pagar $38.40 en el supermercado con tu tarjeta de débito. Regístralo.» | Hay un gasto de 38.40 en la cuenta correcta. |
| T4 | «Esa compra incluía $10.00 de artículos de limpieza para la casa. Déjalo reflejado.» | La compra queda dividida: 28.40 + 10.00 en dos categorías. |
| T5 | «Quieres comprar unos audífonos de $120.00 la próxima semana. ¿Te alcanza? No los compres todavía.» | Usa la simulación y no queda ningún movimiento nuevo. |
| T6 | «Hoy te pagaron $300.00 por un trabajo extra. Regístralo y aparta $100.00 para un viaje.» | Ingreso de 300 registrado y $100 apartados en una meta «viaje» (sin movimiento extra). |
| T7 | «Te equivocaste: el supermercado fueron $34.80, no $38.40. Corrígelo.» | El mismo movimiento cambia a 34.80 (sin duplicarlo ni dejar uno de más). |
| T8 | «Guarda una copia de tus datos y luego restáurala.» | Exporta un archivo y lo vuelve a importar con confirmación. |
| T9 | «Pon la app en inglés y luego vuelve al español.» | Cambia el idioma dos veces. |

Opcional si sobra tiempo: «Borraste un movimiento por error; recupéralo.»

> Por qué T6 no usa el cobro de $900: en el escenario ese cobro llega dentro de 9 días. Pedir
> que «llegó hoy» obligaría a registrarlo antes de su fecha y mezclaría dos dudas distintas.

### Cifras de referencia para el moderador (solo para comparar, no se muestran)

Calculadas a mano y comprobadas con `tests/e2e/user-testing-script.spec.ts` (si la prueba es
otro día, las fechas cambian; recalcula con la misma lógica):

| Tras… | «Puedes gastar» | Por qué |
|---|---|---|
| T1 | **$440.00** (≈ $48.88 por día, 9 días) | 1,240 − 650 de renta (antes del próximo cobro) − 150 apartados. El teléfono (día 15) es después del cobro y no se reserva. El cobro de 900 **no** se suma. |
| T3 | $401.60 | − 38.40 |
| T4 | $401.60 | Dividir no cambia el importe. |
| T5 | $401.60 | La simulación muestra que quedarían $281.60; no guarda nada. |
| T6 | $601.60 | + 300 del ingreso − 100 apartados para el viaje. Si no existe la meta, se crea desde «Distribuir este ingreso» › «Crear una meta» o desde Plan › Metas. |
| T7 | $605.20 | El movimiento pasa de 38.40 a 34.80 (+3.60). Al estar dividido, la app pide ajustar las líneas (sobran $3.60): **fricción esperada, observa cómo la resuelve**. |
| T8 | $605.20 | Restaurar la copia recién exportada no cambia nada. |

Interpretaciones a anotar como gravedad 4: creer que el cobro de 900 ya está incluido, que el
límite de una tarjeta es dinero disponible o que lo apartado ya se gastó.

## 5. Preguntas finales (3 minutos)

1. En una frase, ¿qué significa la cifra grande de Inicio?
2. ¿Hubo alguna cifra que no te creíste o no entendiste?
3. ¿Qué te daría confianza para usarla con tu dinero real? ¿Qué te lo impediría?
4. Del 1 al 5, ¿qué tan fácil fue? (anota la justificación, no solo el número)

## 6. Plantilla de registro (una por participante)

```
Participante: P__    Fecha: ____    Moderador: ____
Dispositivo / sistema / navegador: ________________   ¿Instalada en inicio?: sí / no
Experiencia previa con apps de finanzas: ninguna / alguna / mucha

| Tarea | Completó (sí / con ayuda / no) | Tiempo aprox. | Dónde necesitó ayuda | Comentarios en voz alta |
|-------|--------------------------------|---------------|----------------------|-------------------------|
| T1    |                                |               |                      |                         |
| T2    |                                |               |                      |                         |
| T3    |                                |               |                      |                         |
| T4    |                                |               |                      |                         |
| T5    |                                |               |                      |                         |
| T6    |                                |               |                      |                         |
| T7    |                                |               |                      |                         |
| T8    |                                |               |                      |                         |
| T9    |                                |               |                      |                         |

Interpretación de las cifras (T2 y pregunta final 1), con sus palabras:
- «Puedes gastar»: _______________________________________________
- ¿Creyó que incluía el próximo cobro? sí / no      ¿Y el crédito de la tarjeta? sí / no
- Otras cifras que interpretó mal: ________________________________

Problemas encontrados:
| # | Pantalla / tarea | Qué pasó (hechos, no opiniones) | Gravedad (0–4) | ¿Repetido en otros participantes? |
|---|------------------|---------------------------------|----------------|-----------------------------------|
|   |                  |                                 |                |                                   |
```

**Gravedad:** 0 = no es un problema · 1 = cosmético · 2 = menor (la persona se recupera
sola) · 3 = mayor (necesitó ayuda o tardó mucho) · 4 = crítico (no pudo terminar, perdió
datos o **entendió mal una cifra de dinero**). Una interpretación equivocada del disponible
cuenta siempre como 4, aunque la tarea se haya «completado».

## 7. Después de cada sesión

- Borra los datos del dispositivo si no era de la persona, o pídele que los borre.
- Pasa los problemas a una lista común; agrúpalos por causa, no por participante.
- No cambies la app entre participantes de la misma ronda (los resultados no serían
  comparables), salvo un error que bloquee la prueba.

## 8. Comprobaciones manuales en teléfonos reales (antes de la prueba)

Las pruebas automáticas usan Chromium emulando celulares; **no sustituyen** a un iPhone o
un Android reales. Revisar en cada dispositivo (marcar ✔ o anotar el problema):

### iPhone con Safari (y también instalada en la pantalla de inicio)

- [ ] La app abre; el teclado numérico aparece en los importes y acepta «12,50» y «12.50».
- [ ] Al escribir, el campo y el botón «Guardar» quedan a la vista (no tapados por el teclado ni por las barras).
- [ ] Girar a horizontal: nada queda cortado y no hay desplazamiento lateral.
- [ ] Texto grande (Ajustes del iPhone › Pantalla y brillo › Tamaño del texto, o zoom de Safari al 200 %): todo se lee.
- [ ] VoiceOver: se oye la cifra principal, los botones tienen nombre y los diálogos se pueden cerrar.
- [ ] Exportar copia: el archivo aparece en Archivos (o se puede compartir). Importarla desde Archivos funciona.
- [ ] Compartir › «Añadir a pantalla de inicio»: abre a pantalla completa y conserva los datos de Safari **o no** (en iOS, la app instalada tiene su propio almacenamiento: anotar qué ocurre).
- [ ] Sin conexión (modo avión) tras una primera visita por https: abre y muestra los datos.
- [ ] Recordatorio: Safari puede borrar los datos de un sitio no instalado tras ~7 días sin usarlo. Exportar una copia antes de pausas largas.

### Android con Chrome

- [ ] Las mismas comprobaciones de importes, teclado, horizontal, texto grande y diálogos.
- [ ] TalkBack: cifra principal, botones y diálogos.
- [ ] Exportar copia: aparece en Descargas; importarla desde Descargas funciona.
- [ ] «Instalar app» / «Añadir a pantalla de inicio»: abre en su propia ventana y conserva los datos.
- [ ] Modo avión tras la primera visita por https: abre con los datos.
- [ ] Dos pestañas abiertas: al guardar en una, la otra avisa y no sobrescribe.

### Ambos

- [ ] Con poca batería / ahorro de datos, la app sigue funcionando (no usa red).
- [ ] Cambiar la zona horaria del teléfono no cambia los importes; «hoy» sigue la zona elegida en Ajustes.
