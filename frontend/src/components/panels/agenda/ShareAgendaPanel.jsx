import { useMemo, useState } from 'react';
import { DISCIPLINES } from '../../../data/disciplines';
import { getStatusLabel } from '../../../utils/agenda';

// ============================================================
// Compartilhar agenda — texto pronto para WhatsApp
//
// Não guarda nem escolhe telefone de ninguém: abre o WhatsApp com o
// texto preenchido (wa.me/?text=) e quem está mandando escolhe o
// contato ou grupo na hora, do jeito que já faz manualmente hoje.
// Filtro por área e por profissional porque "manda a agenda inteira"
// não serve pra avisar só a fisioterapia, por exemplo.
// ============================================================

const BLOCK_TYPE_LABEL = {
  reuniao: 'Reunião',
  entrevista: 'Entrevista',
  outro: 'Outro',
};

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ShareAgendaPanel({
  open,
  onClose,
  dateLabel,
  appointments,
  teamOptions,
  patientName,
  professionalName,
  clinicName,
}) {
  const [disciplines, setDisciplines] = useState(() => new Set());
  const [professionalId, setProfessionalId] = useState('all');
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => (
    (appointments || [])
      .filter(item => disciplines.size === 0 || item.kind === 'block' || disciplines.has(item.discipline))
      .filter(item => professionalId === 'all' || item.professional_id === professionalId)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  ), [appointments, disciplines, professionalId]);

  const text = useMemo(() => {
    const lines = [`Agenda${clinicName ? ` — ${clinicName}` : ''}`, dateLabel];

    if (disciplines.size > 0) {
      lines.push(`Área: ${[...disciplines].map(id => DISCIPLINES.find(d => d.id === id)?.label || id).join(', ')}`);
    }
    if (professionalId !== 'all') {
      lines.push(`Profissional: ${professionalName(professionalId)}`);
    }
    lines.push('');

    if (filtered.length === 0) {
      lines.push('Nenhum atendimento neste filtro.');
    } else {
      for (const item of filtered) {
        const time = `${formatTime(item.starts_at)}–${formatTime(item.ends_at)}`;

        if (item.kind === 'block') {
          const blockLabel = BLOCK_TYPE_LABEL[item.block_type] || BLOCK_TYPE_LABEL.outro;
          lines.push(`${time} — ${blockLabel}${item.note?.trim() ? `: ${item.note.trim()}` : ''}`);
          continue;
        }

        const discipline = DISCIPLINES.find(d => d.id === item.discipline)?.label || item.discipline;
        const modality = item.modality === 'online' ? 'Online' : 'Presencial';
        let detail = `${discipline} · ${modality}`;
        if (item.appointment_type === 'intro_interview') detail += ' · entrevista inicial (grátis)';
        if (item.status !== 'scheduled') detail += ` · ${getStatusLabel(item.status)}`;
        else if (item.confirmed_at) detail += ' · confirmado';

        lines.push(`${time} — ${patientName(item.patient_id)} (${detail})`);
      }
    }

    lines.push('');
    lines.push(`${filtered.filter(item => item.kind !== 'block').length} atendimento(s)`);

    return lines.join('\n');
  }, [filtered, dateLabel, disciplines, professionalId, clinicName, patientName, professionalName]);

  function toggleDiscipline(id) {
    setDisciplines(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function openWhatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  if (!open) return null;

  return (
    <div className="ag-dialog-overlay" role="dialog" aria-modal="true" aria-label="Compartilhar agenda">
      <div className="ag-dialog-panel">
        <div className="ag-dialog-head">
          <h3 className="ag-dialog-title">Compartilhar agenda</h3>
          <button type="button" className="ag-chip-btn" onClick={onClose}>Fechar</button>
        </div>

        <div className="ag-dialog-body">
          <div className="ag-field">
            <span className="agj-label">Área</span>
            <div className="agsh-chips">
              <button
                type="button"
                className="ag-chip-btn"
                aria-pressed={disciplines.size === 0}
                onClick={() => setDisciplines(new Set())}
              >
                Todas
              </button>
              {DISCIPLINES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="ag-chip-btn"
                  aria-pressed={disciplines.has(item.id)}
                  onClick={() => toggleDiscipline(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {teamOptions.length > 1 && (
            <div className="ag-field">
              <span className="agj-label">Profissional</span>
              <div className="agsh-chips">
                <button
                  type="button"
                  className="ag-chip-btn"
                  aria-pressed={professionalId === 'all'}
                  onClick={() => setProfessionalId('all')}
                >
                  Toda a equipe
                </button>
                {teamOptions.map(member => (
                  <button
                    key={member.id}
                    type="button"
                    className="ag-chip-btn"
                    aria-pressed={professionalId === member.id}
                    onClick={() => setProfessionalId(member.id)}
                  >
                    {professionalName(member.id)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ag-field">
            <span className="agj-label">Prévia</span>
            <textarea className="agsh-preview" value={text} readOnly rows={10} />
          </div>

          <div className="ag-dialog-actions">
            <button type="button" className="ag-btn" onClick={copyText}>
              {copied ? 'Copiado!' : 'Copiar texto'}
            </button>
            <button type="button" className="ag-btn ag-btn--primary" onClick={openWhatsapp}>
              Abrir no WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShareAgendaPanel;
