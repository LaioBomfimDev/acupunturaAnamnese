/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_BRAND_COLOR,
  deleteClinic,
  listClinics,
  listProfilesWithClinic,
  saveClinic,
  setProfileClinic,
} from '../../services/clinicService';

const EMPTY_CLINIC = {
  id: null,
  name: '',
  legal_name: '',
  cnpj: '',
  address: '',
  phone: '',
  email: '',
  brand_color: DEFAULT_BRAND_COLOR,
  logo_url: '',
  notes: '',
};

// Limite generoso para o data URL guardado na linha da clínica (~250 KB).
const MAX_LOGO_DATA_URL = 250 * 1024;

// Lê o arquivo enviado pelo adm e devolve um data URL pronto para o
// papel timbrado. Bitmaps são redimensionados (lado maior ≤ 480px) e
// recomprimidos em PNG para manter transparência; SVG é mantido como vetor.
function readLogoFile(file, maxSize = 480) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!/^image\//.test(file.type)) {
      return reject(new Error('Selecione um arquivo de imagem (PNG, JPG, WEBP ou SVG).'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');

      if (file.type === 'image/svg+xml') {
        if (dataUrl.length > MAX_LOGO_DATA_URL) {
          return reject(new Error('SVG muito grande. Use um arquivo de até ~250 KB.'));
        }
        return resolve(dataUrl);
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Não foi possível processar a imagem.'));
      img.onload = () => {
        const longest = Math.max(img.width, img.height) || 1;
        const scale = Math.min(1, maxSize / longest);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // PNG preserva transparência; cai para JPEG se ficar grande demais.
        let out = canvas.toDataURL('image/png');
        if (out.length > MAX_LOGO_DATA_URL) {
          out = canvas.toDataURL('image/jpeg', 0.85);
        }
        if (out.length > MAX_LOGO_DATA_URL) {
          return reject(new Error('Logo muito pesada após o ajuste. Tente uma imagem menor.'));
        }
        resolve(out);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function maskCnpj(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

function normalizeHexColor(value) {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text}`;
  return null;
}

export function ClinicAdminPanel() {
  const [clinics, setClinics] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [form, setForm] = useState(EMPTY_CLINIC);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigningId, setAssigningId] = useState('');
  const [logoLoading, setLogoLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const logoInputRef = useRef(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [clinicList, profileList] = await Promise.all([
        listClinics(),
        listProfilesWithClinic(),
      ]);
      setClinics(clinicList);
      setProfessionals(profileList);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar as clínicas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function startEdit(clinic) {
    setForm({ ...EMPTY_CLINIC, ...clinic });
    setError('');
    setSuccess('');
  }

  function resetForm() {
    setForm(EMPTY_CLINIC);
    if (logoInputRef.current) logoInputRef.current.value = '';
  }

  async function handleLogoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');
    setLogoLoading(true);
    try {
      const dataUrl = await readLogoFile(file);
      setField('logo_url', dataUrl);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a logo.');
    } finally {
      setLogoLoading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  function removeLogo() {
    setField('logo_url', '');
    if (logoInputRef.current) logoInputRef.current.value = '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.name.trim()) {
      setError('Informe o nome da clínica.');
      return;
    }

    setSaving(true);
    try {
      const saved = await saveClinic(form);
      setSuccess(`Clínica "${saved.name}" salva.`);
      resetForm();
      await load();
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a clínica.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(clinic) {
    const linked = professionals.filter(p => p.clinic_id === clinic.id).length;
    const warning = linked
      ? `Excluir a clínica "${clinic.name}"? ${linked} profissional(is) ficarão sem vínculo.`
      : `Excluir a clínica "${clinic.name}"?`;
    if (!window.confirm(warning)) return;

    setError('');
    setSuccess('');
    try {
      await deleteClinic(clinic.id);
      if (form.id === clinic.id) resetForm();
      setSuccess('Clínica removida.');
      await load();
    } catch (err) {
      setError(err.message || 'Não foi possível remover a clínica.');
    }
  }

  async function handleAssign(profileId, clinicId) {
    setAssigningId(profileId);
    setError('');
    setSuccess('');
    try {
      await setProfileClinic(profileId, clinicId || null);
      setProfessionals(prev => prev.map(p => (
        p.id === profileId ? { ...p, clinic_id: clinicId || null } : p
      )));
      setSuccess('Vínculo atualizado.');
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar o vínculo.');
    } finally {
      setAssigningId('');
    }
  }

  const brandColor = normalizeHexColor(form.brand_color) || DEFAULT_BRAND_COLOR;

  return (
    <div className="clinic-admin">
      {(error || success) && (
        <div className={error ? 'inline-error' : 'inline-success'}>
          {error || success}
        </div>
      )}

      <section className="admin-layout admin-layout-single">
        <form className="admin-create-form" onSubmit={handleSubmit}>
          <div className="start-panel-head">
            <div>
              <p className="small">{form.id ? 'Editar clínica' : 'Nova clínica'}</p>
              <h2>{form.id ? form.name || 'Clínica' : 'Cadastrar clínica'}</h2>
            </div>
            {form.id && (
              <button className="tag" type="button" onClick={resetForm}>
                Cancelar edição
              </button>
            )}
          </div>

          <div className="admin-form-grid">
            <label>
              Nome da clínica *
              <input
                value={form.name}
                onChange={event => setField('name', event.target.value)}
                placeholder="Nome fantasia"
                required
              />
            </label>
            <label>
              Razão social
              <input
                value={form.legal_name}
                onChange={event => setField('legal_name', event.target.value)}
                placeholder="Razão social completa"
              />
            </label>
            <label>
              CNPJ
              <input
                value={form.cnpj}
                onChange={event => setField('cnpj', maskCnpj(event.target.value))}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
              />
            </label>
            <label>
              Telefone
              <input
                value={form.phone}
                onChange={event => setField('phone', event.target.value)}
                placeholder="(00) 00000-0000"
              />
            </label>
            <label className="admin-notes">
              Endereço completo
              <input
                value={form.address}
                onChange={event => setField('address', event.target.value)}
                placeholder="Rua, número, bairro, cidade - UF, CEP"
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={form.email}
                onChange={event => setField('email', event.target.value)}
                placeholder="contato@clinica.com"
              />
            </label>
            <label>
              Cor da clínica
              <span className="clinic-color-field">
                <input
                  type="color"
                  value={brandColor}
                  onChange={event => setField('brand_color', event.target.value)}
                  aria-label="Selecionar cor da clínica"
                />
                <input
                  value={form.brand_color}
                  onChange={event => setField('brand_color', event.target.value)}
                  placeholder={DEFAULT_BRAND_COLOR}
                />
              </span>
            </label>
            <div className="admin-notes clinic-logo-field">
              <span className="clinic-logo-field-label">Logo da clínica</span>
              <div className="clinic-logo-uploader">
                <div className={`clinic-logo-thumb${form.logo_url ? '' : ' empty'}`}>
                  {form.logo_url
                    ? <img src={form.logo_url} alt="Logo da clínica" />
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
                      disabled={logoLoading}
                    >
                      {logoLoading ? 'Processando…' : form.logo_url ? 'Trocar logo' : 'Enviar logo'}
                    </button>
                    {form.logo_url && (
                      <button className="quiet-button" type="button" onClick={removeLogo} disabled={logoLoading}>
                        Remover
                      </button>
                    )}
                  </div>
                  <small>PNG, JPG, WEBP ou SVG. Sai no topo de todos os relatórios. Fundo transparente recomendado.</small>
                </div>
              </div>
            </div>
            <label className="admin-notes">
              Observações
              <textarea
                value={form.notes}
                onChange={event => setField('notes', event.target.value)}
                placeholder="Dados internos da unidade"
              />
            </label>
          </div>

          <div className="clinic-letterhead-preview" style={{ '--clinic-accent': brandColor }}>
            <div className="clinic-letterhead-preview-brand">
              {form.logo_url
                ? <img className="clinic-letterhead-preview-logo" src={form.logo_url} alt="Logo da clínica" />
                : <span className="clinic-letterhead-preview-monogram">{(form.name || 'C').trim().charAt(0).toUpperCase()}</span>}
              <div>
                <b>{form.name || 'Nome da clínica'}</b>
                <small>
                  {[form.legal_name, form.cnpj && `CNPJ ${form.cnpj}`].filter(Boolean).join(' • ') || 'Prévia do papel timbrado dos relatórios'}
                </small>
              </div>
            </div>
            <div className="clinic-letterhead-preview-contact" aria-label="Prévia do contato no PDF">
              <span>
                Telefone
                <strong>{form.phone || 'Telefone não informado'}</strong>
              </span>
              <span>
                Endereço
                <strong>{form.address || 'Endereço não informado'}</strong>
              </span>
            </div>
            <span className="clinic-letterhead-bar" />
          </div>

          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Cadastrar clínica'}
            </button>
          </div>
        </form>
      </section>

      <section className="admin-users">
        <div className="start-panel-head">
          <div>
            <p className="small">Clínicas</p>
            <h2>Unidades cadastradas</h2>
          </div>
          <button className="quiet-button" type="button" onClick={load} disabled={loading}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Carregando clínicas...</div>
        ) : clinics.length === 0 ? (
          <div className="empty-state">Nenhuma clínica cadastrada ainda.</div>
        ) : (
          <div className="admin-user-list">
            {clinics.map(clinic => {
              const linked = professionals.filter(p => p.clinic_id === clinic.id);
              return (
                <div className="admin-user-row clinic-row" key={clinic.id}>
                  <span
                    className="clinic-color-swatch"
                    style={{ background: clinic.brand_color || DEFAULT_BRAND_COLOR }}
                    title={`Cor: ${clinic.brand_color || DEFAULT_BRAND_COLOR}`}
                  />
                  <div className="admin-user-main">
                    <b>{clinic.name}</b>
                    <small>
                      {[clinic.cnpj && `CNPJ ${clinic.cnpj}`, clinic.phone, clinic.email]
                        .filter(Boolean).join(' • ') || 'Dados institucionais pendentes'}
                    </small>
                    <em>{clinic.address || 'Endereço não informado'}</em>
                  </div>
                  <div className="admin-user-insights">
                    <span>
                      <b>{linked.length}</b>
                      profissional(is)
                    </span>
                  </div>
                  <div className="clinic-row-actions">
                    <button className="tag" type="button" onClick={() => startEdit(clinic)}>
                      Editar
                    </button>
                    <button className="quiet-button" type="button" onClick={() => handleDelete(clinic)}>
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-users">
        <div className="start-panel-head">
          <div>
            <p className="small">Vínculos</p>
            <h2>Profissional ↔ Clínica</h2>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Carregando profissionais...</div>
        ) : professionals.length === 0 ? (
          <div className="empty-state">Nenhum profissional disponível para vincular.</div>
        ) : (
          <div className="admin-user-list">
            {professionals.map(profile => (
              <div className="admin-user-row clinic-row" key={profile.id}>
                <div className="admin-user-main">
                  <b>{profile.full_name || profile.email}</b>
                  <small>{profile.email}</small>
                </div>
                <label className="clinic-assign-field">
                  Clínica
                  <select
                    value={profile.clinic_id || ''}
                    onChange={event => handleAssign(profile.id, event.target.value)}
                    disabled={assigningId === profile.id}
                  >
                    <option value="">Sem vínculo</option>
                    {clinics.map(clinic => (
                      <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
