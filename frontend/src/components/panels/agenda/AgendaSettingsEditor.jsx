import { useMemo, useState } from 'react';
import { DISCIPLINES } from '../../../data/disciplines';
import { saveAgendaSettings } from '../../../services/agendaSettingsService';
import {
  AGENDA_COLOR_PALETTE,
  DEFAULT_VIEW_OPTIONS,
  DURATION_OPTIONS,
  SERIES_BADGE_DEFAULTS,
  SERIES_HIGHLIGHTS,
  SERIES_ICONS,
  SERIES_KINDS,
  SERIES_LABEL_MAX_LENGTH,
  SERIES_LABEL_SUGGESTIONS,
  SERIES_MARK_STYLES,
  SLOT_OPTIONS,
  STATUS_LOOKS,
  appointmentCardStyle,
  appointmentLookAttrs,
  cleanSeriesLabel,
  disciplineColorFor,
  isSeriesKindHighlighted,
  normalizeAgendaSettings,
  seriesHighlightLabel,
  seriesLabelOf,
  seriesLabelsClash,
  seriesMarkOf,
} from '../../../utils/agendaSettings';
import { SeriesBadge, SeriesIcon } from './SeriesBadge';
import { ScreenHelp } from '../../ui/ScreenHelp';
import { HubBackButton } from '../../HubNav';
import { AGENDA_HELP } from '../../../data/screenHelp';

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
      style={appointmentCardStyle(color, mark)}
      {...appointmentLookAttrs(appointment, settings)}
    >
      <span className="agd-card-name">{SAMPLE_NAME}</span>
      <span className="agd-card-meta">
        {mark && <SeriesBadge mark={mark} className={`agd-chip agd-chip--series agd-chip--${mark.kind}`} />}
        <span className="agd-chip">{caption}</span>
      </span>
    </span>
  );
}

// Cada tipo no editor do selo: o card de amostra força o destaque daquele
// tipo, para o selo aparecer mesmo quando o destacado na agenda é o outro.
const SERIES_KIND_INFO = {
  'one-off': {
    sub: 'Marcado só para aquele dia, ou sessão do pacote que foi movida.',
    appointment: { kind: 'appointment', discipline: 'acupuntura', status: 'scheduled' },
  },
  fixed: {
    sub: 'Sessão do pacote no horário de sempre.',
    appointment: { kind: 'appointment', discipline: 'acupuntura', status: 'scheduled', recurrence_group_id: 'amostra' },
  },
};

const BADGE_FIELDS = ['label', 'color', 'icon', 'mark'];

function withBadge(settings, kind, patch) {
  return {
    ...settings,
    seriesHighlight: kind,
    seriesBadges: { ...settings.seriesBadges, [kind]: { ...settings.seriesBadges[kind], ...patch } },
  };
}

/** Miniatura de uma moldura: o mesmo card da agenda, só com o selo. */
function MarkTile({ kind, mark, settings }) {
  const { appointment } = SERIES_KIND_INFO[kind];
  const tileSettings = withBadge(settings, kind, { mark });
  const seriesMark = seriesMarkOf(appointment, tileSettings);
  const color = disciplineColorFor(appointment.discipline, tileSettings);

  return (
    <span
      className="agd-card agd-card--filled agd-card--scheduled agcfg-sample agcfg-mark-tile"
      style={appointmentCardStyle(color, seriesMark)}
      {...appointmentLookAttrs(appointment, tileSettings)}
      aria-hidden="true"
    >
      <SeriesBadge mark={seriesMark} className={`agd-chip agd-chip--series agd-chip--${kind}`} />
    </span>
  );
}

