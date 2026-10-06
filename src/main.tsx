import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { registerServiceWorker } from './pwa/register'
import { AppStore, setStore } from './state/store'
import { LocalStorageRepository } from './storage/localStorageRepository'
import './styles.css'
import { watchThemeChanges } from './ui/theme'

const store = new AppStore(new LocalStorageRepository())
setStore(store)
void store.init()
registerServiceWorker()
watchThemeChanges()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
