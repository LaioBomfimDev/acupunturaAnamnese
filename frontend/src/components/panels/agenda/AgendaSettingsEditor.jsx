import { useMemo, useState } from 'react';
import { DISCIPLINES } from '../../../data/disciplines';
import { saveAgendaSettings } from '../../../services/agendaSettingsService';
import {
  AGENDA_COLOR_PALETTE,
  DEFAULT_VIEW_OPTIONS,
  DURATION_OPTIONS,
  SERIES_HIGHLIGHTS,
  SERIES_MARK_STYLES,
  SLOT_OPTIONS,
  STATUS_LOOKS,
  appointmentLookAttrs,
  disciplineColorFor,
  normalizeAgendaSettings,
  seriesMarkOf,
} from '../../../utils/agendaSettings';

// ============================================================
// Configurar agenda — só o Admin da clínica (clinic_admin)
//
// Tudo aqui vale para a equipe toda: é gravado na instituição
// (clinics.agenda_settings), não no navegador. As prévias usam as
// MESMAS classes e atributos dos cards da agenda (agd-card + data-look /
// data-series), então o que aparece aqui é o que a recepção vai ver.
// Nada muda até "Salvar configuração".
// ============================================================

const SAMPLE_NAME = 'Paciente de exemplo';
const HOURS = Array.from({ length: 25 }, (_, hour) => hour);

function hourLabel(hour) {
  return `${String(hour).padStart(2, '0')}h`;
}

/** Card de amostra com o markup real do card da visão Dia. */
function SampleCard({ appointment, settings, caption }) {
  const color = disciplineColorFor(appointment.discipline, settings);
  const mark = seriesMarkOf(appointment, settings);

  return (
    <span
      className={`agd-card agd-card--filled agd-card--${appointment.status} agcfg-sample`}
      style={color ? { '--card-color': color } : undefined}
      {...appointmentLookAttrs(appointment, settings)}
    >
      <span className="agd-card-name">{SAMPLE_NAME}</span>
      <span className="agd-card-meta">
        {mark && <span className={`agd-chip agd-chip--series agd-chip--${mark.kind}`}>{mark.label}</span>}
        <span className="agd-chip">{caption}</span>
      </span>
    </span>
  );
}

