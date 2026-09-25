import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { isPersonalAccentAllowed, resolveScreenAccentColor } from '../../src/utils/screenAccent.js';

// Cor da tela por profissional com trava da instituição + Gestão pessoal
// (Personalizar + Meu cadastro) para quem não é admin.

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '../../src');
const migrationPath = path.resolve(here, '../../../supabase/migrations/20260925b_personal_accent_self_profile.sql');

let migration;

before(async () => {
  migration = await readFile(migrationPath, 'utf8');
});

function functionBody(name) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, `função ${name} não encontrada`);
  const end = migration.indexOf('REVOKE ALL ON FUNCTION', start);
  return migration.slice(start, end);
}

function updatedColumns(body, table) {
  const match = body.match(new RegExp(`UPDATE public\\.${table}\\s+SET([\\s\\S]*?)WHERE`));
  assert.ok(match, `UPDATE em ${table} não encontrado`);
  return [...match[1].matchAll(/^\s*(\w+)\s*=/gm)].map(item => item[1]).sort();
}

const CLINIC = { id: 'c1', brand_color: '#2E5A7D' };

test('cor fixa (padrão): a tela usa a cor da instituição mesmo com cor pessoal gravada', () => {
  const profile = { accent_color: '#A62D63', clinic: { ...CLINIC, personal_accent_allowed: false } };
  assert.equal(isPersonalAccentAllowed(profile), false);
  assert.equal(resolveScreenAccentColor(profile), '#2E5A7D');
  // Coluna ainda não existe no banco (migração pendente) = cor fixa.
  assert.equal(resolveScreenAccentColor({ accent_color: '#A62D63', clinic: CLINIC }), '#2E5A7D');
});

test('escolha liberada: vale a cor da pessoa; sem escolha, a da instituição', () => {
  const clinic = { ...CLINIC, personal_accent_allowed: true };
  assert.equal(resolveScreenAccentColor({ accent_color: '#A62D63', clinic }), '#A62D63');
  assert.equal(resolveScreenAccentColor({ accent_color: null, clinic }), '#2E5A7D');
});

test('sem instituição não há trava; sem cor nenhuma, volta ao padrão do tokens.css', () => {
  assert.equal(resolveScreenAccentColor({ accent_color: '#8C6D12', clinic: null }), '#8C6D12');
  assert.equal(resolveScreenAccentColor({ accent_color: null, clinic: null }), '');
  assert.equal(resolveScreenAccentColor(null), '');
});

test('AuthContext pinta a tela com resolveScreenAccentColor, não com brand_color direto', async () => {
  const source = await readFile(path.join(srcDir, 'hooks/AuthContext.jsx'), 'utf8');
  assert.match(source, /resolveScreenAccentColor\(profile\)/);
  assert.doesNotMatch(source, /const brandColor = profile\?\.clinic\?\.brand_color/);
});

test('documentos nunca leem a cor pessoal', async () => {
  const files = [
    'components/PatientEvolutionTimeline.jsx',
    'components/ClinicPatientProfile.jsx',
    'components/panels/DocumentosTimbrados.jsx',
    'components/panels/Relatorio.jsx',
    'components/anamnese/DisciplineRelatorio.jsx',
    'components/psychology/PsychologyRelatorio.jsx',
    'components/psychology/PsychologyNeuroReport.jsx',
    'utils/reportUtils.js',
  ];
  for (const file of files) {
    const source = await readFile(path.join(srcDir, file), 'utf8');
    assert.doesNotMatch(source, /accent_color|resolveScreenAccentColor/, `${file} usa a cor pessoal`);
  }
});

test('update_my_profile só grava dados pessoais da própria linha', () => {
  const body = functionBody('update_my_profile');
  assert.match(body, /SECURITY DEFINER\s+SET search_path = public/);
  assert.match(body, /v_actor_id UUID := auth\.uid\(\)/);
  assert.match(body, /WHERE id = v_actor_id\s+RETURNING/);
  assert.match(body, /v_previous\.is_active IS NOT TRUE/);
  assert.match(body, /v_previous\.must_change_password IS TRUE/);
  assert.deepEqual(updatedColumns(body, 'profiles'), [
    'document',
    'endereco_bairro',
    'endereco_cep',
    'endereco_cidade',
    'endereco_complemento',
    'endereco_logradouro',
    'endereco_numero',
    'endereco_uf',
    'full_name',
    'phone',
    'professional_registration',
    'specialty',
  ]);
  // Profissão decide áreas liberadas (resolveUserDisciplines): nunca autoeditável.
  assert.doesNotMatch(body, /\bp_(profession|role|clinic\w*|disciplines|notes|is_active)\b/);
  assert.match(body, /'profile_self_updated'/);
});

test('update_my_accent_color respeita a trava da instituição', () => {
  const body = functionBody('update_my_accent_color');
  assert.match(body, /SECURITY DEFINER\s+SET search_path = public/);
  assert.match(body, /c\.personal_accent_allowed/);
  assert.match(body, /IF v_allowed IS NOT TRUE THEN/);
  assert.deepEqual(updatedColumns(body, 'profiles'), ['accent_color']);
  assert.match(body, /WHERE id = v_actor_id;/);
});

