import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

test('login permite mostrar e ocultar a senha sem remover a proteção inicial', async () => {
  const source = await fs.readFile(
    path.join(frontendRoot, 'src', 'components', 'panels', 'Login.jsx'),
    'utf8',
  );

  assert.match(source, /const \[showPassword, setShowPassword\] = useState\(false\)/);
  assert.match(source, /type=\{showPassword \? 'text' : 'password'\}/);
  assert.match(source, /aria-label=\{showPassword \? 'Ocultar senha' : 'Mostrar senha'\}/);
  assert.match(source, /aria-pressed=\{showPassword\}/);
  assert.match(source, /aria-controls="login-password"/);
});

test('login usa um único cartão responsivo sobre o fundo clínico', async () => {
  const [component, styles] = await Promise.all([
    fs.readFile(
      path.join(frontendRoot, 'src', 'components', 'panels', 'Login.jsx'),
      'utf8',
    ),
    fs.readFile(path.join(frontendRoot, 'src', 'styles', 'login.css'), 'utf8'),
  ]);

  assert.doesNotMatch(component, /r1-login__brand/);
  assert.match(component, /className="r1-login__card"/);
  assert.match(styles, /login-clinic-neural-bg\.png/);
  assert.match(styles, /@media \(max-width: 600px\)/);
});
