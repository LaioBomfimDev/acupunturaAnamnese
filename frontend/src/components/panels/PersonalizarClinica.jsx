import { useRef, useState } from 'react';
import { useAuth } from '../../hooks/AuthContext';
import {
  CLINIC_BRAND_COLORS,
  CLINIC_LETTERHEAD_COLORS,
  DEFAULT_BRAND_COLOR,
  updateClinicAppearance,
  updateClinicLogo,
} from '../../services/clinicService';
import { readLogoFile } from '../../utils/clinicLogo';
import { buildReportAccentPalette } from '../../utils/reportUtils';

// ============================================================
// Gestão → Personalizar: o clinic_admin escolhe a cor do sistema, se
// quiser uma cor diferente pro papel timbrado (ex.: rosa na tela, azul
// nos documentos) e o logo da instituição. Só cores da paleta curada —
// ver CLINIC_BRAND_COLORS. Grava via RPCs clinic_admin_update_appearance
// e clinic_admin_update_logo (cada uma só mexe nos próprios campos).
// ============================================================

function sameColor(a, b) {
  return String(a || '').toUpperCase() === String(b || '').toUpperCase();
}

function ColorPresets({ options, value, onChange, label }) {
  return (
    <div className="clinic-color-presets" role="radiogroup" aria-label={label}>
      {options.map(option => {
        const selected = sameColor(value, option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={`clinic-color-preset${selected ? ' selected' : ''}`}
            style={{ background: option.value }}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
          >
            {selected && (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12l5 5L20 6" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

function colorLabel(options, value) {
  return options.find(option => sameColor(option.value, value))?.label || value;
}

export function PersonalizarClinica({ profile }) {
  const { refreshProfile } = useAuth();
  const clinic = profile?.clinic || null;
  const initialBrand = clinic?.brand_color || DEFAULT_BRAND_COLOR;
  const initialLetterhead = clinic?.letterhead_color || '';
  const initialLogo = clinic?.logo_url || '';
  const initialWatermark = clinic?.logo_watermark !== false;

  const [brandColor, setBrandColor] = useState(initialBrand);
  const [separateLetterhead, setSeparateLetterhead] = useState(Boolean(initialLetterhead));
  const [letterheadColor, setLetterheadColor] = useState(initialLetterhead || initialBrand);
  const [logoUrl, setLogoUrl] = useState(initialLogo);
  const [watermark, setWatermark] = useState(initialWatermark);
  const [logoLoading, setLogoLoading] = useState(false);
  const logoInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const effectiveLetterhead = separateLetterhead ? letterheadColor : brandColor;
  const brandPalette = buildReportAccentPalette(brandColor);
  const letterheadPalette = buildReportAccentPalette(effectiveLetterhead);
  const colorsDirty = !sameColor(brandColor, initialBrand)
    || !sameColor(separateLetterhead ? letterheadColor : '', initialLetterhead);
  const logoDirty = logoUrl !== initialLogo || (Boolean(logoUrl) && watermark !== initialWatermark);
  const dirty = colorsDirty || logoDirty;

  if (!clinic?.id) {
    return (
      <div className="gt-notice gt-notice-error">
        Seu usuário não está vinculado a uma instituição — não há o que personalizar.
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (colorsDirty) {
        await updateClinicAppearance({
          brandColor,
          letterheadColor: separateLetterhead ? letterheadColor : null,
        });
      }
      if (logoDirty) {
        await updateClinicLogo({ logoUrl, watermark });
      }
      await refreshProfile();
      setSuccess('Personalização salva. O sistema e os próximos documentos já usam a nova escolha.');
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a personalização.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setBrandColor(initialBrand);
    setSeparateLetterhead(Boolean(initialLetterhead));
    setLetterheadColor(initialLetterhead || initialBrand);
    setLogoUrl(initialLogo);
    setWatermark(initialWatermark);
    setError('');
    setSuccess('');
  }

  async function handleLogoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');
    setLogoLoading(true);
    try {
      setLogoUrl(await readLogoFile(file, { keepSvg: false }));
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o logo.');
    } finally {
      setLogoLoading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  return (
    <section className="gt-custom">
      <p className="gt-note">
        Escolha a cor que a equipe vê no sistema, a cor que sai nos documentos (relatórios,
        evoluções e papel timbrado) e o logo da instituição. As cores podem ser iguais ou
        diferentes. A mudança vale para toda a instituição.
      </p>

      {(error || success) && (
        <div className={`gt-notice${error ? ' gt-notice-error' : ''}`} role="status">
          {error || success}
        </div>
      )}

      <div className="gt-custom-grid">
        <article className="gt-custom-card">
          <header>
            <h3>Cor do sistema</h3>
            <span>{colorLabel(CLINIC_BRAND_COLORS, brandColor)}</span>
          </header>
          <p className="gt-custom-help">Botões, aba ativa e destaques da tela.</p>
          <ColorPresets
            options={CLINIC_BRAND_COLORS}
            value={brandColor}
            onChange={setBrandColor}
            label="Cor do sistema"
          />
          <div className="gt-custom-preview gt-custom-preview-app" aria-hidden="true">
            <div className="gt-custom-app-bar">
              <span className="gt-custom-app-dot" style={{ background: brandPalette.accent }} />
              <b>{clinic.name}</b>
            </div>
            <div className="gt-custom-app-tabs">
              <span style={{ color: brandPalette.shade, borderColor: brandPalette.accent }}>Agenda</span>
              <span>Pacientes</span>
              <span>Gestão</span>
            </div>
            <span className="gt-custom-app-button" style={{ background: brandPalette.shade }}>
              Novo agendamento
            </span>
          </div>
        </article>

        <article className="gt-custom-card">
          <header>
            <h3>Cor do papel timbrado</h3>
            <span>
              {separateLetterhead
                ? colorLabel(CLINIC_LETTERHEAD_COLORS, letterheadColor)
                : 'Igual ao sistema'}
            </span>
          </header>
          <label className="gt-switch-field">
            <span className={`gt-switch${separateLetterhead ? ' gt-switch-on' : ''}`}>
              <input
                type="checkbox"
                checked={separateLetterhead}
                onChange={event => setSeparateLetterhead(event.target.checked)}
              />
              <span className="gt-switch-thumb" />
            </span>
            Usar uma cor diferente nos documentos
          </label>
          {separateLetterhead && (
            <ColorPresets
              options={CLINIC_LETTERHEAD_COLORS}
              value={letterheadColor}
              onChange={setLetterheadColor}
              label="Cor do papel timbrado"
            />
          )}
          <div className="gt-custom-preview gt-custom-sheet" aria-hidden="true">
            <div className="gt-custom-sheet-head">
              {logoUrl
                ? <img src={logoUrl} alt="" />
                : <span className="gt-custom-sheet-logo" style={{ background: letterheadPalette.accent }} />}
              <div>
                <b style={{ color: letterheadPalette.shade }}>{clinic.name}</b>
                <small>Relatório de atendimento</small>
              </div>
            </div>
            <div className="gt-custom-sheet-rule">
              <span style={{ background: letterheadPalette.shade }} />
              <span style={{ background: letterheadPalette.accent }} />
              <span style={{ background: letterheadPalette.soft }} />
            </div>
            <div className="gt-custom-sheet-lines">
              <i /><i /><i /><i />
            </div>
          </div>
        </article>

        <article className="gt-custom-card">
          <header>
            <h3>Logo da instituição</h3>
            <span>{logoUrl ? 'Enviado' : 'Sem logo'}</span>
          </header>
          <p className="gt-custom-help">Sai no topo de todos os relatórios e documentos.</p>
          <div className="clinic-logo-uploader">
            <div className={`clinic-logo-thumb${logoUrl ? '' : ' empty'}`}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo da clínica" />
                : <span>Sem logo</span>}
            </div>
            <div className="clinic-logo-controls">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoChange}
                hidden
              />
              <div className="clinic-logo-buttons">
                <button
                  className="tag"
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoLoading || saving}
                >
                  {logoLoading ? 'Processando…' : logoUrl ? 'Trocar logo' : 'Enviar logo'}
                </button>
                {logoUrl && (
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={() => setLogoUrl('')}
                    disabled={logoLoading || saving}
                  >
                    Remover
                  </button>
                )}
              </div>
              <small>PNG, JPG, WEBP ou SVG. Fundo transparente recomendado.</small>
              <label className={`clinic-watermark-toggle${logoUrl ? '' : ' disabled'}`}>
                <input
                  type="checkbox"
                  checked={logoUrl ? watermark : false}
                  disabled={!logoUrl}
                  onChange={event => setWatermark(event.target.checked)}
                />
                <span>Usar o logo como marca d&apos;água (grande e transparente) no fundo dos relatórios</span>
              </label>
            </div>
          </div>
        </article>
      </div>

      <div className="gt-custom-actions">
        <button type="button" className="quiet-button" onClick={handleReset} disabled={!dirty || saving}>
          Desfazer
        </button>
        <button type="button" className="primary-button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Salvando…' : 'Salvar personalização'}
        </button>
      </div>
    </section>
  );
}