function LookPicker({ name, legend, help, status, value, settings, onChange }) {
  return (
    <fieldset className="agcfg-section">
      <legend className="agcfg-legend">{legend}</legend>
      <p className="agcfg-help">{help}</p>
      <div className="agcfg-options">
        {STATUS_LOOKS.map(look => {
          const preview = { ...settings, [name]: look.id };
          return (
            <label key={look.id} className={`agcfg-option${value === look.id ? ' is-on' : ''}`}>
              <input
                type="radio"
                name={name}
                value={look.id}
                checked={value === look.id}
                onChange={() => onChange(look.id)}
              />
              <SampleCard
                appointment={{ kind: 'appointment', discipline: 'acupuntura', status }}
                settings={preview}
                caption="Acup."
              />
              <span className="agcfg-option-label">{look.label}</span>
              <span className="agcfg-option-hint">{look.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function AgendaSettingsEditor({ settings, available = true, onSaved, onBack }) {
  const [draft, setDraft] = useState(() => normalizeAgendaSettings(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');

  const saved = useMemo(() => normalizeAgendaSettings(settings), [settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const gridInvalid = draft.fallbackDayEndHour <= draft.fallbackDayStartHour;
  const disciplines = DISCIPLINES.filter(item => item.available);

  function change(patch) {
    setDraft(prev => ({ ...prev, ...patch }));
    setSavedNote('');
  }

  function changeColor(disciplineId, color) {
    setDraft(prev => {
      const disciplineColors = { ...prev.disciplineColors };
      if (color) disciplineColors[disciplineId] = color;
      else delete disciplineColors[disciplineId];
      return { ...prev, disciplineColors };
    });
    setSavedNote('');
  }

  async function handleSave() {
    if (gridInvalid) return;
    setError('');
    setSaving(true);
    try {
      const result = await saveAgendaSettings(draft);
      setDraft(result);
      onSaved?.(result);
      setSavedNote('Configuração salva. Já vale para a equipe toda.');
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a configuração da agenda.');
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (dirty && !window.confirm('Sair sem salvar? As alterações desta tela serão descartadas.')) return;
    onBack?.();
  }

  return (
    <div className="agj agcfg">
      <header className="agj-head">
        <div>
          <h3 className="agj-title">Configurar agenda</h3>
          <p className="agj-sub">Vale para a equipe toda · só o Admin da clínica altera</p>
        </div>
        <button type="button" className="ag-btn" onClick={handleBack}>← Voltar à agenda</button>
      </header>

      <p className="agj-note">
        Escolha como a agenda aparece para todo mundo da instituição. As amostras
        mostram o card exatamente como fica na agenda. Nada muda até você tocar em
        <b> Salvar configuração</b>. Relatórios, evoluções e documentos não são afetados:
        isto é só o visual e os padrões da agenda.
      </p>

      {!available && (
        <div className="ag-alert" role="alert">
          A configuração ainda não está disponível no banco (migração 20260928_agenda_settings.sql
          pendente). Dá para montar aqui, mas salvar vai falhar até ela ser aplicada.
        </div>
      )}
      {error && <div className="ag-alert" role="alert">{error}</div>}

      <nav className="agcfg-index" aria-label="Seções desta tela">
        <a href="#agcfg-cancelado">Cancelado</a>
        <a href="#agcfg-falta">Não compareceu</a>
        <a href="#agcfg-serie">Fixo × avulso</a>
        <a href="#agcfg-cores">Cores</a>
        <a href="#agcfg-padroes">Padrões</a>
      </nav>

      <div id="agcfg-cancelado">
        <LookPicker
          name="cancelledLook"
          legend="Cancelado"
          help='Vale para "Cancelado pelo paciente" e para as sessões canceladas de um pacote.'
          status="excused"
          value={draft.cancelledLook}
          settings={draft}
          onChange={id => change({ cancelledLook: id })}
        />

        <label className="agj-check agcfg-toggle">
          <input
            type="checkbox"
            checked={draft.hideCancelled}
            onChange={e => change({ hideCancelled: e.target.checked })}
          />
          <span>
            <b>Esconder os cancelados da agenda.</b> O horário aparece livre. Continuam nos
            relatórios, e o filtro de status &quot;Cancelado pelo paciente&quot; mostra de novo.
          </span>
        </label>
      </div>

      <div id="agcfg-falta">
        <LookPicker
          name="noShowLook"
          legend="Não compareceu"
          help="Visual próprio para a falta, separado do cancelado, para não confundir os dois."
          status="no_show"
          value={draft.noShowLook}
          settings={draft}
          onChange={id => change({ noShowLook: id })}
        />
      </div>

      <fieldset className="agcfg-section" id="agcfg-serie">
        <legend className="agcfg-legend">Fixo × avulso</legend>
        <p className="agcfg-help">
          <b>Fixo</b> é a sessão de um pacote no horário do pacote (ex.: toda terça às 14h).
          <b> Avulso</b> é o marcado só para aquele dia, ou a sessão do pacote que foi movida
          (ex.: nesta semana foi para sexta). O avulso não se repete nas próximas semanas.
        </p>

        <div className="agcfg-choices" role="radiogroup" aria-label="O que destacar">
          {SERIES_HIGHLIGHTS.map(option => (
            <label key={option.id} className={`agcfg-choice${draft.seriesHighlight === option.id ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="seriesHighlight"
                value={option.id}
                checked={draft.seriesHighlight === option.id}
                onChange={() => change({ seriesHighlight: option.id })}
              />
              <span className="agcfg-option-label">{option.label}</span>
              <span className="agcfg-option-hint">{option.hint}</span>
            </label>
          ))}
        </div>

        {draft.seriesHighlight !== 'none' && (
          <div className="agcfg-choices agcfg-choices--inline" role="radiogroup" aria-label="Como destacar">
            {SERIES_MARK_STYLES.map(option => (
              <label key={option.id} className={`agcfg-chip${draft.seriesMarkStyle === option.id ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="seriesMarkStyle"
                  value={option.id}
                  checked={draft.seriesMarkStyle === option.id}
                  onChange={() => change({ seriesMarkStyle: option.id })}
                />
                {option.label}
              </label>
            ))}
          </div>
        )}

        <div className="agcfg-pair" aria-label="Amostra">
          <div>
            <span className="agcfg-pair-label">Ter 14:00 · pacote</span>
            <SampleCard
              appointment={{ kind: 'appointment', discipline: 'acupuntura', status: 'scheduled', recurrence_group_id: 'amostra' }}
              settings={draft}
              caption="Acup."
            />
          </div>
          <div>
            <span className="agcfg-pair-label">Sex 10:00 · só nesta semana</span>
            <SampleCard
              appointment={{ kind: 'appointment', discipline: 'acupuntura', status: 'scheduled' }}
              settings={draft}
              caption="Acup."
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="agcfg-section" id="agcfg-cores">
        <legend className="agcfg-legend">Cor de cada disciplina</legend>
        <p className="agcfg-help">
          Só na agenda. Todas as opções têm contraste para o texto branco do card, e nenhuma é
          vermelha: vermelho fica reservado para conflito de horário.
        </p>

        <div className="agcfg-colors">
          {disciplines.map(discipline => {
            const current = draft.disciplineColors[discipline.id] || '';
            return (
              <div key={discipline.id} className="agcfg-color-row">
                <SampleCard
                  appointment={{ kind: 'appointment', discipline: discipline.id, status: 'scheduled' }}
                  settings={{ ...draft, seriesHighlight: 'none' }}
                  caption={discipline.label}
                />
                <div className="agcfg-swatches" role="radiogroup" aria-label={`Cor de ${discipline.label}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!current}
                    className={`agcfg-swatch agcfg-swatch--default${!current ? ' is-on' : ''}`}
                    style={{ '--swatch': discipline.color }}
                    onClick={() => changeColor(discipline.id, null)}
                    title="Cor padrão do sistema"
                  >
                    Padrão
                  </button>
                  {AGENDA_COLOR_PALETTE.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      role="radio"
                      aria-checked={current === color.value}
                      aria-label={color.label}
                      title={color.label}
                      className={`agcfg-swatch${current === color.value ? ' is-on' : ''}`}
                      style={{ '--swatch': color.value }}
                      onClick={() => changeColor(discipline.id, color.value)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="agcfg-section" id="agcfg-padroes">
        <legend className="agcfg-legend">Padrões</legend>

        <div className="agcfg-fields">
          <div className="ag-field">
            <label htmlFor="agcfg-duration">Duração de um agendamento novo</label>
            <select
              id="agcfg-duration"
              className="ag-select"
              value={draft.defaultDurationMinutes}
              onChange={e => change({ defaultDurationMinutes: Number(e.target.value) })}
            >
              {DURATION_OPTIONS.map(minutes => (
                <option key={minutes} value={minutes}>{minutes} min</option>
              ))}
            </select>
          </div>

          <div className="ag-field">
            <label htmlFor="agcfg-view">Visão que abre primeiro</label>
            <select
              id="agcfg-view"
              className="ag-select"
              value={draft.defaultView}
              onChange={e => change({ defaultView: e.target.value })}
            >
              {DEFAULT_VIEW_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="agcfg-help">
          Grade de quem ainda não cadastrou os horários de atendimento. Quem cadastrou segue a
          própria jornada.
        </p>
        <div className="agcfg-fields">
          <div className="ag-field">
            <label htmlFor="agcfg-start">Começa às</label>
            <select
              id="agcfg-start"
              className="ag-select"
              value={draft.fallbackDayStartHour}
              onChange={e => change({ fallbackDayStartHour: Number(e.target.value) })}
            >
              {HOURS.slice(0, 24).map(hour => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
            </select>
          </div>
          <div className="ag-field">
            <label htmlFor="agcfg-end">Termina às</label>
            <select
              id="agcfg-end"
              className="ag-select"
              value={draft.fallbackDayEndHour}
              onChange={e => change({ fallbackDayEndHour: Number(e.target.value) })}
            >
              {HOURS.slice(1).map(hour => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
            </select>
          </div>
          <div className="ag-field">
            <label htmlFor="agcfg-slot">De quanto em quanto</label>
            <select
              id="agcfg-slot"
              className="ag-select"
              value={draft.fallbackSlotMinutes}
              onChange={e => change({ fallbackSlotMinutes: Number(e.target.value) })}
            >
              {SLOT_OPTIONS.map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}
            </select>
          </div>
        </div>
        {gridInvalid && (
          <p className="agcfg-invalid" role="alert">O fim precisa ser depois do começo.</p>
        )}
      </fieldset>

      <div className="agcfg-bar">
        <span className="agcfg-bar-status" role="status">
          {savedNote || (dirty ? 'Alterações não salvas.' : 'Tudo salvo.')}
        </span>
        <button
          type="button"
          className="ag-btn"
          onClick={() => change(normalizeAgendaSettings(null))}
          disabled={saving}
          title="Volta tudo ao padrão do sistema nesta tela. Só vale depois de salvar."
        >
          Restaurar padrão
        </button>
        <button
          type="button"
          className="ag-btn"
          onClick={() => { setDraft(saved); setSavedNote(''); }}
          disabled={saving || !dirty}
        >
          Descartar
        </button>
        <button
          type="button"
          className="ag-btn ag-btn--primary"
          onClick={handleSave}
          disabled={saving || !dirty || gridInvalid}
        >
          {saving ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  );
}

export default AgendaSettingsEditor;
