"""Gera a carga do catálogo oficial da ANS (tiss_terms) a partir das
planilhas TUSS publicadas no Padrão TISS (Representação de Conceitos em
Saúde).

Uso (Python com openpyxl; as planilhas vêm do zip oficial da ANS):

    python -I frontend/scripts/build-tiss-terms-sql.py 202607 \
        "TUSS 22 - PROCEDIMENTOS E EVENTOS EM SAÚDE - VERSÃO 202607.xlsx" \
        "TUSS - Demais terminologias - VERSÃO 202607.xlsx" \
        > supabase/migrations/20261031b_tiss_terms_202607.sql

Só entram as tabelas que o faturamento da clínica usa: 22 (procedimentos),
24 (CBO), 26 (conselho), 50 (tipo de atendimento), 59 (UF) e 76 (regime).
Versão nova da ANS: gere outra migration com a versão nova; o upsert troca
termo e vigência e o que saiu da tabela fica com o fim de vigência que a
própria ANS publicou.
"""

import datetime
import sys

import openpyxl

TABLES = {'22', '24', '26', '50', '59', '76'}


def norm_code(table, value):
    if value is None:
        return None
    if isinstance(value, float):
        value = int(value)
    text = str(value).strip()
    if not text:
        return None
    # Domínios curtos têm zero à esquerda (01, 02...); o Excel às vezes
    # guarda como número.
    if table in {'26', '50', '76', '59'} and text.isdigit() and len(text) < 2:
        text = text.zfill(2)
    if table == '22' and text.isdigit():
        text = text.zfill(8)
    return text


def as_date(value):
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, str) and value.strip():
        for fmt in ('%d/%m/%Y', '%Y-%m-%d'):
            try:
                return datetime.datetime.strptime(value.strip(), fmt).date().isoformat()
            except ValueError:
                pass
    return None


def sql_text(value):
    if value is None:
        return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"


def read_sheet(ws, table):
    rows = []
    starts = ends = None
    for row in ws.iter_rows(values_only=True):
        if starts is None:
            if row and isinstance(row[0], str) and row[0].strip().startswith('C') and 'digo' in row[0]:
                # As colunas de vigência mudam de lugar entre tabelas (a 22
                # tem "Descrição detalhada", a 59 tem "Sigla"): acha pelo nome.
                labels = [str(cell or '').lower() for cell in row]
                starts = next(i for i, label in enumerate(labels) if 'cio de vig' in label)
                ends = next(i for i, label in enumerate(labels) if 'fim de vig' in label)
            continue
        code = norm_code(table, row[0] if row else None)
        term = (str(row[1]).strip() if len(row) > 1 and row[1] is not None else '')
        if not code or not term:
            continue
        rows.append((table, code, ' '.join(term.split()), as_date(row[starts]), as_date(row[ends])))
    if starts is None:
        raise SystemExit(f'Cabeçalho "Código do Termo" não achado na tabela {table}')
    return rows


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    version = sys.argv[1]
    rows = []
    for path in sys.argv[2:]:
        wb = openpyxl.load_workbook(path, read_only=True)
        for name in wb.sheetnames:
            parts = name.split()
            if len(parts) >= 2 and parts[0] == 'Tab' and parts[1] in TABLES:
                rows.extend(read_sheet(wb[name], parts[1]))
    found = {r[0] for r in rows}
    missing = TABLES - found
    if missing:
        raise SystemExit(f'Tabelas não achadas nas planilhas: {sorted(missing)}')

    out = sys.stdout
    out.reconfigure(encoding='utf-8', newline='\n')
    out.write('-- ==========================================================\n')
    out.write(f'-- Catálogo oficial da ANS (TUSS {version}): tabelas {", ".join(sorted(TABLES))}\n')
    out.write('-- REQUER: 20261031_convenios_fase1 (tiss_terms).\n')
    out.write('-- Gerado por frontend/scripts/build-tiss-terms-sql.py a partir das\n')
    out.write('-- planilhas do Padrão TISS publicadas pela ANS. Não editar à mão.\n')
    out.write('-- ==========================================================\n\n')
    for table in sorted(TABLES):
        chunk = [r for r in rows if r[0] == table]
        out.write(f'-- Tabela {table}: {len(chunk)} termos\n')
        for start in range(0, len(chunk), 500):
            part = chunk[start:start + 500]
            out.write('INSERT INTO public.tiss_terms (table_code, code, term, valid_from, valid_until, source_version) VALUES\n')
            out.write(',\n'.join(
                f"  ({sql_text(t)}, {sql_text(c)}, {sql_text(term)}, {sql_text(vf)}, {sql_text(vu)}, {sql_text(version)})"
                for t, c, term, vf, vu in part
            ))
            out.write('\nON CONFLICT ON CONSTRAINT tiss_terms_pkey DO UPDATE SET\n')
            out.write('  term = EXCLUDED.term, valid_from = EXCLUDED.valid_from,\n')
            out.write('  valid_until = EXCLUDED.valid_until, source_version = EXCLUDED.source_version;\n\n')
    out.write('SELECT table_code, count(*) AS termos FROM public.tiss_terms GROUP BY table_code ORDER BY table_code;\n')


if __name__ == '__main__':
    main()
