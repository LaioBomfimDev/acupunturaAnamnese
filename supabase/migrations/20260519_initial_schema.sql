-- Habilita a extensão pgcrypto para criptografia no banco de dados
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Criação da tabela de Profissionais (Profiles)
-- Esta tabela fica atrelada aos usuários autenticados do Supabase (auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'therapist',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilita Segurança a Nível de Linha (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Política: Profissionais podem ver o próprio perfil
CREATE POLICY "Profissionais veem apenas o próprio perfil" 
ON profiles FOR SELECT 
USING (auth.uid() = id);

-- Política: Profissionais podem editar o próprio perfil
CREATE POLICY "Profissionais editam o próprio perfil" 
ON profiles FOR UPDATE 
USING (auth.uid() = id);

-- Trigger para criar perfil automaticamente após login com Google (novo usuário)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. Criação da tabela de Pacientes (Patients)
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    birth_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilita RLS
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para Pacientes (ISOLAMENTO TOTAL)
CREATE POLICY "Profissional gerencia apenas seus próprios pacientes" 
ON patients FOR ALL 
USING (auth.uid() = therapist_id);


-- 3. Criação da tabela de Fichas Clínicas (Clinical Records)
-- Aqui utilizaremos pgcrypto para criptografar os dados sensíveis.
CREATE TABLE clinical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    therapist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    record_type TEXT NOT NULL, -- ex: 'anamnesis', 'evolution'
    sensitive_data_encrypted BYTEA NOT NULL, -- JSON com dados clínicos gravado em formato binário criptografado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilita RLS
ALTER TABLE clinical_records ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para Fichas Clínicas
CREATE POLICY "Profissional gerencia apenas as fichas de seus pacientes" 
ON clinical_records FOR ALL 
USING (auth.uid() = therapist_id);

-- Exemplo de como você fará um INSERT criptografado usando a chave em app_config
-- INSERT INTO clinical_records (patient_id, therapist_id, record_type, sensitive_data_encrypted)
-- VALUES (
--   'uuid-paciente', 
--   'uuid-profissional', 
--   'anamnesis', 
--   extensions.pgp_sym_encrypt('{"queixa": "Insônia crônica...", "pulso": "Vazio..."}'::text, 'sua-chave')
-- );

-- Exemplo de como você fará um SELECT descriptografando:
-- SELECT id, record_type, 
--        extensions.pgp_sym_decrypt(sensitive_data_encrypted, 'sua-chave') AS sensitive_data
-- FROM clinical_records
-- WHERE therapist_id = auth.uid();
