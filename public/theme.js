// Aplica el tema elegido antes de pintar la página, para evitar un destello. Oscuro es el
// predeterminado; «Sistema» (guardado como 'system') deja mandar al dispositivo. Solo lee una
// preferencia visual de este navegador; nunca datos financieros.
try {
  var theme = localStorage.getItem('clara.theme')
  if (theme !== 'system') document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark')
} catch {
  document.documentElement.setAttribute('data-theme', 'dark')
}