function SeriesBadgePicker({ kind, badge, preview, highlighted, highlightLabel, onChange, onReset, onHighlight }) {
  const info = SERIES_KIND_INFO[kind];
  const idBase = `agcfg-badge-${kind}`;
  const typed = cleanSeriesLabel(badge.label);
  const current = preview.seriesBadges[kind];
  const isDefault = BADGE_FIELDS.every(field => current[field] === SERIES_BADGE_DEFAULTS[kind][field]);
  const currentMark = SERIES_MARK_STYLES.find(option => option.id === badge.mark);

  return (
    <section className={`agcfg-badge${highlighted ? '' : ' is-idle'}`} aria-labelledby={`${idBase}-title`}>
      <header className="agcfg-badge-head">
        <div>
          <h5 id={`${idBase}-title`} className="agcfg-badge-title">Selo {current.label}</h5>
          <p className="agcfg-badge-sub">{info.sub}</p>
        </div>
        <button type="button" className="agcfg-link" onClick={onReset} disabled={isDefault}>
          Voltar ao padrão
        </button>
      </header>

      <SampleCard appointment={info.appointment} settings={{ ...preview, seriesHighlight: kind }} caption="Acup." />

      {!highlighted && (
        <p className="agcfg-badge-note">
          Hoje este selo não aparece nos cards; o nome continua no detalhe do agendamento.{' '}
          <button type="button" className="agcfg-link" onClick={onHighlight}>{highlightLabel}</button>
        </p>
      )}

      <div className="agcfg-group">
        <div className="agcfg-group-head">
          <label className="agcfg-group-label" htmlFor={`${idBase}-name`}>Nome</label>
          <span className="agcfg-counter" aria-hidden="true">
            {Array.from(badge.label).length}/{SERIES_LABEL_MAX_LENGTH}
          </span>
        </div>
        <input
          id={`${idBase}-name`}
          className="ag-input"
          type="text"
          maxLength={SERIES_LABEL_MAX_LENGTH}
          value={badge.label}
          onChange={e => onChange({ label: e.target.value })}
          // Campo vazio não vira selo vazio: volta ao nome padrão.
          onBlur={() => { if (!typed) onChange({ label: SERIES_BADGE_DEFAULTS[kind].label }); }}
          autoComplete="off"
        />
        <div className="agcfg-suggestions" role="group" aria-label="Sugestões de nome">
          {SERIES_LABEL_SUGGESTIONS[kind].map(name => (
            <button
              key={name}
              type="button"
              className={`agcfg-chip agcfg-chip--small${typed === name ? ' is-on' : ''}`}
              aria-pressed={typed === name}
              onClick={() => onChange({ label: name })}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="agcfg-group">
        <span id={`${idBase}-color`} className="agcfg-group-label">Cor do selo</span>
        <div className="agcfg-swatches" role="radiogroup" aria-labelledby={`${idBase}-color`}>
          <button
            type="button"
            role="radio"
            aria-checked={!badge.color}
            className={`agcfg-swatch agcfg-swatch--default agcfg-swatch--plain${!badge.color ? ' is-on' : ''}`}
            onClick={() => onChange({ color: '' })}
            title="Selo branco com o texto na cor do card"
          >
            Branco
          </button>
          {AGENDA_COLOR_PALETTE.map(color => (
            <button
              key={color.value}
              type="button"
              role="radio"
              aria-checked={badge.color === color.value}
              aria-label={color.label}
              title={color.label}
              className={`agcfg-swatch${badge.color === color.value ? ' is-on' : ''}`}
              style={{ '--swatch': color.value }}
              onClick={() => onChange({ color: color.value })}
            />
          ))}
        </div>
      </div>

      <div className="agcfg-group">
        <span id={`${idBase}-icon`} className="agcfg-group-label">Ícone</span>
        <div className="agcfg-choices agcfg-choices--inline" role="radiogroup" aria-labelledby={`${idBase}-icon`}>
          {SERIES_ICONS.map(icon => (
            <label key={icon.id} className={`agcfg-chip agcfg-chip--small${badge.icon === icon.id ? ' is-on' : ''}`}>
              <input
                type="radio"
                name={`${idBase}-icon`}
                value={icon.id}
                checked={badge.icon === icon.id}
                onChange={() => onChange({ icon: icon.id })}
              />
              <SeriesIcon id={icon.id} className="agcfg-icon" />
              {icon.label}
            </label>
          ))}
        </div>
      </div>

      <div className="agcfg-group">
        <span id={`${idBase}-mark`} className="agcfg-group-label">Moldura do card</span>
        <div className="agcfg-marks" role="radiogroup" aria-labelledby={`${idBase}-mark`}>
          {SERIES_MARK_STYLES.map(option => (
            <label
              key={option.id}
              className={`agcfg-mark${badge.mark === option.id ? ' is-on' : ''}`}
              title={option.hint}
            >
              <input
                type="radio"
                name={`${idBase}-mark`}
                value={option.id}
                checked={badge.mark === option.id}
                onChange={() => onChange({ mark: option.id })}
                aria-label={`${option.label}: ${option.hint}`}
              />
              <MarkTile kind={kind} mark={option.id} settings={preview} />
              <span className="agcfg-mark-label">{option.label}</span>
            </label>
          ))}
        </div>
        {currentMark && <p className="agcfg-option-hint">{currentMark.hint}</p>}
      </div>
    </section>
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
  // O rascunho guarda o nome do selo como está sendo digitado; as amostras
  // mostram o que seria gravado. Exceção: com os dois nomes iguais a
  // normalização volta ao padrão, mas a amostra mantém o digitado para o
  // problema ficar à vista junto do aviso.
  const preview = useMemo(() => {
    const normalized = normalizeAgendaSettings(draft);
    const seriesBadges = {};
    for (const kind of SERIES_KINDS) {
      const typed = cleanSeriesLabel(draft.seriesBadges?.[kind]?.label);
      seriesBadges[kind] = { ...normalized.seriesBadges[kind], label: typed || normalized.seriesBadges[kind].label };
    }
    return { ...normalized, seriesBadges };
  }, [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const gridInvalid = draft.fallbackDayEndHour <= draft.fallbackDayStartHour;
  const labelsClash = seriesLabelsClash(draft.seriesBadges);
  const invalid = gridInvalid || labelsClash;
  const fixedLabel = seriesLabelOf('fixed', preview);
  const oneOffLabel = seriesLabelOf('one-off', preview);
  // "Destacar os dois" com selos idênticos fora o nome: vale o aviso.
  const badgesLookAlike = draft.seriesHighlight === 'both'
    && ['color', 'icon', 'mark'].every(field => preview.seriesBadges.fixed[field] === preview.seriesBadges['one-off'][field]);
  const disciplines = DISCIPLINES.filter(item => item.available);

  function change(patch) {
    setDraft(prev => ({ ...prev, ...patch }));
    setSavedNote('');
  }

  function changeBadge(kind, patch) {
    setDraft(prev => ({
      ...prev,
      seriesBadges: { ...prev.seriesBadges, [kind]: { ...prev.seriesBadges[kind], ...patch } },
    }));
    setSavedNote('');
  }

  // Atalho do selo que não aparece: sem destaque nenhum, passa a destacar
  // só ele; com o outro destacado, passa a destacar os dois.
  function highlightAlso(kind) {
    change({ seriesHighlight: draft.seriesHighlight === 'none' ? kind : 'both' });
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
    if (invalid) return;
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
        <div className="help-actions">
          <ScreenHelp topic={AGENDA_HELP.configurar} />
          <HubBackButton nested className="ag-btn" label="Voltar à agenda" onClick={handleBack} />
        </div>
      </header>

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
        <a href="#agcfg-serie">{fixedLabel} × {oneOffLabel}</a>
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
          settings={preview}
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
          settings={preview}
          onChange={id => change({ noShowLook: id })}
        />
      </div>

      <fieldset className="agcfg-section" id="agcfg-serie">
        <legend className="agcfg-legend">{fixedLabel} × {oneOffLabel}</legend>
        <p className="agcfg-help">
          <b>{fixedLabel}</b> é a sessão de um pacote no horário do pacote (ex.: toda terça às 14h).
          <b> {oneOffLabel}</b> é o marcado só para aquele dia, ou a sessão do pacote que foi movida
          (ex.: nesta semana foi para sexta), e não se repete nas próximas semanas. O card destacado
          ganha um selo e uma moldura, e os dois são seus: nome, cor, ícone e moldura de cada um.
        </p>

        <div className="agcfg-step">
          <h4 className="agcfg-subtitle"><span className="agcfg-step-n" aria-hidden="true">1</span>O que ganha destaque</h4>
          <div className="agcfg-choices" role="radiogroup" aria-label="O que ganha destaque">
            {SERIES_HIGHLIGHTS.map(option => (
              <label key={option.id} className={`agcfg-choice${draft.seriesHighlight === option.id ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="seriesHighlight"
                  value={option.id}
                  checked={draft.seriesHighlight === option.id}
                  onChange={() => change({ seriesHighlight: option.id })}
                />
                <span className="agcfg-option-label">{seriesHighlightLabel(option, preview)}</span>
                <span className="agcfg-option-hint">{option.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="agcfg-step">
          <h4 className="agcfg-subtitle"><span className="agcfg-step-n" aria-hidden="true">2</span>Como fica na agenda</h4>
          <div className="agcfg-pair" aria-label="Amostra da agenda">
            <div>
              <span className="agcfg-pair-label">Ter 14:00 · pacote</span>
              <SampleCard
                appointment={SERIES_KIND_INFO.fixed.appointment}
                settings={preview}
                caption="Acup."
              />
            </div>
            <div>
              <span className="agcfg-pair-label">Sex 10:00 · só nesta semana</span>
              <SampleCard
                appointment={SERIES_KIND_INFO['one-off'].appointment}
                settings={preview}
                caption="Acup."
              />
            </div>
          </div>
          {badgesLookAlike && (
            <p className="agcfg-badge-note">
              Os dois selos estão com a mesma cor, o mesmo ícone e a mesma moldura: de longe, só o
              nome diferencia. Vale trocar a moldura ou a cor de um deles no passo 3.
            </p>
          )}
        </div>

        <div className="agcfg-step">
          <h4 className="agcfg-subtitle"><span className="agcfg-step-n" aria-hidden="true">3</span>Cada selo: nome, cor, ícone e moldura</h4>
          <p className="agcfg-help">
            O nome aparece no card e no detalhe do agendamento (até {SERIES_LABEL_MAX_LENGTH} letras).
            As cores são as mesmas das disciplinas: todas legíveis com texto branco, nenhuma vermelha.
            O selo aparece sempre; a moldura é o reforço para ver de longe.
          </p>
          <div className="agcfg-badges">
            {SERIES_KINDS.map(kind => (
              <SeriesBadgePicker
                key={kind}
                kind={kind}
                badge={draft.seriesBadges[kind]}
                preview={preview}
                highlighted={isSeriesKindHighlighted(kind, draft)}
                highlightLabel={draft.seriesHighlight === 'none'
                  ? `Destacar ${seriesLabelOf(kind, preview)}`
                  : 'Destacar os dois'}
                onChange={patch => changeBadge(kind, patch)}
                onReset={() => changeBadge(kind, { ...SERIES_BADGE_DEFAULTS[kind] })}
                onHighlight={() => highlightAlso(kind)}
              />
            ))}
          </div>
          {labelsClash && (
            <p className="agcfg-invalid" role="alert">
              Os dois selos estão com o mesmo nome. Use nomes diferentes para dar para distinguir.
            </p>
          )}
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
                  settings={{ ...preview, seriesHighlight: 'none' }}
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
          disabled={saving || !dirty || invalid}
        >
          {saving ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  );
}

export default AgendaSettingsEditor;
