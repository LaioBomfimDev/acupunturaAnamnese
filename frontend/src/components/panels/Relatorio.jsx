import { useState } from 'react';
import { Panel } from '../ui/Panel';

/* ── helpers ─────────────────────────────────────────────── */
function today() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function InlineRow({ label, value, fallback = 'Aguardando dados.' }) {
  return (
    <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
      <b>{label}:</b> {value || fallback}
    </p>
  );
}

const MODOS = ['Resumo clínico', 'Relatório profissional', 'Orientação ao paciente'];

export function Relatorio({ state, analysis, selectedPatient, therapistProfile }) {
  const [modo, setModo] = useState('Resumo clínico');
  const { main, detail, protocol, safety } = analysis;

  const nome    = selectedPatient?.name || state.nome || 'Paciente não informado';
  const idade   = state.idade    ? `${state.idade} anos` : 'idade não informada anos';
  const queixa  = state.queixa;
  const historia= state.historia;
  const terapeuta = therapistProfile?.full_name || state.terapeuta || 'Terapeuta';
  const therapistSpecialty = therapistProfile?.specialty || 'Acupuntura e MTC';
  const therapistRegistration = therapistProfile?.professional_registration || '';
  const therapistClinic = therapistProfile?.clinic_name || 'Reability';
  const therapistEmail = therapistProfile?.email || '';
  const evolucoes = Array.isArray(state.evolucoes) ? state.evolucoes : [];
  const ultimaEvolucao = evolucoes[evolucoes.length - 1];

  const bodyPts = protocol.body?.length ? protocol.body.join(', ') : 'aguardando dados';
  const earPts  = protocol.ear?.length  ? protocol.ear.join(', ')  : 'aguardando dados';
  const moxaPts = protocol.moxa?.length ? protocol.moxa.join(', ') : 'avaliar';
  const laserPts= protocol.laser?.length? protocol.laser.join(', '): 'avaliar';

  return (
    <Panel title="Relatório final premium">

      {/* ── barra de controles (não imprime) ──────────────── */}
      <div className="report-toolbar no-print">
        {MODOS.map(m => (
          <button
            key={m}
            className={`tag${modo === m ? ' active' : ''}`}
            onClick={() => setModo(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* ── alerta de segurança ───────────────────────────── */}
      {safety.length > 0 && (
        <div className="alert no-print" style={{ marginBottom: 16 }}>
          <b>⚠ Atenção clínica:</b> {safety.join(' • ')}
        </div>
      )}

      {/* ╔═══════════════════════════════════════════════════╗ */}
      {/* ║               CORPO DO RELATÓRIO                 ║ */}
      {/* ╚═══════════════════════════════════════════════════╝ */}
      <div className="report">

        {modo === 'Resumo clínico' && (
          <>
            <h2 style={{ margin: '0 0 24px', textTransform: 'uppercase', color: 'var(--navy)' }}>RESUMO CLÍNICO INTERNO</h2>
            <InlineRow label="Paciente" value={`${nome}.`} fallback="não informado." />
            <InlineRow label="Queixa" value={queixa ? `${queixa}.` : ''} fallback="não preenchida." />
            <InlineRow label="Hipótese atual" value={main ? `${main}.` : ''} />
            <InlineRow label="Princípio terapêutico" value={protocol?.goal} fallback="Preencha os dados para gerar raciocínio terapêutico." />
            <InlineRow label="Evoluções registradas" value={`${evolucoes.length}.`} />
            <InlineRow label="Conduta" value="manter acompanhamento e ajustar protocolo conforme resposta clínica." />
          </>
        )}

        {modo === 'Relatório profissional' && (
          <>
            <h2 style={{ margin: '0 0 8px', textTransform: 'uppercase', color: 'var(--navy)' }}>RELATÓRIO DE AVALIAÇÃO ENERGÉTICA INTEGRATIVA</h2>
            <p style={{ textAlign: 'center', margin: '0 0 24px', color: '#64748b', fontSize: 13 }}>
              Medicina Tradicional Chinesa • Acupuntura • Reability
            </p>

            <InlineRow label="1. Identificação" value={`${nome}, ${idade}.`} />
            <InlineRow label="2. Queixa principal" value={queixa ? `${queixa}.` : ''} fallback="Não preenchida." />
            <InlineRow label="3. História clínica" value={historia ? `${historia}.` : ''} fallback="Não preenchida." />
            
            <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
              <b>4. Integração semiológica:</b> foram considerados sintomas, emoções, clima, língua, pulso bilateral por posição/órgão, Oito Princípios, Cinco Movimentos e substâncias fundamentais.
            </p>

            <InlineRow label="5. Hipótese energética" value={main ? `${main}.` : ''} />
            <InlineRow label="5.1. Padrão raiz" value={detail.root ? `${detail.root}.` : ''} />
            <InlineRow label="5.2. Manifestação" value={detail.manifestation ? `${detail.manifestation}.` : ''} />
            <InlineRow label="6. Oito Princípios" value={detail.eight ? `${detail.eight}.` : ''} fallback="Aguardando classificação." />
            <InlineRow label="7. Correlação pelos 5 Elementos" value={detail.elements ? `${detail.elements}.` : ''} fallback="Aguardando leitura." />
            <InlineRow label="8. Princípio terapêutico" value={protocol.goal} fallback="Preencha os dados para gerar raciocínio terapêutico." />
            
            <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
              <b>9. Protocolo sugerido:</b> sistêmicos: {bodyPts}; auriculoterapia: {earPts}; moxa: {moxaPts}; laser/eletro: {laserPts}.
            </p>

            <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
              <b>10. Evolução longitudinal:</b> {evolucoes.length} sessão(ões) registrada(s).
              {ultimaEvolucao
                ? ` Última sessão em ${ultimaEvolucao.data}: dor ${ultimaEvolucao.dor || 'não informada'}, sono ${ultimaEvolucao.sono || 'não informado'}, ansiedade ${ultimaEvolucao.ansiedade || 'não informada'}.`
                : ' Sem registros evolutivos.'}
            </p>
            <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
              <b>11. Observação técnica:</b> as hipóteses constituem apoio ao raciocínio clínico e devem ser validadas pelo profissional responsável.
            </p>

            {/* Assinatura */}
            <p style={{ textAlign: 'right', marginTop: 40, lineHeight: 1.8 }}>
              <b>{terapeuta}</b><br />
              {therapistClinic} — {therapistSpecialty}<br />
              {therapistRegistration && <><span>{therapistRegistration}</span><br /></>}
              {therapistEmail && <><span>{therapistEmail}</span><br /></>}
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{today()}</span>
            </p>
          </>
        )}

        {modo === 'Orientação ao paciente' && (
          <>
            <h2 style={{ margin: '0 0 24px', textTransform: 'uppercase', color: 'var(--navy)' }}>ORIENTAÇÃO AO PACIENTE</h2>
            
            <p style={{ margin: '16px 0', lineHeight: 1.65, fontSize: 16 }}>
              Paciente, sua avaliação energética foi organizada a partir da anamnese, observação de língua, pulso e sintomas relatados.
            </p>
            <p style={{ margin: '16px 0', lineHeight: 1.65, fontSize: 16 }}>
              O objetivo inicial do cuidado é: <b>{protocol?.goal ? `${protocol.goal}.` : 'Preencha os dados para gerar raciocínio terapêutico..'}</b>
            </p>
            <p style={{ margin: '16px 0', lineHeight: 1.65, fontSize: 16 }}>
              Ao longo das sessões, serão acompanhados sono, dor, ansiedade, energia, intestino e humor, para que o tratamento seja ajustado de forma segura e individualizada.
            </p>
            <p style={{ margin: '16px 0', lineHeight: 1.65, fontSize: 16 }}>
              É importante comunicar qualquer mudança, reação, piora, medicação nova ou intercorrência clínica.
            </p>
          </>
        )}

      </div>

      {/* ── botões finais (não imprime) ────────────────────── */}
      <div className="report-actions no-print">
        <button className="primary-button" onClick={() => window.print()}>Imprimir / PDF</button>
        <button className="tag" onClick={() => {
          const txt = document.querySelector('.report')?.innerText || '';
          navigator.clipboard?.writeText(txt).then(() => alert('Copiado!'));
        }}>Copiar texto</button>
      </div>
    </Panel>
  );
}
