/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});
const LOCAL_FALLBACK_ENABLED = import.meta.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK === 'true';

// Usuários administradores locais (fallback quando Supabase não confirma e-mail)
const LOCAL_ADMINS = {
  admlaio:  { email: 'laio@acup.com',  name: 'Laio',  password: '123456' },
  admkaren: { email: 'karen@acup.com', name: 'Karen', password: '123456' },
  admdeni:  { email: 'deni@acup.com',  name: 'Deni',  password: '123456' },
};

const LOCAL_USER_KEY = 'acup_local_user';

function createMockUser(admin, username) {
  return {
    id: `local-${username}`,
    email: admin.email,
    user_metadata: { full_name: admin.name, role: 'therapist' },
    role: 'authenticated',
    app_metadata: { role: 'therapist' },
    _isLocal: true,
  };
}

function createLocalProfile(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.id?.replace(/^local-/, '') || '',
    full_name: user.user_metadata?.full_name || user.email,
    role: 'therapist',
    is_active: true,
    must_change_password: false,
  };
}

async function throwFunctionError(error, fallbackMessage) {
  if (!error) return;

  if (typeof error.context?.json === 'function') {
    try {
      const body = await error.context.json();
      throw new Error(body?.error || body?.message || error.message || fallbackMessage);
    } catch (bodyError) {
      if (bodyError instanceof Error && bodyError.message) {
        throw bodyError;
      }
    }
  }

  throw new Error(error.message || fallbackMessage);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  async function loadProfileForUser(nextUser) {
    setProfileError('');

    if (!nextUser) {
      setProfile(null);
      return null;
    }

    if (nextUser._isLocal) {
      const localProfile = createLocalProfile(nextUser);
      setProfile(localProfile);
      return localProfile;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,username,full_name,role,phone,document,professional_registration,specialty,clinic_name,is_active,must_change_password,password_changed_at')
      .eq('id', nextUser.id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao carregar perfil:', error);
      setProfile(null);
      setProfileError(error.message || 'Não foi possível carregar o perfil.');
      return null;
    }

    setProfile(data);
    return data;
  }

  useEffect(() => {
    // 1. Verifica se há um usuário local salvo no localStorage
    const savedLocal = localStorage.getItem(LOCAL_USER_KEY);
    if (savedLocal && LOCAL_FALLBACK_ENABLED) {
      try {
        const localUser = JSON.parse(savedLocal);
        setUser(localUser);
        setProfile(createLocalProfile(localUser));
        setLoading(false);
        return;
      } catch { /* ignora JSON inválido */ }
    } else if (savedLocal) {
      localStorage.removeItem(LOCAL_USER_KEY);
    }

    // 2. Busca a sessão atual do Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(error => {
      console.error('Erro ao carregar sessão:', error);
      setLoading(false);
    });

    // 3. Escuta mudanças no estado de autenticação (ex: login, logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Só atualiza se não houver usuário local ativo
      if (!localStorage.getItem(LOCAL_USER_KEY)) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadProfileForUser(user);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const signInWithPassword = async (emailOrUsername, password) => {
    const identifier = emailOrUsername.trim();
    const lower = identifier.toLowerCase();

    // Resolve atalhos de username → email
    let directEmail = lower.includes('@') ? lower : null;
    let resolvedUsername = null;
    if (lower === 'admlaio') {
      directEmail = 'laio@acup.com';
      resolvedUsername = 'admlaio';
    } else if (lower === 'admkaren') {
      directEmail = 'karen@acup.com';
      resolvedUsername = 'admkaren';
    } else if (lower === 'admdeni') {
      directEmail = 'deni@acup.com';
      resolvedUsername = 'admdeni';
    } else if (lower === 'superadm') {
      directEmail = 'superadm@sistema.com';
      resolvedUsername = 'superadm';
    }

    let directError = null;

    // Tenta login direto quando já temos o e-mail real.
    if (directEmail) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: directEmail,
        password,
      });

      if (!error) {
        localStorage.removeItem(LOCAL_USER_KEY);
        setUser(data.user ?? null);
        return data;
      }

      directError = error;
    }

    // Para login curto, resolve e autentica no servidor sem expor lista de e-mails.
    if (!directEmail || directError) {
      try {
        const { data, error } = await supabase.functions.invoke('login-with-identifier', {
          body: { identifier, password },
        });

        await throwFunctionError(error, 'Usuário ou senha incorretos.');

        if (data?.error) {
          throw new Error(data.error);
        }

        if (data?.session?.access_token && data?.session?.refresh_token) {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });

          if (sessionError) throw sessionError;

          localStorage.removeItem(LOCAL_USER_KEY);
          setUser(sessionData.user ?? data.user ?? null);
          return sessionData;
        }
      } catch (functionError) {
        if (directEmail && directError) {
          throw directError;
        }
        if (!LOCAL_FALLBACK_ENABLED) {
          throw functionError;
        }
      }
    }

    // Se Supabase falhou, tenta fallback local para admins conhecidos
    if (!LOCAL_FALLBACK_ENABLED) {
      throw directError || new Error('Usuário ou senha incorretos.');
    }

    const adminKey = resolvedUsername || Object.keys(LOCAL_ADMINS).find(
      k => LOCAL_ADMINS[k].email === directEmail
    );

    if (adminKey && LOCAL_ADMINS[adminKey]) {
      const admin = LOCAL_ADMINS[adminKey];
      if (password === admin.password) {
        const mockUser = createMockUser(admin, adminKey);
        localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(mockUser));
        setUser(mockUser);
        setProfile(createLocalProfile(mockUser));
        return { user: mockUser, session: null };
      }
    }

    // Nenhum fallback encontrado — repassa o erro original do Supabase
    throw directError || new Error('Usuário ou senha incorretos.');
  };

  const signOut = async () => {
    localStorage.removeItem(LOCAL_USER_KEY);
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    return loadProfileForUser(user);
  };

  const changeTemporaryPassword = async (password, confirmPassword) => {
    const { data, error } = await supabase.functions.invoke('complete-first-login', {
      body: { password, confirmPassword },
    });

    if (error) {
      if (typeof error.context?.json === 'function') {
        try {
          const body = await error.context.json();
          throw new Error(body?.error || body?.message || error.message || 'Não foi possível alterar a senha.');
        } catch (bodyError) {
          if (bodyError instanceof Error && bodyError.message) throw bodyError;
        }
      }
      throw new Error(error.message || 'Não foi possível alterar a senha.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    await refreshProfile();
    return data;
  };

  const isSuperAdmin = profile?.role === 'super_admin' && profile?.is_active === true && profile?.must_change_password !== true;
  const mustChangePassword = profile?.is_active === true && profile?.must_change_password === true;

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      profileError,
      isSuperAdmin,
      mustChangePassword,
      signInWithPassword,
      signOut,
      loading,
      refreshProfile,
      changeTemporaryPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  return useContext(AuthContext);
};
