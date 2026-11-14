import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './context/Toast'
import { StoreProvider } from './context/Store'
import { PrefsProvider } from './context/Prefs'
import './index.css'
import { startUpdates } from './lib/updates'

startUpdates()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PrefsProvider>
        <ToastProvider>
          <StoreProvider>
            <App />
          </StoreProvider>
        </ToastProvider>
      </PrefsProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
