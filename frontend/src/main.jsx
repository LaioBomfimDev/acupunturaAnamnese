import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import App from './App.jsx'
import { AuthProvider } from './hooks/AuthContext'
import { PatientProvider } from './hooks/PatientContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <PatientProvider>
        <App />
      </PatientProvider>
    </AuthProvider>
  </StrictMode>,
)

