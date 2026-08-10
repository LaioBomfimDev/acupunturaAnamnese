import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './App.css'
// Depois do App.css de propósito: reestiliza as classes .hub-* com
// tokens e a cascata decide. Inverter esta ordem devolve o visual antigo.
import './styles/hub.css'
import App from './App.jsx'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthProvider } from './hooks/AuthContext'
import { PatientProvider } from './hooks/PatientContext'
import { installGlobalErrorTelemetry } from './services/telemetry'

installGlobalErrorTelemetry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <PatientProvider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </PatientProvider>
    </AuthProvider>
  </StrictMode>,
)
