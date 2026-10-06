// Aplica el tema elegido (claro/oscuro) antes de pintar la página, para evitar un destello.
// «Sistema» = sin atributo: manda la preferencia del dispositivo. Solo lee una preferencia
// visual de este navegador; nunca datos financieros.
try {
  var theme = localStorage.getItem('clara.theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme)
} catch {
  // Sin almacenamiento: se sigue al sistema.
}
