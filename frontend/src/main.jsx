import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles/tokens.css'
import './App.css'
// Depois do App.css de propósito: reestiliza as classes .hub-* com
// tokens e a cascata decide. Inverter esta ordem devolve o visual antigo.
import './styles/hub.css'
// Kit visual das fichas das disciplinas (.forms-scope). Também depois do
// App.css: reveste .panel/.tag/.box/.alert/.psi-* só com tokens.
import './styles/forms.css'
import './styles/clinicPatients.css'
import './styles/appLoading.css'
import App from './App.jsx'
import { SurveyPage } from './SurveyPage.jsx'
import { ConfirmAppointmentPage } from './ConfirmAppointmentPage.jsx'
import { PublicAgendaPage } from './PublicAgendaPage.jsx'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AuthProvider } from './hooks/AuthContext'
import { PatientProvider } from './hooks/PatientContext'
import { installGlobalErrorTelemetry } from './services/telemetry'

installGlobalErrorTelemetry()

// Pesquisa de satisfação, confirmação de agendamento e agenda pública:
// links públicos, sem login. Curto-circuita ANTES de montar
// AuthProvider/PatientProvider — quem abre esses links não tem conta
// nenhuma no sistema, e não deveria precisar de uma.
const path = window.location.pathname
const isPublicSurveyRoute = path === '/pesquisa-satisfacao'
const isPublicConfirmRoute = path === '/confirmar-agendamento'
const isPublicAgendaRoute = path === '/agenda-publica'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPublicSurveyRoute ? (
      <SurveyPage />
    ) : isPublicConfirmRoute ? (
      <ConfirmAppointmentPage />
    ) : isPublicAgendaRoute ? (
      <PublicAgendaPage />
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
