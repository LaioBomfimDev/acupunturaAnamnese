/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { DISCIPLINES } from '../../../data/disciplines';
import { getStatusLabel } from '../../../utils/agenda';
import { createAgendaShareLink, revokeAgendaShareLink, buildAgendaShareLink } from '../../../services/agendaShareLinkService';

// ============================================================
// Compartilhar agenda — mensagem de texto OU link público
//
// Dois modos, um botão só (item 10 do pedido original):
//
//   * Mensagem: texto pronto pro WhatsApp (wa.me/?text=), como já era.
//     Não guarda nem escolhe telefone de ninguém — quem está mandando
//     escolhe o contato ou grupo na hora.
//   * Link público: gera uma URL somente leitura (agenda_share_links +
//     Edge Function public-agenda) que qualquer um abre sem login.
//     Mostra só nome/horário/status — nunca procedimento, modalidade
//     ou observação (mesmo corte da mensagem de texto, só que mais
//     estrito: quem recebe um link pode reencaminhar sem controle).
//
// O filtro por área e por profissional é COMPARTILHADO entre os dois
// modos — é o mesmo recorte de "quem deve ver isso", só muda a forma
// de entrega.
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

function formatExpiry(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function ShareAgendaPanel({
  open,
  onClose,
  dateLabel,
  dayKey,
  clinicId,
  appointments,
  teamOptions,
  patientName,
  professionalName,
  clinicName,
}) {
  const [mode, setMode] = useState('mensagem');
  const [disciplines, setDisciplines] = useState(() => new Set());
  const [professionalId, setProfessionalId] = useState('all');
  const [copied, setCopied] = useState(false);

  const [link, setLink] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [linkError, setLinkError] = useState('');

  // Reabrir o painel é uma nova rodada: o link de uma sessão anterior
  // (talvez de outro dia) não deveria continuar na tela como se fosse
  // deste dia. O filtro de área/profissional fica — é o recorte que a
  // pessoa provavelmente vai repetir.
  useEffect(() => {
    if (open) {
      setLink(null);
      setLinkError('');
      setLinkCopied(false);
    }
  }, [open]);

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

  async function handleGenerateLink() {
    setLinkError('');
    setGenerating(true);
    try {
      const created = await createAgendaShareLink({
        clinicId,
        day: dayKey,
        disciplines: [...disciplines],
        professionalId: professionalId === 'all' ? null : professionalId,
      });
      setLink(created);
      setLinkCopied(false);
    } catch (err) {
      setLinkError(err.message || 'Não foi possível gerar o link.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevokeLink() {
    if (!link) return;
    setRevoking(true);
    setLinkError('');
    try {
      await revokeAgendaShareLink(link.id);
      setLink(null);
    } catch (err) {
      setLinkError(err.message || 'Não foi possível revogar o link.');
    } finally {
      setRevoking(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(buildAgendaShareLink(link.token));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
    }
  }

  function openLinkOnWhatsapp() {
    if (!link) return;
    const message = `Agenda${clinicName ? ` — ${clinicName}` : ''} (${dateLabel})\n${buildAgendaShareLink(link.token)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
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
          <div className="ag-seg" role="group" aria-label="Forma de compartilhar">
            <button
              type="button"
              className="ag-seg-btn"
              aria-pressed={mode === 'mensagem'}
              onClick={() => setMode('mensagem')}
            >
              Mensagem de texto
            </button>
            <button
              type="button"
              className="ag-seg-btn"
              aria-pressed={mode === 'link'}
              onClick={() => setMode('link')}
            >
              Link público
            </button>
          </div>

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

          {mode === 'mensagem' ? (
            <>
              <div className="ag-field">
                <span className="agj-label">Prévia</span>
                <textarea className="agsh-preview" value={text} readOnly rows={10} />
              </div>

              <div className="ag-dialog-actions">
                <button type="button" className="ag-btn" onClick={copyText}>
                  {copied ? 'Copiado!' : 'Copiar mensagem'}
                </button>
                <button type="button" className="ag-btn ag-btn--primary" onClick={openWhatsapp}>
                  Abrir no WhatsApp
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="ag-note">
                Gera um link somente leitura desta agenda ({dateLabel}), sem login.
                Mostra só nome, horário e status — não expõe procedimento nem
                modalidade. Expira em 48h; você pode revogar antes disso.
              </p>

              {linkError && <div className="ag-alert" role="alert">{linkError}</div>}

              {!link ? (
                <div className="ag-dialog-actions">
                  <button
                    type="button"
                    className="ag-btn ag-btn--primary"
                    onClick={handleGenerateLink}
                    disabled={generating}
                  >
                    {generating ? 'Gerando…' : 'Gerar link público'}
                  </button>
                </div>
              ) : (
                <>
                  <div className="ag-field">
                    <span className="agj-label">Link gerado · expira em {formatExpiry(link.expires_at)}</span>
                    <input
                      className="ag-input agsh-link-input"
                      type="text"
                      readOnly
                      value={buildAgendaShareLink(link.token)}
                      onFocus={e => e.target.select()}
                    />
                  </div>

                  <div className="ag-dialog-actions">
                    <button type="button" className="ag-btn" onClick={copyLink}>
                      {linkCopied ? 'Copiado!' : 'Copiar link'}
                    </button>
                    <button type="button" className="ag-btn ag-btn--primary" onClick={openLinkOnWhatsapp}>
                      Abrir no WhatsApp
                    </button>
                    <button
                      type="button"
                      className="ag-btn ag-btn--danger"
                      onClick={handleRevokeLink}
                      disabled={revoking}
                    >
                      {revoking ? 'Revogando…' : 'Revogar link'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShareAgendaPanel;
