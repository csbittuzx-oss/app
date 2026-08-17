import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Lock screen orientation to portrait if supported by runtime
if (typeof window !== 'undefined' && window.screen?.orientation && 'lock' in window.screen.orientation) {
  try {
    (window.screen.orientation as any).lock('portrait').catch(() => {});
  } catch {}
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
