import { useEffect, useMemo, useRef, useState } from 'react';
import { getAvatarColor, getInitials } from '../../utils/patientUi';
import '../../styles/searchSelect.css';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// ============================================================
// Campo de digitar-e-escolher (Fase 8) — mesmo modelo de interação já
// provado em Agenda.jsx (campo "Paciente" do formulário de
// agendamento: busca por texto, Enter escolhe o primeiro resultado,
// Esc/clique fora fecha), extraído aqui pra reaproveitar em qualquer
// lista de pessoas sem duplicar a lógica pela terceira vez.
//
// `options`: [{ id, label, sublabel?, avatar? }] — avatar=true desenha
// um círculo colorido com as iniciais do label (pacientes); sem avatar
// vira uma lista de texto simples (profissional, disciplina, etc.).
// ============================================================
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Digite para buscar…',
  emptyLabel = 'Nenhum resultado encontrado.',
  allowEmpty = true,
  emptyOptionLabel = 'Todos',
  disabled = false,
  id,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);

  const selected = useMemo(() => options.find(item => item.id === value) || null, [options, value]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(event) {
      if (fieldRef.current && !fieldRef.current.contains(event.target)) {
        setOpen(false);
        setQuery(selected?.label || '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, selected]);

  const filtered = useMemo(() => {
    const term = normalize(query);
    const matches = !term || term === normalize(selected?.label)
      ? options
      : options.filter(item => normalize(item.label).includes(term));
    return matches.slice(0, 8);
  }, [options, query, selected]);

  function commit(option) {
    onChange(option?.id || '');
    setQuery(option?.label || '');
    setOpen(false);
  }

  return (
    <div className={`ss-combo${open ? ' ss-combo-open' : ''}`} ref={fieldRef}>
      <svg className="ss-combo-icon ss-combo-icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input
        id={id}
        className="ss-combo-input"
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={open ? query : (selected?.label || '')}
        disabled={disabled}
        onFocus={() => { setOpen(true); setQuery(selected?.label || ''); }}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && filtered.length > 0) {
            event.preventDefault();
            commit(filtered[0]);
          } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery(selected?.label || '');
          }
        }}
      />
      <svg className="ss-combo-icon ss-combo-icon-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>

      {open && (
        filtered.length > 0 || allowEmpty ? (
          <ul className="ss-combo-list">
            {allowEmpty && (
              <li>
                <button type="button" className="ss-combo-option" aria-pressed={!value} onClick={() => commit(null)}>
                  {emptyOptionLabel}
                </button>
              </li>
            )}
            {filtered.map(option => (
              <li key={option.id}>
                <button
                  type="button"
                  className="ss-combo-option"
                  aria-pressed={option.id === value}
                  onClick={() => commit(option)}
                >
                  {option.avatar && (
                    <span className="ss-combo-avatar" style={{ background: getAvatarColor(option.label) }}>
                      {getInitials(option.label)}
                    </span>
                  )}
                  <span className="ss-combo-option-text">
                    <b>{option.label}</b>
                    {option.sublabel && <small>{option.sublabel}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ss-combo-empty">{emptyLabel}</p>
        )
      )}
    </div>
  );
}
