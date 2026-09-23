import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { getClinicLetterheadColor } from '../../src/utils/reportUtils.js';

// Gestão → Personalizar: o clinic_admin escolhe a cor do sistema e, se
// quiser, uma cor separada pro papel timbrado.

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../../../supabase/migrations/20260923_clinic_appearance.sql');
const srcDir = path.resolve(here, '../../src');

let migration;

before(async () => {
  migration = await readFile(migrationPath, 'utf8');
});

test('timbrado usa letterhead_color quando a clínica separou as cores', () => {
  assert.equal(
    getClinicLetterheadColor({ brand_color: '#8C4460', letterhead_color: '#2E5A7D' }),
    '#2E5A7D',
  );
});

test('sem letterhead_color o timbrado segue a cor do sistema (comportamento antigo)', () => {
  assert.equal(getClinicLetterheadColor({ brand_color: '#8C4460', letterhead_color: null }), '#8C4460');
  assert.equal(getClinicLetterheadColor({ brand_color: '#8C4460' }), '#8C4460');
  assert.equal(getClinicLetterheadColor(null), '');
});

test('documentos não leem brand_color direto — sempre via getClinicLetterheadColor', async () => {
  const files = [
    'components/PatientEvolutionTimeline.jsx',
    'components/ClinicPatientProfile.jsx',
    'components/panels/DocumentosTimbrados.jsx',
    'components/panels/Relatorio.jsx',
    'components/anamnese/DisciplineRelatorio.jsx',
    'components/psychology/PsychologyRelatorio.jsx',
    'components/psychology/PsychologyNeuroReport.jsx',
  ];
  for (const file of files) {
    const source = await readFile(path.join(srcDir, file), 'utf8');
    assert.doesNotMatch(source, /clinic\?\.brand_color/, `${file} ignora a cor do timbrado`);
    assert.match(source, /getClinicLetterheadColor\(clinic\)/, file);
  }
});

test('RPC só deixa o clinic_admin alterar as cores da própria clínica', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS letterhead_color TEXT/);
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = public/);
  assert.match(migration, /IF NOT public\.is_clinic_admin\(v_actor_id\) THEN/);
  assert.match(migration, /v_clinic UUID := public\.user_clinic_id\(auth\.uid\(\)\)/);
  assert.match(migration, /WHERE id = v_clinic;/);
  // Só as duas colunas de cor — nada de nome/CNPJ/logo pelo admin.
  const update = migration.match(/UPDATE public\.clinics\s+SET([\s\S]*?)WHERE/)[1];
  const columns = [...update.matchAll(/(\w+)\s*=/g)].map(match => match[1]).sort();
  assert.deepEqual(columns, ['brand_color', 'letterhead_color']);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.clinic_admin_update_appearance\(TEXT, TEXT\) FROM PUBLIC, anon/);
});

test('policy de UPDATE da tabela clinics não foi aberta ao clinic_admin', () => {
  assert.doesNotMatch(migration, /CREATE POLICY/);
});

test('logo pelo clinic_admin: só bitmap base64, com teto, só na própria clínica', async () => {
  const logoMigration = await readFile(
    path.resolve(here, '../../../supabase/migrations/20260923b_clinic_admin_logo.sql'),
    'utf8',
  );
  assert.match(logoMigration, /IF NOT public\.is_clinic_admin\(v_actor_id\) THEN/);
  assert.match(logoMigration, /v_clinic UUID := public\.user_clinic_id\(auth\.uid\(\)\)/);
  assert.match(logoMigration, /length\(v_logo\) > 300000/);
  // SVG fica de fora: o frontend rasteriza antes de enviar.
  assert.match(logoMigration, /\^data:image\/\(png\|jpeg\|webp\);base64,/);
  assert.doesNotMatch(logoMigration, /\(png\|jpeg\|webp\|svg/);
  const update = logoMigration.match(/UPDATE public\.clinics\s+SET([\s\S]*?)WHERE/)[1];
  const columns = [...update.matchAll(/(\w+)\s*=/g)].map(match => match[1]).sort();
  assert.deepEqual(columns, ['logo_url', 'logo_watermark']);
  assert.doesNotMatch(logoMigration, /CREATE POLICY/);

  const personalizar = await readFile(path.join(srcDir, 'components/panels/PersonalizarClinica.jsx'), 'utf8');
  assert.match(personalizar, /readLogoFile\(file, \{ keepSvg: false \}\)/);
});
