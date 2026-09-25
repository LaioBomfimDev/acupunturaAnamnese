import { useState } from 'react';
import { useAuth } from '../../hooks/AuthContext';
import { CLINIC_BRAND_COLORS, DEFAULT_BRAND_COLOR } from '../../services/clinicService';
import { updateMyAccentColor } from '../../services/myProfileService';
import { colorLabel, sameColor } from '../../utils/colorOptions';
import { buildReportAccentPalette } from '../../utils/reportUtils';
import { isPersonalAccentAllowed } from '../../utils/screenAccent';
import { AppColorPreview, ColorPresets } from './ColorPresets';

// ============================================================
// Cor da própria tela (Gestão → Personalizar). Só existe escolha quando
// a instituição liberou (clinics.personal_accent_allowed); com a cor
// travada, a tela explica quem decide e mostra a cor em vigor. Vale só
// para a interface: relatórios e papel timbrado seguem a instituição.
// ============================================================

export function PersonalAccentPicker({ profile }) {
  const { refreshProfile } = useAuth();
  const clinic = profile?.clinic || null;
  const clinicColor = clinic?.brand_color || DEFAULT_BRAND_COLOR;
  const clinicColorName = colorLabel(CLINIC_BRAND_COLORS, clinicColor);
  const allowed = isPersonalAccentAllowed(profile);
  const saved = profile?.accent_color || '';

  // '' = seguir a cor da instituição.
  const [choice, setChoice] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const followsClinic = !choice;
  const palette = buildReportAccentPalette(allowed ? (choice || clinicColor) : clinicColor);
  const dirty = !sameColor(choice, saved);
  const previewTitle = clinic?.name || 'Sua tela';

  function pick(value) {
    setChoice(value);
    setError('');
    setSuccess('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateMyAccentColor(choice || null);
      await refreshProfile();
      setSuccess(choice
        ? 'Pronto: a sua tela já usa a nova cor. Relatórios e documentos continuam com a cor da instituição.'
        : 'Pronto: a sua tela voltou para a cor da instituição.');
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a cor da sua tela.');
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <article className="gt-custom-card gt-accent-card">
        <header>
          <h3>Cor da sua tela</h3>
          <span>{clinicColorName}</span>
        </header>
        <div className="gt-notice gt-accent-locked">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span>
            A administração da instituição definiu uma <b>cor fixa para toda a equipe</b>.
            Só ela pode liberar a escolha individual, em Gestão → Personalizar.
            {saved && ' A sua escolha anterior fica guardada e volta se a cor for liberada de novo.'}
          </span>
        </div>
        <AppColorPreview palette={palette} title={previewTitle} />
      </article>
    );
  }

  return (
    <article className="gt-custom-card gt-accent-card">
      <header>
        <h3>Cor da sua tela</h3>
        <span>{followsClinic ? `Cor da instituição (${clinicColorName})` : colorLabel(CLINIC_BRAND_COLORS, choice)}</span>
      </header>
      <p className="gt-custom-help">
        Botões, aba ativa e destaques só na sua tela. Quem entra com outro login continua vendo a cor dele.
      </p>

      {(error || success) && (
        <div className={`gt-notice${error ? ' gt-notice-error' : ''}`} role="status">
          {error || success}
        </div>
      )}

      <div className="gt-accent-options">
        <button
          type="button"
          className={`gt-accent-follow${followsClinic ? ' selected' : ''}`}
          aria-pressed={followsClinic}
          onClick={() => pick('')}
        >
          <span className="gt-accent-follow-swatch" style={{ background: clinicColor }} />
          Cor da instituição
        </button>
        <ColorPresets
          options={CLINIC_BRAND_COLORS}
          value={choice}
          onChange={pick}
          label="Cor da sua tela"
        />
      </div>

      <AppColorPreview palette={palette} title={previewTitle} />

      <div className="gt-custom-actions">
        <button type="button" className="quiet-button" onClick={() => pick(saved)} disabled={!dirty || saving}>
          Desfazer
        </button>
        <button type="button" className="primary-button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Salvando…' : 'Salvar minha cor'}
        </button>
      </div>
    </article>
  );
}
