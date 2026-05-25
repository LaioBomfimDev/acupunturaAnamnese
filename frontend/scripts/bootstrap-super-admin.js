import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const index = line.indexOf('=');
        if (index === -1) return [line, ''];
        return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')];
      })
  );
}

const env = {
  ...readEnvFile(resolve(process.cwd(), '.env')),
  ...readEnvFile(resolve(process.cwd(), '.env.local')),
  ...process.env,
};

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local ou no ambiente.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const SUPER_ADMIN = {
  email: env.SUPER_ADMIN_EMAIL || 'superadm@sistema.com',
  username: env.SUPER_ADMIN_USERNAME || 'superadm',
  fullName: env.SUPER_ADMIN_FULL_NAME || 'SuperAdm',
  password: env.SUPER_ADMIN_PASSWORD || '654321',
};

async function findExistingUserByEmail(email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;

    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function bootstrap() {
  const existing = await findExistingUserByEmail(SUPER_ADMIN.email);
  let user = existing;

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: SUPER_ADMIN.email,
      password: SUPER_ADMIN.password,
      email_confirm: true,
      user_metadata: {
        full_name: SUPER_ADMIN.fullName,
        username: SUPER_ADMIN.username,
        role: 'super_admin',
      },
      app_metadata: {
        role: 'super_admin',
      },
    });

    if (error) throw error;
    user = data.user;
    console.log(`SuperAdm criado: ${SUPER_ADMIN.username} (${SUPER_ADMIN.email})`);
  } else {
    console.log(`SuperAdm já existe no Auth: ${SUPER_ADMIN.email}`);

    if (env.RESET_SUPER_ADMIN_PASSWORD === 'true') {
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        password: SUPER_ADMIN.password,
      });
      if (error) throw error;
      console.log('Senha inicial do SuperAdm foi redefinida por RESET_SUPER_ADMIN_PASSWORD=true.');
    }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: SUPER_ADMIN.email,
      username: SUPER_ADMIN.username,
      full_name: SUPER_ADMIN.fullName,
      role: 'super_admin',
      is_active: true,
      must_change_password: true,
      password_changed_at: null,
    }, { onConflict: 'id' });

  if (profileError) throw profileError;

  console.log('Perfil SuperAdm garantido com troca de senha obrigatória no primeiro acesso.');
  console.log(`Login: ${SUPER_ADMIN.username}`);
  console.log(`Senha inicial: ${SUPER_ADMIN.password}`);
}

bootstrap().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
