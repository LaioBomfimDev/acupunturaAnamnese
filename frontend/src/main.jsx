import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
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
