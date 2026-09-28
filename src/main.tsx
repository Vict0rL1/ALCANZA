import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppStore, setStore } from './state/store'
import { LocalStorageRepository } from './storage/localStorageRepository'
import './styles.css'

const store = new AppStore(new LocalStorageRepository())
setStore(store)
void store.init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
