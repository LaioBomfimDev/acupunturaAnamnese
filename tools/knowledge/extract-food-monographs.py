#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract-food-monographs — extrai as monografias de alimentos do livro
"Sistema Chinês de Curas Alimentares" (Henry C. Lu) a partir da camada de
texto/OCR do PDF e gera:

  - frontend/src/knowledge/generated/foodMonographs.js  (dados usados pelo app)
  - docs/food-monographs-curas-alimentares.json          (provenance)

Cada monografia = nome, página impressa, capítulo, indicações, descrição
(energia/sabor/órgãos parseados) e o conteúdo rico da fonte: aplicações (com
quantidades e preparos), relatórios clínicos, experiências e comentários.

É REFERÊNCIA do livro para o profissional — não é prescrição. Ver
docs/plano-dietoterapia.md e frontend/src/knowledge/foodDietoterapiaCuration.js.

Uso:
    python tools/knowledge/extract-food-monographs.py "<caminho do PDF>"

Requer: pypdf  (pip install pypdf)
"""
import re, json, sys, io, os, unicodedata

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DEFAULT_PDF = r'C:\Users\m\Downloads\PDFS acup\ervas\Sistema Chines de Curas Alimentares.pdf'
OUT_JS = os.path.join(REPO, 'frontend', 'src', 'knowledge', 'generated', 'foodMonographs.js')
OUT_JSON = os.path.join(REPO, 'docs', 'food-monographs-curas-alimentares.json')

OFFSET = 15  # página impressa = página do PDF − 15
CHAPTERS = {
    'Especiarias': 'Especiarias e Ervas',
    'Frutas': 'Frutas e Nozes',
    'Verduras': 'Verduras, Raízes e Cabaças',
    'Legumes': 'Legumes, Grãos, Óleos e Sementes',
    'Carnes': 'Carnes, Leite, Frutos do Mar, Aves e Ovos',
}
CHAP_ORDER = list(CHAPTERS.values())
SECTION_STARTS = ('Descri', 'Aplica', 'Coment', 'Relat', 'Experi')
BULLET = re.compile(r'^\s*([o•·*]|[-–])\s+')
APP_VERBS = (r'^(Beba|Coma|Ferva|Frite|Moa|Esmague|Prepare|Vaporize|Rale|Misture|'
             r'Dissolva|Asse|Adicione|Cozinhe|Descasque|Mastigue|Embeba|Aplique|Use|Tome)\b')


def strip_accents(t):
    return ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')


def read_pages(pdf_path):
    import pypdf
    r = pypdf.PdfReader(pdf_path)
    return {i + 1: (p.extract_text() or '') for i, p in enumerate(r.pages)}


def is_running_header(s):
    if re.fullmatch(r'\d{1,3}', s):
        return True
    if 'Sistema Chi' in s and 'Alimen' in s:
        return True
    if re.match(r'(Especiarias|Frutas|Verduras|Legumes|Carnes)', s) and re.search(r'\d|[=;:\]]', s) and len(s) < 60:
        return True
    return False


def dehyph(acc, nxt):
    if not acc:
        return nxt
    if acc.endswith('­') or acc.endswith('-'):
        return acc[:-1] + nxt
    return acc + ' ' + nxt


def split_sections(body):
    units, cur, buf = [], None, ''
    def flush():
        nonlocal buf
        if buf.strip():
            units.append((cur, buf.strip()))
        buf = ''
    for s in body:
        head = next((k for k in SECTION_STARTS if s.startswith(k)), None)
        if head:
            flush(); cur = head
            buf = re.sub(r'^[^-]{3,20}-\s*', '', s, count=1)
        elif BULLET.match(s):
            flush(); buf = BULLET.sub('', s)
        else:
            buf = dehyph(buf, s)
    flush()
    out = {}
    for sec, txt in units:
        out.setdefault(sec, []).append(txt)
    return out


ENERGY_MAP = [
    ('quente', 'quente'), ('quen te', 'quente'),
    ('morno', 'morna'), ('morna', 'morna'), ('momo', 'morna'), ('moma', 'morna'),
    ('neutro', 'neutra'), ('neutra', 'neutra'),
    ('fresco', 'fresca'), ('fresca', 'fresca'),
    ('frio', 'fria'), ('fria', 'fria'),
]
FLAVORS = {
    'pungente': 'pungente', 'picante': 'pungente',
    'doce': 'doce', 'azedo': 'azedo', 'azeda': 'azedo', 'acido': 'azedo',
    'amargo': 'amargo', 'amarga': 'amargo', 'salgado': 'salgado', 'salgada': 'salgado',
}
ORGANS = [
    ('pulmoes', 'pulmoes'), ('pulmao', 'pulmoes'), ('estomago', 'estomago'), ('baco', 'baco'),
    ('intestino grosso', 'intestino_grosso'), ('intestino delgado', 'intestino_delgado'),
    ('intestinos', 'intestino_grosso'), ('figado', 'figado'), ('vesicula', 'vesicula'),
    ('rins', 'rins'), ('rim', 'rins'), ('bexiga', 'bexiga'), ('coracao', 'coracao'),
]


def parse_descricao(desc_text):
    da = strip_accents(desc_text).lower()
    first = strip_accents(desc_text.split(';')[0]).lower()
    energy = None
    if 'quen' in first: energy = 'quente'
    elif 'morn' in first or 'mom' in first or 'moma' in first: energy = 'morna'
    elif 'neu' in first or 'eutr' in first: energy = 'neutra'
    elif 'fresc' in first: energy = 'fresca'
    elif re.search(r'\bfri[oa]', first): energy = 'fria'
    if energy is None:
        for key, val in ENERGY_MAP:
            if re.search(r'\b' + re.escape(key) + r'\b', da):
                energy = val; break
    flavors = []
    for key, val in FLAVORS.items():
        if re.search(r'\b' + re.escape(strip_accents(key)) + r'\b', da) and val not in flavors:
            flavors.append(val)
    organs = []
    for key, val in ORGANS:
        if key in da and val not in organs:
            organs.append(val)
    return energy, flavors, organs


def slugify(name):
    n = strip_accents(name).lower()
    n = re.sub(r'"[^"]*"', '', n)
    n = re.sub(r'\([^)]*\)', '', n)
    n = re.sub(r'[^a-z0-9]+', '-', n).strip('-')
    return n or 'item'


def clean_name(name):
    m = re.search(r'\(([^)]+)\)', name)
    base = re.sub(r'"[^"]*"', '', name).strip(' -')
    if not base and m: base = m.group(1)
    return re.sub(r'\s+', ' ', base).strip(' -"') or name.strip()


def is_junk(name):
    n = (name or '').strip()
    if re.search(r'\d', n): return True
    if n.endswith('.'): return True
    if re.match(APP_VERBS, n): return True
    if (re.match(r'(Verd|Espec|Frut|Legum|Carn)', strip_accents(n))
            and ('Cabac' in strip_accents(n) or 'Raize' in strip_accents(n))):
        return True
    return len(strip_accents(n)) < 2


def extract(pdf_path):
    page_texts = read_pages(pdf_path)
    idx_page = next((pg for pg, t in page_texts.items() if 'ndice Remissivo' in t), 222)

    lines, current_chapter = [], None
    for pdf in range(56, idx_page):
        printed = pdf - OFFSET
        for l in page_texts.get(pdf, '').split('\n'):
            s = l.strip()
            if not s: continue
            for key, name in CHAPTERS.items():
                if s.startswith(key) and not re.search(r'\d', s):
                    current_chapter = name
            lines.append((printed, current_chapter, s))

    clean = [(p, c, s) for (p, c, s) in lines if not is_running_header(s)]
    texts = [s for (_, _, s) in clean]
    pagemap = [p for (p, _, _) in clean]
    chapmap = [c for (_, c, _) in clean]
    desc_idx = [i for i, s in enumerate(texts) if s.startswith('Descri')]

    name_pos_of = []
    for k, di in enumerate(desc_idx):
        prev_end = 0 if k == 0 else desc_idx[k - 1]
        cand = list(range(prev_end + 1, di))[-6:]
        npos = None
        for pos in cand:
            s = texts[pos]
            if s.startswith(SECTION_STARTS): continue
            if (s[:1].isupper() or s[:1] in '"“') and len(s) < 45:
                npos = pos; break
        if npos is None and cand:
            npos = cand[-1]
        name_pos_of.append(npos)

    foods = []
    for k, di in enumerate(desc_idx):
        name_pos = name_pos_of[k]
        name = texts[name_pos] if name_pos is not None else None
        body_end = name_pos_of[k + 1] if (k + 1 < len(desc_idx) and name_pos_of[k + 1] is not None) else \
            (desc_idx[k + 1] if k + 1 < len(desc_idx) else len(texts))
        indications = ' '.join(texts[p] for p in range(name_pos + 1, di)) if name_pos is not None else ''
        secs = split_sections(texts[di:body_end])
        desc_text = ' '.join(secs.get('Descri', []))
        energy, flavors, organs = parse_descricao(desc_text)
        nm = clean_name(name or '')
        foods.append({
            'id': slugify(name or f'item-{k}'), 'name': nm, 'nameRaw': name,
            'page': pagemap[di], 'chapter': chapmap[di],
            'indications': re.sub(r'\s+', ' ', indications).strip(' .'),
            'descricao': re.sub(r'\s+', ' ', desc_text).strip(),
            'energy': energy, 'flavors': flavors, 'organs': organs,
            'aplicacoes': [re.sub(r'\s+', ' ', x).strip() for x in secs.get('Aplica', [])],
            'relatoriosClinicos': [re.sub(r'\s+', ' ', x).strip() for x in secs.get('Relat', [])],
            'experiencias': [re.sub(r'\s+', ' ', x).strip() for x in secs.get('Experi', [])],
            'comentarios': [re.sub(r'\s+', ' ', x).strip() for x in secs.get('Coment', [])],
            'needsReview': energy is None or not nm or len(nm) < 2,
        })

    foods = [f for f in foods if not is_junk(f['name'])]
    seen = {}
    for f in foods:
        if f['id'] in seen:
            seen[f['id']] += 1; f['id'] = f"{f['id']}-{seen[f['id']]}"
        else:
            seen[f['id']] = 1
    foods.sort(key=lambda f: (CHAP_ORDER.index(f['chapter']) if f['chapter'] in CHAP_ORDER else 99, f['page'] or 0))
    for f in foods:
        f.pop('nameRaw', None)
    return foods


def emit(foods):
    body = json.dumps(foods, ensure_ascii=False, indent=2)
    header = '''// ============================================================
// foodMonographs — AUTO-GERADO. NÃO editar à mão.
//
// Fonte única: "Sistema Chinês de Curas Alimentares" (Henry C. Lu, ed. Roca).
// Extraído da camada de texto/OCR do PDF (231 págs.) e limpo por script.
// pageOffset = 15  →  página impressa = página do PDF − 15.
//
// Cada entrada é o conteúdo TRADICIONAL do livro (indicações, descrição
// energia/sabor/órgãos, aplicações com quantidades, relatórios clínicos e
// comentários). É REFERÊNCIA DE CONHECIMENTO DO PROFISSIONAL — não é
// prescrição, plano alimentar nem indicação automática ao paciente. As
// aplicações citam quantidades e preparos exatamente como o livro descreve;
// use com o julgamento clínico e o gate de curadoria (foodDietoterapiaCuration).
//
// Regenerar: python tools/knowledge/extract-food-monographs.py "<PDF>"
// ============================================================

export const FOOD_MONOGRAPHS_SOURCE = {
  key: 'sistema-chines-curas-alimentares',
  title: 'Sistema Chinês de Curas Alimentares',
  author: 'Henry C. Lu',
  pageOffset: 15,
};

export const FOOD_MONOGRAPHS = '''
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(header + body + ';\n')
    io.open(OUT_JSON, 'w', encoding='utf-8', newline='\n').write(body)
    print(f'wrote {OUT_JS} ({len(foods)} monografias)')
    print(f'wrote {OUT_JSON}')


if __name__ == '__main__':
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PDF
    if not os.path.exists(pdf_path):
        sys.exit(f'PDF não encontrado: {pdf_path}')
    emit(extract(pdf_path))
