import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('frontend oferece cadastro e verificação TOTP sem registrar segredo', async () => {
  const [auth, gate, app] = await Promise.all([
    readFile(path.join(root, 'src/hooks/AuthContext.jsx'), 'utf8'),
    readFile(path.join(root, 'src/components/MfaGate.jsx'), 'utf8'),
    readFile(path.join(root, 'src/App.jsx'), 'utf8'),
  ]);

  assert.match(auth, /mfa\.getAuthenticatorAssuranceLevel/);
  assert.match(auth, /mfa\.listFactors/);
  assert.match(auth, /mfa\.enroll\(\{\s*factorType:\s*'totp'/);
  assert.match(auth, /mfa\.challenge/);
  assert.match(auth, /mfa\.verify/);
  assert.match(auth, /mfaLevel\.currentLevel !== 'aal2'/);
  assert.doesNotMatch(auth, /console\.[^(]+\([^)]*(?:totp|secret|qr_code)/i);

  assert.match(gate, /Código de 6 dígitos/);
  assert.match(gate, /autoComplete="one-time-code"/);
  assert.match(gate, /Cadastrar autenticador/);
  assert.match(gate, /Perdi acesso ao autenticador/);
  assert.match(app, /if \(needsMfa\)/);
  assert.match(app, /<MfaGate/);
  assert.match(app, /if \(loading\) \{\s*return <PanelLoading \/>/);
});

test('MFA é exigido depois da troca de senha obrigatória', async () => {
  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
  const passwordGate = app.indexOf('if (mustChangePassword)');
  const mfaGate = app.indexOf('if (needsMfa)');

  assert.ok(passwordGate >= 0);
  assert.ok(mfaGate > passwordGate);
});

test('recuperação MFA é administrativa, auditada e mantém a exigência', async () => {
  const [edge, adminService] = await Promise.all([
    readFile(
      path.resolve(root, '../supabase/functions/super-admin-reset-mfa/index.ts'),
      'utf8',
    ),
    readFile(path.join(root, 'src/services/adminService.js'), 'utf8'),
  ]);

  assert.match(edge, /assertSuperAdmin/);
  assert.match(edge, /mfa_recovery_authorized/);
  assert.match(edge, /if \(!auditAuthorized\)/);
  assert.match(edge, /auth\.admin\.mfa\.listFactors/);
  assert.match(edge, /auth\.admin\.mfa\.deleteFactor/);
  assert.doesNotMatch(edge, /mfa_required:\s*false/);
  assert.match(adminService, /functions\.invoke\('super-admin-reset-mfa'/);
});
