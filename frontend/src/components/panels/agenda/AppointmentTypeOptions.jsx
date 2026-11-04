import { appointmentTypeGroups } from '../../../utils/appointmentTypes.js';

/** Opções do campo "Tipo" (Novo agendamento, Editar e Registrar atendimento
 * já realizado): serviços da área com o nome dela, depois os tipos gerais.
 * Catálogo único em utils/appointmentTypes.js. */
export default function AppointmentTypeOptions({ discipline, current = '' }) {
  return (
    <>
      <option value="">Não classificado</option>
      {appointmentTypeGroups(discipline, current).map(group => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map(item => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
