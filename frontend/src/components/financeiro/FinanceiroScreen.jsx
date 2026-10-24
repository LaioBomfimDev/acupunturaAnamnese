import { useEffect, useMemo, useState } from 'react';
import { GestaoNav, GestaoSectionHead } from '../panels/GestaoNav';
import { GestaoResumo } from '../panels/GestaoResumo';
import { HubBackButton } from '../HubNav';
import { ScreenHelp } from '../ui/ScreenHelp';
import { FINANCEIRO_HELP } from '../../data/screenHelp';
import { getDiscipline } from '../../data/disciplines';
import { loadFinanceData } from '../../services/financeiroService';
import {
  addDays,
  buildConfigStatus,
  buildMonthSummary,
  buildPayables,
  buildPayouts,
  buildReceivables,
  formatBRL,
  formatShortBRL,
  methodLabel,
  monthOf,
  shiftMonth,
  todayInClinic,
} from '../../utils/finance';
import { APagar, Equipe, Pagas } from './FinanceSaidas';
import { AReceber, Pacotes, Recebidos } from './FinanceEntradas';
import { ModelosConfig, RecebimentoConfig, SaidasFixasConfig, StartCard, ValoresConfig } from './FinanceConfig';
import '../../styles/gestao.css';
import '../../styles/financeiro.css';

// ============================================================
// Financeiro (etapa 1, opção C de 23/10/2026): menu à esquerda em grupos,
// igual à Gestão, abrindo num Resumo de quadros. No celular e no tablet
// o Resumo é o índice e cada parte volta por "Voltar ao Resumo".
//
// Só a administração da instituição abre (App.jsx). Os dados vêm numa
// carga só (loadFinanceData) e voltam a ser lidos depois de cada
// gravação; as contas moram em utils/finance.js.
// ============================================================

const SECTIONS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'areceber', label: 'A receber' },
  { id: 'recebidos', label: 'Recebidos' },
  { id: 'pacotes', label: 'Pacotes' },
  { id: 'apagar', label: 'A pagar' },
  { id: 'pagas', label: 'Pagas' },
  { id: 'equipe', label: 'Equipe e repasses' },
  { id: 'valores', label: 'Valores dos atendimentos' },
  { id: 'modelos', label: 'Modelos de pacote' },
  { id: 'recebimento', label: 'Como cada um recebe' },
  { id: 'saidasfixas', label: 'Saídas fixas' },
];

const SECTION_GROUPS = [
  { label: 'Visão geral', ids: ['resumo'] },
  { label: 'Entradas', ids: ['areceber', 'recebidos', 'pacotes'] },
  { label: 'Saídas', ids: ['apagar', 'pagas', 'equipe'] },
  { label: 'Configuração', ids: ['valores', 'modelos', 'recebimento', 'saidasfixas'] },
];

