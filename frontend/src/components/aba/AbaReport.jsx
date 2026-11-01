import { useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { buildAbaReport, buildAbaWorkbook, reportFileName } from '../../utils/aba/report.js';
import { XLSX_MIME } from '../../utils/aba/xlsx.js';
import { buildReportAccentPalette, buildReportContactItems, getClinicLetterheadColor } from '../../utils/reportUtils';
import { PrintFooter, PrintLetterhead } from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';
import { LineChart } from './AbaCharts';
import { AbaIcon } from './AbaIcon';

// ============================================================
// "Baixar PDF" e "Baixar Excel" da tela de Resultados, no período e
// ambiente escolhidos lá. O PDF usa o papel timbrado do Vitalis (mesma
// infra de Evoluções e relatórios: o navegador oferece "Salvar como PDF"
// no diálogo de impressão). A planilha sai com gráficos nativos ligados
// às células (utils/aba/xlsx.js).
// ============================================================

const DEFAULT_ACCENT = '#0E2A4A';
const dateBR = isoDate => (isoDate ? new Date(`${isoDate}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const percentText = value => (value == null ? '—' : `${value}%`);

// Título da seção dentro do <thead>: a paginação repete o cabeçalho em
// cada pedaço da tabela, então o título nunca fica sozinho no pé da folha.
function TableTitle({ columns, children }) {
  return <tr className="aba-report-table-title"><th colSpan={columns}>{children}</th></tr>;
}

function ReportBody({ report }) {
  return (
    <>
      <h2>Relatório ABA — {report.patientName}</h2>
      <p className="aba-report-lead">{report.periodLabel} · {report.team}</p>

      <div className="aba-report-tiles">
        <div><strong>{report.sessionCount}</strong><small>{report.sessionCount === 1 ? 'sessão' : 'sessões'} no período</small></div>
        <div><strong>{percentText(report.overall.independencePercentage)}</strong><small>independência ({report.overall.independent} de {report.overall.scored})</small></div>
        <div><strong>{percentText(report.fidelitySummary.supervisionMean)}</strong><small>fidelidade da supervisão</small></div>
        <div><strong>{percentText(report.ioaSummary.mean)}</strong><small>concordância entre observadores</small></div>
      </div>

      <table className="aba-report-table">
        <thead>
          <TableTitle columns={5}>Programas</TableTitle>
          <tr><th>Programa</th><th>Fase</th><th>Sessões</th><th>Resultado no período</th><th>Critério</th></tr>
        </thead>
        <tbody>
          {report.acquisition.map(item => (
            <tr key={item.program.id}>
              <td>{item.name}<small>Aquisição{item.met ? ' · critério atingido' : ''}</small></td>
              <td>{item.status}</td>
              <td>{item.sessions}</td>
              <td>{item.percentage == null ? '—' : `${item.percentage}% (${item.independent}/${item.filled})`}</td>
              <td>{item.criterion}</td>
            </tr>
          ))}
          {report.reduction.map(item => (
            <tr key={item.program.id}>
              <td>{item.name}<small>Redução · {item.measure}</small></td>
              <td>{item.status}</td>
              <td>{item.sessions}</td>
              <td>{item.last == null ? '—' : `Último: ${item.last} ${item.unit}`}</td>
              <td>{item.criterion}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.acquisition.filter(item => item.series.length).map(item => (
        <div key={item.program.id} className="aba-report-chart">
          <h3>{item.name}</h3>
          <LineChart
            title={`Independência por sessão — ${item.name}`}
            data={item.series}
            series={[{ key: 'percentage', name: 'Independência', tone: 'main' }]}
            yMax={100}
            height={190}
            reference={item.minimum > 0 ? { value: item.minimum, label: `Critério ${item.minimum}%` } : null}
          />
        </div>
      ))}
      {report.reduction.filter(item => item.series.length).map(item => (
        <div key={item.program.id} className="aba-report-chart">
          <h3>{item.name}</h3>
          <LineChart
            title={`Registro por sessão — ${item.name}`}
            data={item.series}
            unit=""
            series={[{ key: 'value', name: item.unit, tone: 'main' }]}
            height={190}
          />
        </div>
      ))}

      <table className="aba-report-table">
        <thead>
          <TableTitle columns={5}>Sessões</TableTitle>
          <tr><th>Data</th><th>Terapeuta</th><th>Local</th><th>Programas</th><th>Revisão</th></tr>
        </thead>
        <tbody>
          {report.sessionRows.map(row => (
            <tr key={row.id}>
              <td>{dateBR(row.date)}</td>
              <td>{row.therapist}</td>
              <td>{row.location}</td>
              <td>{row.programs}</td>
              <td>{row.review}{row.incidents ? ' · risco registrado' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.fidelityRows.length > 0 && (
        <table className="aba-report-table">
          <thead>
            <TableTitle columns={4}>Fidelidade de aplicação</TableTitle>
            <tr><th>Data</th><th>Terapeuta</th><th>Autoavaliação</th><th>Fidelidade da supervisão</th></tr>
          </thead>
          <tbody>
            {report.fidelityRows.map(row => (
              <tr key={row.date + row.therapist}>
                <td>{dateBR(row.date)}</td>
                <td>{row.therapist}</td>
                <td>{percentText(row.self)}</td>
                <td>{percentText(row.supervision)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report.ioaRows.length > 0 && (
        <table className="aba-report-table">
          <thead>
            <TableTitle columns={5}>Concordância entre observadores (IOA)</TableTitle>
            <tr><th>Data</th><th>Método</th><th>Programa</th><th>Valores</th><th>Concordância</th></tr>
          </thead>
          <tbody>
            {report.ioaRows.map((row, index) => (
              <tr key={`${row.date}-${index}`}>
                <td>{dateBR(row.date)}</td>
                <td>{row.method}</td>
                <td>{row.program || '—'}</td>
                <td>{row.primary} / {row.secondary}</td>
                <td>{row.agreement}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="aba-report-note">
        Independência = respostas independentes ÷ tentativas preenchidas; recusa e não aplicável ficam registradas e fora da conta, e o percentual do período não é média entre sessões.
        Mudança de fase e alta de programa são decisões da supervisão. Gerado em {report.generatedAt.toLocaleString('pt-BR')}{report.generatedBy ? ` por ${report.generatedBy}` : ''}.
      </p>
    </>
  );
}

function downloadBytes(bytes, fileName, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AbaReportActions({ patient, data, sessions, periodLabel, profile }) {
  const [report, setReport] = useState(null);
  const [printDoc, setPrintDoc] = useState({ pages: [], bodyHeightPx: null });
  const [error, setError] = useState(null);
  const sourceRef = useRef(null);
  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);

  const clinic = profile?.clinic || null;
  const clinicName = clinic?.name || profile?.clinic_name || 'Clínica';
  const clinicLogo = clinic?.logo_url || '';
  const clinicMonogram = clinicName.trim().charAt(0).toUpperCase() || 'C';
  const clinicDetails = [clinic?.legal_name, clinic?.cnpj ? `CNPJ ${clinic.cnpj}` : null].filter(Boolean).join(' • ');
  const accent = buildReportAccentPalette(getClinicLetterheadColor(clinic) || DEFAULT_ACCENT, DEFAULT_ACCENT);
  const accentStyle = {
    '--clinic-accent': accent.accent,
    '--clinic-accent-shade': accent.shade,
    '--clinic-accent-soft': accent.soft,
  };
  const contactItems = buildReportContactItems({ clinic, therapistProfile: profile });
  const watermark = Boolean(clinicLogo) && clinic?.logo_watermark !== false;
  const empty = sessions.length === 0;

  const build = () => buildAbaReport({
    patient,
    data,
    sessions,
    periodLabel,
    generatedBy: profile?.full_name || '',
    clinicName,
  });

  const handlePdf = () => {
    setError(null);
    try {
      flushSync(() => setReport(build()));
      const doc = paginateReportBody(sourceRef.current?.innerHTML || '', {
        stage: measureRef.current,
        header: headerRef.current,
        footer: footerRef.current,
      });
      flushSync(() => setPrintDoc(doc));
      window.print();
    } catch (printError) {
      setError(printError.message || 'Não foi possível montar o PDF.');
    }
  };

  const handleExcel = () => {
    setError(null);
    try {
      const next = build();
      downloadBytes(buildAbaWorkbook(next), reportFileName(next.patientName, 'xlsx', next.generatedAt), XLSX_MIME);
    } catch (excelError) {
      setError(excelError.message || 'Não foi possível montar a planilha.');
    }
  };

  const letterhead = (
    <PrintLetterhead
      clinicLogo={clinicLogo}
      clinicMonogram={clinicMonogram}
      clinicName={clinicName}
      clinicDetails={clinicDetails}
      dateLabel={report ? report.generatedAt.toLocaleDateString('pt-BR') : ''}
      sessaoLabel="Relatório ABA"
      terapeuta={profile?.full_name || ''}
    />
  );

  return (
    <>
      <div className="aba-button-row">
        <button type="button" className="quiet-button" disabled={empty} onClick={handlePdf}><AbaIcon name="file" /> Baixar PDF</button>
        <button type="button" className="quiet-button" disabled={empty} onClick={handleExcel}><AbaIcon name="chart" /> Baixar Excel</button>
      </div>
      {error && <p className="aba-error" role="alert">{error}</p>}

      {report && createPortal(
        <div className="report-print-pages aba-report-print" style={accentStyle} aria-hidden="true">
          <div className="rpage-measure-stage">
            <div ref={headerRef}>{letterhead}</div>
            <div ref={footerRef}><PrintFooter items={contactItems} clinicName={clinicName} /></div>
            <div ref={measureRef} className="rpage-body aba-report-body" />
          </div>
          <div ref={sourceRef} className="aba-report-source"><ReportBody report={report} /></div>
          {printDoc.pages.map((html, index) => (
            <section className="rpage" key={index}>
              {watermark && <div className="rpage-watermark" aria-hidden="true"><img src={clinicLogo} alt="" /></div>}
              {letterhead}
              <div
                className="rpage-body aba-report-body"
                style={printDoc.bodyHeightPx ? { height: printDoc.bodyHeightPx } : undefined}
                dangerouslySetInnerHTML={{ __html: html }}
              />
              <div className="rpage-footer"><PrintFooter items={contactItems} clinicName={clinicName} /></div>
            </section>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

export default AbaReportActions;
