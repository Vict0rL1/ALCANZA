# Pasar tus datos a otro teléfono, navegador o a la app instalada

Clara guarda tus datos **solo en el navegador donde la usas**. No hay cuenta ni servidor: para
llevarlos a otro sitio hay que **exportar una copia** (un archivo) e **importarla** allí.

Casos en los que esto hace falta:

- Cambias de teléfono o de computadora.
- Usas otro navegador (por ejemplo, de Chrome a Firefox).
- **En iPhone o iPad: instalas Clara en la pantalla de inicio.** La app instalada tiene sus propios
  datos, separados de Safari: al abrirla por primera vez está vacía aunque ya usaras Clara en Safari.

## 1. Exportar la copia (en el sitio de siempre)

1. Abre Clara donde tienes tus datos.
2. **Ajustes › Copias de seguridad › Exportar copia**.
   - En iPhone (y donde el navegador lo permita) se abre la hoja **Compartir**: elige **Guardar en
     Archivos** (o iCloud Drive). En otros navegadores el archivo se descarga a la carpeta de descargas.
   - El archivo se llama `clara-copia-AAAA-MM-DD-HH-MM.json`.
3. Comprueba que el archivo quedó guardado fuera de ese navegador (Archivos, iCloud Drive, una memoria
   USB o un correo para ti).

Si exportaste una **copia cifrada** (Ajustes › Copias de seguridad › «Copia cifrada con frase»), apunta
la frase: sin ella no se puede abrir. Al importarla, Clara te la pedirá.

## 2. Instalar o abrir Clara en el sitio nuevo

- **iPhone / iPad**: Safari › Compartir › **Agregar a inicio** (Ajustes › Instalar Clara lo explica
  paso a paso).
- **Android / computadora con Chrome o Edge**: Ajustes › Instalar Clara › **Instalar Clara**, o menú ⋮ ›
  «Instalar Clara».
- O simplemente abre la dirección de Clara en el navegador nuevo.

## 3. Importar la copia (en el sitio nuevo)

1. Abre Clara. Si está vacía verás la bienvenida: pulsa **Restaurar una copia** y elige el archivo.
   - Si ya tiene datos (por ejemplo, probaste la demostración): **Ajustes › Copias de seguridad ›
     Importar copia**. Clara te pedirá confirmar antes de reemplazar lo que hay.
2. Clara revisa **todo** el archivo antes de tocar nada. Si algo no está bien, no importa nada y te
   dice qué falla.
3. Verás un resumen (fecha de la copia, número de movimientos y de cuentas). Pulsa **Restaurar**.
4. Comprueba que «Puedes gastar», tus movimientos y tus ajustes son los mismos que en el sitio de antes.

## 4. Después

- Mantén el sitio anterior hasta comprobar que todo está bien en el nuevo. No se sincronizan: lo que
  registres en uno no aparece en el otro.
- Cuando todo esté bien, usa solo el sitio nuevo y haz copias desde ahí (Clara te lo recuerda).
- Una copia **sin fotos** (la versión ligera) no incluye las fotos de recibos.

## Lo que comprueban las pruebas automáticas

`tests/e2e/restore.spec.ts` exporta una copia en un navegador con datos reales (configuración, un gasto y
un ajuste cambiado), la importa desde la bienvenida en otro navegador nuevo y comprueba que las cifras de
Inicio, todos los registros (cuentas, movimientos, programados, metas, categorías, reglas, etiquetas,
planes y favoritos) y los ajustes son idénticos. También que una copia no válida no restaura nada.