const TAB_ICONS = {
  resumo: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  areceber: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v4.5l3 2" /></>,
  recebidos: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  pacotes: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
  apagar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  pagas: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
  equipe: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 9.5a3 3 0 1 0 0-6M15 14.5c2.8.4 4.8 1.9 5.5 4" /></>,
  valores: <><path d="M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.2-5 3.3c0 4.6 10 2.4 10 7.2 0 2.1-2.2 3.5-5 3.5s-5-1.2-5-3.2" /></>,
  modelos: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 12h8M8 16h5" /></>,
  recebimento: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  saidasfixas: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /></>,
};

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function buildTiles({ data, derived, month }) {
  const { summary, config, receivables, payouts } = derived;
  const activePackages = data.packages.filter(row => row.status === 'active');
  const weekEnd = derived.weekEnd;
  const dueSoon = receivables.items.filter(item => item.packageId && item.dueOn <= weekEnd).length;
  const topMethod = summary.byMethod[0];
  const toPay = [...payouts.values()].filter(row => row.balanceCents > 0);
  const configTile = step => ({
    value: null,
    display: '',
    line: `${step.ok ? 'Pronto' : 'Falta'} · ${step.line}`,
    tone: step.ok ? undefined : 'warning',
  });

  return {
    areceber: {
      display: formatBRL(summary.receivableCents),
      line: summary.lateCents > 0
        ? `${formatBRL(summary.lateCents)} em atraso, de ${plural(summary.latePatients, 'paciente', 'pacientes')}`
        : summary.receivableCount ? `${plural(summary.receivableCount, 'item', 'itens')} em aberto, nada em atraso` : 'nada em aberto',
      tone: summary.lateCents > 0 ? 'warning' : undefined,
    },
    recebidos: {
      display: formatBRL(summary.inCents),
      line: summary.receiptCount
        ? `${plural(summary.receiptCount, 'recebimento', 'recebimentos')} em ${month.label}${topMethod ? ` · mais no ${methodLabel(topMethod[0])}` : ''}`
        : `nada recebido em ${month.label}`,
    },
    pacotes: {
      display: String(activePackages.length),
      line: activePackages.length
        ? `${activePackages.length === 1 ? 'pacote ativo' : 'pacotes ativos'}${dueSoon ? ` · ${plural(dueSoon, 'cobrança vence', 'cobranças vencem')} nesta semana` : ''}`
        : 'nenhum pacote ativo',
    },
    apagar: {
      display: formatBRL(summary.payableCents),
      line: summary.payableCount
        ? `${summary.payoutCents ? `repasses ${formatBRL(summary.payoutCents)} · ` : ''}${plural(summary.payableCount, 'conta', 'contas')} até o fim do mês${summary.payableUnknown ? ` (${summary.payableUnknown} sem valor fixo)` : ''}`
        : 'nada a pagar',
      tone: summary.payableLate ? 'warning' : undefined,
    },
    pagas: {
      display: formatBRL(summary.outCents),
      line: summary.expenseCount ? `${plural(summary.expenseCount, 'saída', 'saídas')} em ${month.label}` : `nada pago em ${month.label}`,
    },
    equipe: {
      display: formatBRL(toPay.reduce((total, row) => total + row.balanceCents, 0)),
      line: toPay.length ? `a repassar a ${plural(toPay.length, 'pessoa', 'pessoas')}` : 'nenhum repasse pendente',
    },
    valores: configTile(config.valores),
    modelos: configTile(config.pacotes),
    recebimento: configTile(config.equipe),
    saidasfixas: configTile(config.saidas),
  };
}

// Mesmo número do quadro, curto, ao lado do nome no menu.
function navCountsFrom(tiles, { summary, config }) {
  const money = (cents, tone) => ({ text: cents > 0 ? formatShortBRL(cents) : '', tone });
  const check = step => ({ text: step.ok ? '✓' : 'falta', tone: step.ok ? undefined : 'warning' });
  return {
    areceber: money(summary.receivableCents, tiles.areceber.tone),
    apagar: money(summary.payableCents, tiles.apagar.tone),
    pacotes: { text: tiles.pacotes.display === '0' ? '' : tiles.pacotes.display },
    valores: check(config.valores),
    modelos: check(config.pacotes),
    recebimento: check(config.equipe),
    saidasfixas: check(config.saidas),
  };
}