test('só o clinic_admin trava/libera, e só na própria instituição', () => {
  const body = functionBody('clinic_admin_set_personal_accent');
  assert.match(body, /IF NOT public\.is_clinic_admin\(v_actor_id\) THEN/);
  assert.match(body, /v_clinic UUID := public\.user_clinic_id\(auth\.uid\(\)\)/);
  assert.deepEqual(updatedColumns(body, 'clinics'), ['personal_accent_allowed']);
  assert.match(body, /WHERE id = v_clinic;/);
});

test('migração não abre policy nem deixa anon executar as RPCs', () => {
  assert.doesNotMatch(migration, /CREATE POLICY/);
  assert.match(migration, /personal_accent_allowed BOOLEAN NOT NULL DEFAULT FALSE/);
  for (const signature of [
    'clinic_admin_set_personal_accent(BOOLEAN)',
    'update_my_accent_color(TEXT)',
    'update_my_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)',
  ]) {
    assert.ok(
      migration.includes(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon;`),
      `${signature} sem REVOKE de anon`,
    );
  }
});

function relativeLuminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('paleta sem vermelho de risco, com rosas e dourados, e texto branco legível', async () => {
  const service = await readFile(path.join(srcDir, 'services/clinicService.js'), 'utf8');
  const tokens = await readFile(path.join(srcDir, 'styles/tokens.css'), 'utf8');
  const block = service.match(/export const CLINIC_BRAND_COLORS = \[([\s\S]*?)\];/)[1];
  const colors = [...block.matchAll(/value: '(#[0-9A-Fa-f]{6})', label: '([^']+)'/g)]
    .map(match => ({ value: match[1].toUpperCase(), label: match[2] }));

  const danger = tokens.match(/--r1-red-500:\s*(#[0-9a-fA-F]{6})/)[1].toUpperCase();
  assert.ok(!colors.some(color => color.value === danger), 'vermelho de risco voltou para a paleta');
  assert.ok(!colors.some(color => /vermelho/i.test(color.label)));
  assert.ok(colors.filter(color => /^Rosa/.test(color.label)).length >= 4, 'faltam tons de rosa');
  assert.ok(colors.filter(color => /Dourado|Ouro/.test(color.label)).length >= 3, 'faltam tons de dourado');
  assert.equal(new Set(colors.map(color => color.value)).size, colors.length, 'cor repetida na paleta');

  for (const color of colors) {
    const ratio = 1.05 / (relativeLuminance(color.value) + 0.05);
    assert.ok(ratio >= 4.5, `${color.label} (${color.value}) sem contraste para texto branco: ${ratio.toFixed(2)}`);
  }
});

test('Gestão pessoal não monta nada da instituição', async () => {
  const app = await readFile(path.join(srcDir, 'App.jsx'), 'utf8');
  assert.match(app, /isClinicAdmin \? \(\s*<RelatoriosGestao/);
  assert.match(app, /<GestaoProfissional profile=\{profile\}/);

  const personal = await readFile(path.join(srcDir, 'components/panels/GestaoProfissional.jsx'), 'utf8');
  const imports = personal.match(/^import .*$/gm).join('\n');
  assert.doesNotMatch(imports, /PersonalizarClinica|DocumentosTimbrados|RelatoriosGestao|Service/);

  // Número-resumo da recepção não leva à Gestão pessoal por engano.
  const home = await readFile(path.join(srcDir, 'components/HomeConsole.jsx'), 'utf8');
  assert.doesNotMatch(home, /onOpenGestao\('indicadores'\)|onOpenGestao\('retornos'\)/);
  assert.match(home, /hasInstitutionalGestao = variant === 'admin' \|\| variant === 'admin-professional'/);
});

// Regressão: o `input { width: 100% }` global do App.css esticava a caixa
// de marca d'água e os rádios da trava, empurrando o texto para fora do
// cartão da aba Personalizar.
test('caixas de seleção da Personalizar não herdam largura total', async () => {
  const appCss = await readFile(path.join(srcDir, 'App.css'), 'utf8');
  const gestaoCss = await readFile(path.join(srcDir, 'styles/gestao.css'), 'utf8');
  const watermark = appCss.match(/\.clinic-watermark-toggle input \{([^}]*)\}/)[1];
  const policy = gestaoCss.match(/\.gt-accent-policy-option input \{([^}]*)\}/)[1];
  assert.match(watermark, /width: auto;/);
  assert.match(policy, /width: auto;/);
});

test('Meu cadastro mostra profissão só para leitura', async () => {
  const source = await readFile(path.join(srcDir, 'components/panels/MeuCadastro.jsx'), 'utf8');
  assert.match(source, /<ReadOnlyField label="Profissão"/);
  assert.doesNotMatch(source, /ProfessionRegistration|setField\('profession'/);
});
