import { createContext, useContext } from 'react';
import { AGENDA_SETTINGS_DEFAULTS } from '../utils/agendaSettings';

// Configuração da agenda da instituição, entregue pelo Agenda.jsx aos
// cards (Dia, Semana, Mês, Hoje) sem passar prop por quatro camadas.
// Fora do provider (ex.: card renderizado sozinho num teste) vale o
// padrão.
export const AgendaSettingsContext = createContext(AGENDA_SETTINGS_DEFAULTS);

export function useAgendaSettings() {
  return useContext(AgendaSettingsContext);
}
