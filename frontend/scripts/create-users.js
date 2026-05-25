import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hoyznqffprojawxvkfcd.supabase.co';
const supabaseAnonKey = 'sb_publishable_qKr7ATGOYJdmBL3B2dQzyA_42C44iqv';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const users = [
  { email: 'laio@acup.com', name: 'Laio', username: 'admLaio' },
  { email: 'karen@acup.com', name: 'Karen', username: 'admKaren' },
  { email: 'deni@acup.com', name: 'Deni', username: 'admDeni' }
];

async function createAdminUsers() {
  console.log('🚀 Iniciando cadastro de usuários administradores no Supabase...');
  
  for (const user of users) {
    console.log(`\n👤 Tentando cadastrar: ${user.username} (${user.email})...`);
    
    // Tentativa 1: Senha "12345"
    let password = '12345';
    let signUpResult;
    
    try {
      signUpResult = await supabase.auth.signUp({
        email: user.email,
        password: password,
        options: {
          data: {
            full_name: user.name,
            role: 'therapist'
          }
        }
      });
      
      if (signUpResult.error) {
        // Se o erro for sobre tamanho de senha (comum no Supabase, exigindo min 6 chars)
        if (signUpResult.error.message.includes('should be at least 6 characters') || signUpResult.error.message.includes('password_too_short')) {
          console.log(`⚠️  Senha "12345" é muito curta para as políticas padrão do Supabase.`);
          console.log(`🔄 Tentando com a senha alternativa "123456"...`);
          
          password = '123456';
          signUpResult = await supabase.auth.signUp({
            email: user.email,
            password: password,
            options: {
              data: {
                full_name: user.name,
                role: 'therapist'
              }
            }
          });
        }
      }
      
      if (signUpResult.error) {
        // Se já existir, não é um erro fatal
        if (signUpResult.error.message.includes('User already registered') || signUpResult.error.message.includes('already exists')) {
          console.log(`ℹ️  Usuário ${user.username} já está cadastrado no banco.`);
        } else {
          console.error(`❌ Erro ao cadastrar ${user.username}:`, signUpResult.error.message);
        }
      } else {
        console.log(`✅ Sucesso! Usuário cadastrado com a senha: "${password}"`);
        console.log(`   ID: ${signUpResult.data.user?.id}`);
      }
      
    } catch (err) {
      console.error(`❌ Erro inesperado ao cadastrar ${user.username}:`, err);
    }
  }
  
  console.log('\n🏁 Processo de cadastro finalizado!');
}

createAdminUsers();
