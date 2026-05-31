import process from 'node:process';

console.error([
  'Script desativado por segurança.',
  '',
  'Este fluxo antigo criava usuários com senhas previsíveis usando a chave pública do frontend.',
  'Use o painel SuperAdm para criar profissionais ou rode:',
  '',
  '  npm run bootstrap:superadmin',
  '',
  'com SUPABASE_SERVICE_ROLE_KEY definida apenas como variável temporária do terminal.',
].join('\n'));

process.exit(1);