function ResultBand({ summary, month }) {
  const top = summary.byArea[0]?.[1] || 0;
  return (
    <section className="fin-result" aria-label={`Resultado de ${month.label}`}>
      <div className="fin-result-main">
        <small>Resultado de {month.label}</small>
        <b>{formatBRL(summary.resultCents)}</b>
        <span>entrou {formatBRL(summary.inCents)} · saiu {formatBRL(summary.outCents)}</span>
      </div>
      {summary.byArea.length > 0 ? (
        <ul className="fin-result-bars" aria-label="Entradas por área">
          {summary.byArea.map(([area, cents]) => (
            <li key={area}>
              <span>{getDiscipline(area)?.label || 'Outra'}</span>
              <i style={{ width: `${Math.max(6, Math.round((cents / top) * 100))}%` }} aria-hidden="true" />
              <span className="fin-num">{formatBRL(cents)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fin-result-empty">Ainda nada recebido neste mês.</p>
      )}
    </section>
  );
}

export function FinanceiroScreen({ profile }) {
  const [today] = useState(() => todayInClinic());
  const [month, setMonth] = useState(() => monthOf(todayInClinic()));
  const [section, setSection] = useState('resumo');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [flash, setFlash] = useState('');
  // Trocar de parte limpa o aviso da gravação anterior.
  const goTo = id => { setSection(id); setFlash(''); };

  useEffect(() => {
    let cancelled = false;
    loadFinanceData()
      .then(next => { if (!cancelled) { setData(next); setError(''); } })
      .catch(err => { if (!cancelled) setError(err.message || 'Não foi possível carregar o financeiro.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const derived = useMemo(() => {
    if (!data) return null;
    const settings = data.settings;
    const repasseCategory = data.categories.find(row => row.system_key === 'repasse') || null;
    const salaryCategory = data.categories.find(row => row.system_key === 'salarios') || null;
    const receivables = buildReceivables({ ...data, today });
    const payouts = buildPayouts({
      ...data,
      repasseCategoryId: repasseCategory?.id,
      basis: settings?.payout_basis || 'on_payment',
      month,
    });
    const until = month.to > today ? month.to : today;
    const payables = buildPayables({
      recurring: data.recurring,
      expenses: data.expenses,
      startsOn: settings?.starts_on || today,
      until,
      today,
      payouts,
    });
    const summary = buildMonthSummary({ ...data, receivables, payables, month, today });
    const config = buildConfigStatus(data);
    return {
      today,
      weekEnd: addDays(today, 7),
      receivables,
      payouts,
      payables,
      summary,
      config,
      repasseCategory,
      salaryCategory,
      membersById: new Map(data.members.map(row => [row.id, row])),
      patientsById: new Map(data.patients.map(row => [row.id, row])),
      peopleById: new Map(data.people.map(row => [row.id, row])),
      categoriesById: new Map(data.categories.map(row => [row.id, row])),
    };
  }, [data, month, today]);

  const tiles = useMemo(() => (data && derived ? buildTiles({ data, derived, month }) : null), [data, derived, month]);
  const navCounts = useMemo(() => (tiles && derived ? navCountsFrom(tiles, derived) : null), [tiles, derived]);

  // Contexto que cada parte recebe: dados, contas e como gravar.
  const fin = data && derived ? {
    data,
    ...derived,
    month,
    profile,
    reload: () => setReloadKey(key => key + 1),
    notify: message => setFlash(message),
    open: goTo,
  } : null;

  return (
    <div className="gt gt--rail gt--index fin">
      <GestaoNav
        label="Partes do financeiro"
        sections={SECTIONS}
        groups={SECTION_GROUPS}
        icons={TAB_ICONS}
        active={section}
        onSelect={goTo}
        counts={navCounts}
      />

      <div className="gt-main">
        <GestaoSectionHead groups={SECTION_GROUPS} sections={SECTIONS} active={section}>
          <div className="fin-head-tools">
            <div className="gt-period-nav" role="group" aria-label="Mês">
              <button type="button" className="gt-period-arrow" aria-label="Mês anterior" onClick={() => setMonth(current => shiftMonth(current, -1))}>‹</button>
              <span className="gt-period-label fin-month">{month.label.charAt(0).toUpperCase() + month.label.slice(1)}</span>
              <button type="button" className="gt-period-arrow" aria-label="Próximo mês" onClick={() => setMonth(current => shiftMonth(current, 1))}>›</button>
            </div>
            <ScreenHelp topic={FINANCEIRO_HELP[section]} />
          </div>
        </GestaoSectionHead>

        {section !== 'resumo' && (
          <HubBackButton nested label="Voltar ao Resumo" onClick={() => goTo('resumo')} className="topbar-button gt-back-summary" />
        )}

        {flash && <p className="gt-notice fin-flash" role="status">{flash}</p>}
        {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
        {loading && !data && <p className="gt-empty">Carregando o financeiro…</p>}

        {fin && !fin.data.settings && section !== 'resumo' && (
          <p className="gt-notice fin-not-started">
            O financeiro ainda não começou a contar. Os valores e o resto da configuração já podem ser salvos; a cobrança dos atendimentos começa quando a data de início for salva no <button type="button" className="fin-link" onClick={() => goTo('resumo')}>Resumo</button>.
          </p>
        )}

        {fin && section === 'resumo' && (
          <div className="fin-resumo">
            {!fin.data.settings && <StartCard fin={fin} />}
            <ResultBand summary={fin.summary} month={month} />
            <GestaoResumo
              sections={SECTIONS}
              groups={SECTION_GROUPS}
              icons={TAB_ICONS}
              summary={tiles}
              loading={false}
              onOpen={goTo}
            />
          </div>
        )}

        {fin && section === 'areceber' && <AReceber fin={fin} />}
        {fin && section === 'recebidos' && <Recebidos fin={fin} />}
        {fin && section === 'pacotes' && <Pacotes fin={fin} />}
        {fin && section === 'apagar' && <APagar fin={fin} />}
        {fin && section === 'pagas' && <Pagas fin={fin} />}
        {fin && section === 'equipe' && <Equipe fin={fin} />}
        {fin && section === 'valores' && <ValoresConfig fin={fin} />}
        {fin && section === 'modelos' && <ModelosConfig fin={fin} />}
        {fin && section === 'recebimento' && <RecebimentoConfig fin={fin} />}
        {fin && section === 'saidasfixas' && <SaidasFixasConfig fin={fin} />}
      </div>
    </div>
  );
}

export default FinanceiroScreen;
