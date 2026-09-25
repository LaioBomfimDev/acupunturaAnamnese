import { useState } from 'react';
import { MeuCadastro } from './MeuCadastro';
import { PersonalAccentPicker } from './PersonalAccentPicker';
import '../../styles/gestao.css';

// ============================================================
// Gestão de quem NÃO é admin da instituição (profissional, recepção):
// só o que é da própria pessoa — a cor da própria tela e o próprio
// cadastro. Nada de faltosos, indicadores, papel timbrado, logo ou
// configuração da clínica; isso fica na Gestão do admin
// (RelatoriosGestao). Componente separado de propósito: não monta
// nenhuma consulta institucional.
// ============================================================

const SECTIONS = [
  { id: 'personalizar', label: 'Personalizar' },
  { id: 'cadastro', label: 'Meu cadastro' },
];

const TAB_ICONS = {
  personalizar: (
    <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.9-.3-.9.3-1.8 1.3-1.8H17a4 4 0 0 0 4-4c0-5.1-4-10.3-9-10.3Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14.5" cy="7" r="1" /></>
  ),
  cadastro: (
    <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16.2a3.4 3.4 0 0 1 6.4 0" /><path d="M14.5 10h4M14.5 13.5h3" /></>
  ),
};

export function GestaoProfissional({ profile, initialSection = null }) {
  const [section, setSection] = useState(() => (
    SECTIONS.some(item => item.id === initialSection) ? initialSection : 'personalizar'
  ));

  return (
    <div className="gt">
      <div className="gt-tabs" role="tablist" aria-label="Gestão">
        {SECTIONS.map(item => (
          <button
            key={item.id}
            type="button"
            className="gt-tab"
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {TAB_ICONS[item.id]}
            </svg>
            {item.label}
          </button>
        ))}
      </div>

      {section === 'personalizar' && (
        <section className="gt-custom">
          <p className="gt-note">
            Aqui você ajusta só a sua tela. Cadastro da instituição, papel timbrado e logo
            ficam com a administração, e os documentos saem sempre com a cor da instituição.
          </p>
          <PersonalAccentPicker profile={profile} />
        </section>
      )}

      {section === 'cadastro' && <MeuCadastro profile={profile} />}
    </div>
  );
}

export default GestaoProfissional;
