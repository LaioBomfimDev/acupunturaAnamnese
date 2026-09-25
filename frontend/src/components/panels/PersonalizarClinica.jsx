import { useRef, useState } from 'react';
import { useAuth } from '../../hooks/AuthContext';
import {
  CLINIC_BRAND_COLORS,
  CLINIC_LETTERHEAD_COLORS,
  DEFAULT_BRAND_COLOR,
  updateClinicAppearance,
  updateClinicLogo,
  updateClinicPersonalAccent,
} from '../../services/clinicService';
import { readLogoFile } from '../../utils/clinicLogo';
import { colorLabel, sameColor } from '../../utils/colorOptions';
import { buildReportAccentPalette } from '../../utils/reportUtils';
import { AppColorPreview, ColorPresets } from './ColorPresets';
import { PersonalAccentPicker } from './PersonalAccentPicker';

// ============================================================
// Gestão → Personalizar: o clinic_admin escolhe a cor do sistema, se
// quiser uma cor diferente pro papel timbrado (ex.: rosa na tela, azul
// nos documentos) e o logo da instituição. Só cores da paleta curada —
// ver CLINIC_BRAND_COLORS. Grava via RPCs clinic_admin_update_appearance
// e clinic_admin_update_logo (cada uma só mexe nos próprios campos).
//
// Cor fixa ou livre (2026-09-25): o admin decide se a cor do sistema
// vale para toda a equipe ou se cada profissional escolhe a da própria
// tela (clinic_admin_set_personal_accent). Documentos não mudam.
// ============================================================

export function PersonalizarClinica({ profile }) {
  const { refreshProfile } = useAuth();
  const clinic = profile?.clinic || null;
  const initialBrand = clinic?.brand_color || DEFAULT_BRAND_COLOR;
  const initialLetterhead = clinic?.letterhead_color || '';
  const initialLogo = clinic?.logo_url || '';
  const initialWatermark = clinic?.logo_watermark !== false;
  const initialPersonalAllowed = clinic?.personal_accent_allowed === true;

  const [brandColor, setBrandColor] = useState(initialBrand);
  const [personalAllowed, setPersonalAllowed] = useState(initialPersonalAllowed);
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
  const policyDirty = personalAllowed !== initialPersonalAllowed;
  const dirty = colorsDirty || logoDirty || policyDirty;

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
      if (policyDirty) {
        await updateClinicPersonalAccent(personalAllowed);
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
    setPersonalAllowed(initialPersonalAllowed);
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
        diferentes. Você também decide se a cor da tela é fixa para toda a equipe ou se cada
        profissional escolhe a sua. Documentos saem sempre com a cor da instituição.
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
          <fieldset className="gt-accent-policy">
            <legend>Quem escolhe a cor da tela</legend>
            <label className={`gt-accent-policy-option${personalAllowed ? '' : ' selected'}`}>
              <input
                type="radio"
                name="personal-accent-policy"
                checked={!personalAllowed}
                onChange={() => setPersonalAllowed(false)}
              />
              <span>
                <b>Cor fixa para toda a equipe</b>
                <small>Ninguém troca; todos veem esta cor.</small>
              </span>
            </label>
            <label className={`gt-accent-policy-option${personalAllowed ? ' selected' : ''}`}>
              <input
                type="radio"
                name="personal-accent-policy"
                checked={personalAllowed}
                onChange={() => setPersonalAllowed(true)}
              />
              <span>
                <b>Cada profissional escolhe a sua</b>
                <small>Esta cor vira o padrão de quem não escolher.</small>
              </span>
            </label>
          </fieldset>
          <AppColorPreview palette={brandPalette} title={clinic.name} />
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

      {/* Com a escolha liberada (já salva), o admin também escolhe a cor da
          própria tela, igual a qualquer profissional. */}
      {initialPersonalAllowed && (
        <div className="gt-accent-own">
          <h3>Sua tela</h3>
          <PersonalAccentPicker profile={profile} />
        </div>
      )}
    </section>
  );
}
