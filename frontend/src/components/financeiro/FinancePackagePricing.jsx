import { FINANCE_PACKAGE_RULES, financePackageQuote } from '../../utils/financeServices';
import { centsToInput, formatBRL } from '../../utils/finance';

/** Preenche o total a pedido da pessoa; nunca altera modelo/venda sozinho. */
export function FinancePackagePricing({ discipline, types, sessions, prices, professionalId, onApply, busy }) {
  const rule = FINANCE_PACKAGE_RULES[discipline];
  if (rule?.discountPercent == null) return null;
  const quote = financePackageQuote({ discipline, types, sessions, prices, professionalId });
  return (
    <div className="fin-package-pricing">
      <p className="fin-hint">
        <b>{rule.label}.</b>{quote
          ? ` ${formatBRL(quote.subtotalCents)}${quote.discountPercent ? ` − ${formatBRL(quote.discountCents)} de desconto` : ''} = ${formatBRL(quote.totalCents)}.`
          : ' Para calcular, marque um único serviço, informe a quantidade de atendimentos e cadastre o valor avulso.'}
      </p>
      <button type="button" className="gt-btn" disabled={busy || !quote} onClick={() => onApply(centsToInput(quote.totalCents))}>
        {rule.discountPercent ? 'Calcular com 5% de desconto' : 'Calcular sem desconto'}
      </button>
    </div>
  );
}
