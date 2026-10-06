import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { registerServiceWorker } from './pwa/register'
import { AppStore, setStore } from './state/store'
import { createRepository } from './storage/indexedDbRepository'
import './styles.css'
import { watchThemeChanges } from './ui/theme'

registerServiceWorker()
watchThemeChanges()

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
