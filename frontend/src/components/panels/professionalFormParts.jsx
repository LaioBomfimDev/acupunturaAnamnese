// ============================================================
// Campos compartilhados do cadastro de profissional (componentes)
// Usados na aba "Criar profissional" do SuperAdm, na edição e na
// criação a partir da aba "Clínicas". Helpers puros (máscaras,
// senha, EMPTY_PROFESSIONAL_FORM) ficam em ./professionalFormHelpers.
// ============================================================

import { useState } from 'react';
import {
  PROFESSIONS,
  addSpecialty,
  getProfession,
  parseSpecialties,
  removeSpecialtyAt,
} from '../../data/professionalCouncils';

export function PasswordField({ label, value, onChange, visible, onToggle, required = false }) {
  const title = visible ? 'Ocultar senha' : 'Mostrar senha';

  return (
    <label className="password-label">
      {label}
      <span className="password-field">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete="new-password"
          required={required}
        />
        <button
          className="password-eye-button"
          type="button"
          onClick={onToggle}
          aria-label={title}
          title={title}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M2.2 12s3.4-6 9.8-6 9.8 6 9.8 6-3.4 6-9.8 6-9.8-6-9.8-6Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path className="password-eye-slash" d="M4 20 20 4" />}
          </svg>
        </button>
      </span>
    </label>
  );
}

// Profissão + registro do conselho. O rótulo, a dica e o botão de
// consulta se adaptam à profissão escolhida (CRM, CRP, CREFITO...).
export function ProfessionRegistration({ profession, onProfession, registration, onRegistration, required = false }) {
  const info = getProfession(profession);

  return (
    <>
      <label>
        Profissão {required && '*'}
        <select
          value={profession}
          onChange={event => onProfession(event.target.value)}
          required={required}
        >
          <option value="" disabled={required}>Selecione a profissão</option>
          {PROFESSIONS.map(item => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="council-label">
          {info.registrationLabel}
          {info.council && <span className="council-pill">{info.council}</span>}
        </span>
        <input
          value={registration}
          onChange={event => onRegistration(event.target.value)}
          placeholder={info.registrationPlaceholder}
        />
        <span className="council-verify">
          {info.verifyUrl ? (
            <a className="tag" href={info.verifyUrl} target="_blank" rel="noopener noreferrer">
              Conferir no portal {info.council ? `do ${info.council}` : 'oficial'} ↗
            </a>
          ) : (
            <small>{info.note || 'Confira o registro manualmente no conselho da profissão.'}</small>
          )}
        </span>
      </label>
    </>
  );
}

// Especialidades em formato de etiquetas: digita, "Adicionar" (ou Enter)
// e vai somando. Internamente continua um texto único separado por vírgula.
export function SpecialtyTags({ value, onChange }) {
  const [draft, setDraft] = useState('');
  const items = parseSpecialties(value);

  function commit() {
    const next = addSpecialty(value, draft);
    if (next !== value || draft.trim()) onChange(next);
    setDraft('');
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    }
  }

  return (
    <div className="specialty-tags">
      {items.length > 0 && (
        <ul className="specialty-chip-list">
          {items.map((item, index) => (
            <li className="specialty-chip" key={`${item}-${index}`}>
              <span>{item}</span>
              <button
                type="button"
                onClick={() => onChange(removeSpecialtyAt(value, index))}
                aria-label={`Remover ${item}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="specialty-input-row">
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ex.: Acupuntura, Ortopedia, Dor crônica..."
        />
        <button className="tag" type="button" onClick={commit} disabled={!draft.trim()}>
          Adicionar
        </button>
      </div>
    </div>
  );
}

// Select de clínicas já cadastradas — faz o vínculo por clinic_id.
export function ClinicSelect({ value, onChange, clinics }) {
  return (
    <label>
      Clínica
      <select value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Sem clínica</option>
        {clinics.map(clinic => (
          <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
        ))}
      </select>
      {clinics.length === 0 && (
        <small className="field-hint">Cadastre clínicas na aba “Clínicas” para vincular aqui.</small>
      )}
    </label>
  );
}
