import { useMemo, useState } from 'react';
import { upcomingBirthdays } from '../../../utils/agenda';
import { buildWhatsAppLink, isLikelyValidWhatsAppPhone } from '../../../utils/whatsapp';
import { getInitials } from '../../../utils/patientUi';

// ============================================================
// Aniversários — lista de marketing/relacionamento
//
// A grade do mês (birthdaysByDay) já marca o aniversário no dia certo;
// esta lista é outra coisa, pensada pra quem organiza contato com o
// paciente: todo mundo em ordem de PRÓXIMA data, agrupado por urgência
// (Hoje/Esta semana/Este mês/Mais adiante) em vez de lista corrida —
// escaneável de relance, que é o uso real (ver quem contatar hoje).
// Reaproveita o mesmo shell de diálogo do Compartilhar (.ag-dialog-*),
// o cabeçalho de seção da fila "Hoje" (.agh-block-title) e o mesmo
// padrão de "abrir WhatsApp com mensagem pronta" da fila de confirmação
// — quem manda é gente, isto só monta o link.
// ============================================================

const RANGE_OPTIONS = [
  { id: 30, label: '30 dias' },
  { id: 90, label: '90 dias' },
  { id: null, label: 'Todos' },
];

// Mesma paleta de TEAM_AVATAR_COLORS (Agenda.jsx) — duplicada em vez de
// importada pra não criar dependência circular (Agenda.jsx importa este
// arquivo). Cicla por posição na lista, só precisa ser estável dentro
// da sessão, não sobreviver a reordenação.
const AVATAR_COLORS = ['#33403f', '#2e5578', '#5c3d63', '#7a5a2e', '#46426b', '#7d9291'];

const GROUPS = [
  { id: 'today', label: 'Hoje', test: days => days === 0 },
  { id: 'week', label: 'Esta semana', test: days => days >= 1 && days <= 7 },
  { id: 'month', label: 'Este mês', test: days => days >= 8 && days <= 30 },
  { id: 'later', label: 'Mais adiante', test: days => days > 30 },
];

function dateLabelOf(item) {
  const [, month, day] = item.nextDate.split('-');
  return `${day}/${month}`;
}

function formatWhen(item) {
  const dateLabel = dateLabelOf(item);
  if (item.daysUntil === 0) return `Hoje · ${dateLabel}`;
  if (item.daysUntil === 1) return `Amanhã · ${dateLabel}`;
  return `${dateLabel} · em ${item.daysUntil} dias`;
}

function metaLabel(item) {
  const dateLabel = dateLabelOf(item);
  const idade = `completa ${item.age} anos`;
  if (item.daysUntil === 0) return `${idade} · ${dateLabel}`;
  if (item.daysUntil === 1) return `${idade} · amanhã, ${dateLabel}`;
  return `${idade} · ${dateLabel} (em ${item.daysUntil} dias)`;
}

export function BirthdaysPanel({ open, onClose, patients, today, clinicName }) {
  const [range, setRange] = useState(30);
  const [copied, setCopied] = useState(false);

  const all = useMemo(() => upcomingBirthdays(patients, today), [patients, today]);
  const filtered = useMemo(
    () => (range === null ? all : all.filter(item => item.daysUntil <= range)),
    [all, range],
  );

  const groups = useMemo(() => {
    const withColor = filtered.map((item, index) => ({
      ...item,
      color: AVATAR_COLORS[index % AVATAR_COLORS.length],
    }));
    return GROUPS
      .map(group => ({ ...group, items: withColor.filter(item => group.test(item.daysUntil)) }))
      .filter(group => group.items.length > 0);
  }, [filtered]);

  const text = useMemo(() => {
    const rangeLabel = RANGE_OPTIONS.find(option => option.id === range)?.label || 'todos';
    const lines = [`Aniversários${clinicName ? ` — ${clinicName}` : ''} (${rangeLabel})`, ''];

    if (filtered.length === 0) {
      lines.push('Nenhum aniversário neste período.');
    } else {
      for (const item of filtered) {
        lines.push(`${formatWhen(item)} — ${item.name} (completa ${item.age})`);
      }
    }

    return lines.join('\n');
  }, [filtered, range, clinicName]);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function whatsAppLinkFor(item) {
    if (!isLikelyValidWhatsAppPhone(item.phone)) return null;
    const message = item.daysUntil === 0
      ? `Parabéns, ${item.name}! ${clinicName ? `A equipe da ${clinicName} deseja` : 'Desejamos'} um feliz aniversário! 🎂`
      : `Olá ${item.name}! ${clinicName ? `Aqui é da ${clinicName}. ` : ''}Passando pra desejar um feliz aniversário adiantado, no dia ${dateLabelOf(item)}! 🎂`;
    return buildWhatsAppLink({ phone: item.phone, message });
  }

  if (!open) return null;

  return (
    <div className="ag-dialog-overlay" role="dialog" aria-modal="true" aria-label="Aniversários">
      <div className="ag-dialog-panel">
        <div className="ag-dialog-head">
          <h3 className="ag-dialog-title">Aniversários</h3>
          <button type="button" className="ag-chip-btn" onClick={onClose}>Fechar</button>
        </div>

        <div className="ag-dialog-body">
          {filtered.length > 0 && (
            <div className="agb-stat">
              <b>{filtered.length}</b>
              <span>
                {filtered.length === 1 ? 'aniversariante' : 'aniversariantes'}
                {range !== null ? ` nos próximos ${range} dias` : ''}
              </span>
            </div>
          )}

          <div className="ag-seg" role="group" aria-label="Período">
            {RANGE_OPTIONS.map(option => (
              <button
                key={option.label}
                type="button"
                className="ag-seg-btn"
                aria-pressed={range === option.id}
                onClick={() => setRange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="ag-empty">Nenhum aniversário neste período.</p>
          ) : (
            groups.map(group => (
              <div className="agb-group" key={group.id}>
                <h4 className={`agh-block-title${group.id === 'today' ? ' agb-group-title--today' : ''}`}>
                  {group.label} <span>{group.items.length}</span>
                </h4>
                <ul className="agp-list">
                  {group.items.map(item => {
                    const link = whatsAppLinkFor(item);
                    return (
                      <li
                        key={item.id}
                        className={`agp-row${group.id === 'today' ? ' agb-row--today' : ''}`}
                      >
                        <span className="ag-avatar ag-avatar--lg" style={{ background: item.color }}>
                          {getInitials(item.name)}
                        </span>
                        <span className="agp-name">{item.name}</span>
                        <span className="agp-meta">{metaLabel(item)}</span>
                        {link ? (
                          <a className="ag-btn agp-whatsapp" href={link} target="_blank" rel="noopener noreferrer">
                            Enviar WhatsApp
                          </a>
                        ) : (
                          <span className="agp-no-phone" title="Sem telefone válido cadastrado">
                            sem telefone
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}

          <div className="ag-dialog-actions">
            <button type="button" className="ag-btn" onClick={copyText}>
              {copied ? 'Copiado!' : 'Copiar lista'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BirthdaysPanel;
