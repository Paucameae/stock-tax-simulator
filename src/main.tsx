import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/sw-update.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for PWA / offline support, with in-app update prompts.
registerServiceWorker();

// All user data lives in localStorage, which browsers may evict under storage
// pressure. Asking for persistent storage makes that eviction opt-in.
void navigator.storage?.persist?.();
