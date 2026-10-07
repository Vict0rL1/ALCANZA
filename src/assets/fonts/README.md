# Fuentes

- **Inter** (variable, pesos 100–900), subconjuntos `latin` y `latin-ext`, copiados de
  `@fontsource-variable/inter@5.3.0`. Licencia SIL Open Font License 1.1 (`Inter-OFL.txt`).
- Se sirven desde la propia app (la CSP solo permite `font-src 'self'`) y el *service worker*
  las precarga. No se incluyen cirílico, griego ni vietnamita: Clara solo usa es/en/pt/fr.
- Si una fuente no carga, la pila de reserva es la del sistema (`system-ui`, …).
