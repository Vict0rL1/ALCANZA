import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { registerServiceWorker } from './pwa/register'
import { captureInstallPrompt } from './ui/install'
import { enablePseudoLocale } from './i18n'
import { AppStore, setStore } from './state/store'
import { createRepository } from './storage/indexedDbRepository'
import './styles.css'
import { watchThemeChanges } from './ui/theme'

registerServiceWorker()
captureInstallPrompt()
watchThemeChanges()
// Pseudo-locale solo en desarrollo: `?pseudo=1` marca todo texto que pasa por i18n.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('pseudo') === '1') enablePseudoLocale(true)

// IndexedDB si el navegador lo permite; si no, localStorage (ver docs/STORAGE.md).
void createRepository().then((repo) => {
  const store = new AppStore(repo)
  setStore(store)
  void store.init()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
