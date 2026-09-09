import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles/tokens.css'
import './App.css'
// Depois do App.css de propósito: reestiliza as classes .hub-* com
// tokens e a cascata decide. Inverter esta ordem devolve o visual antigo.
import './styles/hub.css'
import './styles/clinicPatients.css'
import App from './App.jsx'
import { SurveyPage } from './SurveyPage.jsx'
import { ConfirmAppointmentPage } from './ConfirmAppointmentPage.jsx'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthProvider } from './hooks/AuthContext'
import { PatientProvider } from './hooks/PatientContext'
import { installGlobalErrorTelemetry } from './services/telemetry'

installGlobalErrorTelemetry()

// Pesquisa de satisfação e confirmação de agendamento: links públicos,
// sem login. Curto-circuita ANTES de montar AuthProvider/PatientProvider
// — quem abre esses links não tem conta nenhuma no sistema, e não
// deveria precisar de uma.
const path = window.location.pathname
const isPublicSurveyRoute = path === '/pesquisa-satisfacao'
const isPublicConfirmRoute = path === '/confirmar-agendamento'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPublicSurveyRoute ? (
      <SurveyPage />
    ) : isPublicConfirmRoute ? (
      <ConfirmAppointmentPage />
    ) : (
      <AuthProvider>
        <PatientProvider>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </PatientProvider>
      </AuthProvider>
    )}
  </StrictMode>,
)
