/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  clearLocalAuthenticatedUser,
  LOCAL_USER_KEY,
  readLocalAuthenticatedUser,
  storeLocalAuthenticatedUser,
} from '../lib/localAuthStorage';
import { getClinicForProfile } from '../services/clinicService';
import { DISCIPLINE_IDS } from '../data/disciplines';

const AuthContext = createContext({});
const LOCAL_FALLBACK_ENABLED =
  import.meta.env.DEV
  && import.meta.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK === 'true';

async function loadLocalAuthFallback() {
  if (!LOCAL_FALLBACK_ENABLED) return null;
  return import('../dev/localAuthFallback.js');
}

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
    // Contas locais são as de teste do Laio — multi-disciplina por decisão
    // (docs/plano-clinica-multidisciplinar.md §1).
    disciplines: [...DISCIPLINE_IDS],
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
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileResolvedUserId, setProfileResolvedUserId] = useState(null);
  const [mfaResolvedUserId, setMfaResolvedUserId] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [mfaFactors, setMfaFactors] = useState([]);
  const [mfaLevel, setMfaLevel] = useState({ currentLevel: null, nextLevel: null });

  async function loadClinicForProfile(profileData) {
    if (!profileData) return { clinic: null, clinicLoadError: '' };

    try {
      const clinic = await getClinicForProfile(profileData);
      return { clinic, clinicLoadError: '' };
    } catch (error) {
      console.error('Erro ao carregar clínica do perfil:', error);
      return {
        clinic: null,
        clinicLoadError: error.message || 'Não foi possível carregar os dados da clínica.',
      };
    }
  }

  async function loadProfileForUser(nextUser) {
    setProfileError('');

    if (!nextUser) {
      setProfile(null);
      return null;
    }

    if (LOCAL_FALLBACK_ENABLED && nextUser._isLocal) {
      const localProfile = createLocalProfile(nextUser);
      const clinicResult = await loadClinicForProfile(localProfile);
      const withClinic = { ...localProfile, ...clinicResult };
      setProfile(withClinic);
      return withClinic;
    }

    const baseColumns = 'id,email,username,full_name,role,phone,document,professional_registration,specialty,clinic_name,is_active,must_change_password,password_changed_at';

    let { data, error } = await supabase
      .from('profiles')
      .select(`${baseColumns},clinic_id,profession,disciplines,mfa_required`)
      .eq('id', nextUser.id)
      .maybeSingle();

    // Banco ainda sem a migração de disciplinas (20260707): refaz sem ela
    // (o frontend cai no fallback de resolveUserDisciplines).
    if (error && /disciplines|profession|mfa_required/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('profiles')
        .select(`${baseColumns},clinic_id`)
        .eq('id', nextUser.id)
        .maybeSingle());
    }

    // Banco ainda sem a migração de clínicas: refaz sem a coluna clinic_id
    if (error && /clinic_id/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('profiles')
        .select(baseColumns)
        .eq('id', nextUser.id)
        .maybeSingle());
    }

    if (error) {
      console.error('Erro ao carregar perfil:', error);
      setProfile(null);
      setProfileError(error.message || 'Não foi possível carregar o perfil.');
      return null;
    }

    if (!data) {
      setProfile(null);
      setProfileError('Não foi possível carregar o perfil de acesso.');
      return null;
    }

    const clinicResult = await loadClinicForProfile(data);
    const withClinic = { ...data, ...clinicResult };
    setProfile(withClinic);
    return withClinic;
  }

  useEffect(() => {
    // O helper remove sessões locais residuais quando o fallback não está
    // explicitamente habilitado em desenvolvimento.
    const localUser = readLocalAuthenticatedUser({
      enabled: LOCAL_FALLBACK_ENABLED,
    });
    if (localUser) {
      setUser(localUser);
      setProfile(createLocalProfile(localUser));
      setSessionLoading(false);
      return;
    }

    // 1. Busca a sessão atual do Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSessionLoading(false);
    }).catch(error => {
      console.error('Erro ao carregar sessão:', error);
      setSessionLoading(false);
    });

    // 2. Escuta mudanças no estado de autenticação (ex: login, logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Só atualiza se não houver usuário local ativo
      if (!LOCAL_FALLBACK_ENABLED || !localStorage.getItem(LOCAL_USER_KEY)) {
        setUser(session?.user ?? null);
        setSessionLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    const userId = user?.id || null;
    setProfileResolvedUserId(null);

    void loadProfileForUser(user).finally(() => {
      if (active) setProfileResolvedUserId(userId);
    });

    return () => {
      active = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function getMfaState(nextUser) {
    if (!nextUser || nextUser._isLocal) {
      return {
        factors: [],
        level: { currentLevel: null, nextLevel: null },
      };
    }

    const [levelResult, factorsResult] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    if (levelResult.error) throw levelResult.error;
    if (factorsResult.error) throw factorsResult.error;

    return {
      factors: factorsResult.data?.totp || [],
      level: {
        currentLevel: levelResult.data?.currentLevel || null,
        nextLevel: levelResult.data?.nextLevel || null,
      },
    };
  }

  async function refreshMfaState(nextUser = user) {
    const nextState = await getMfaState(nextUser);
    setMfaFactors(nextState.factors);
    setMfaLevel(nextState.level);
  }

  useEffect(() => {
    let active = true;
    const userId = user?.id || null;
    setMfaResolvedUserId(null);
    setMfaFactors([]);
    setMfaLevel({ currentLevel: null, nextLevel: null });

    void getMfaState(user)
      .then(nextState => {
        if (!active) return;
        setMfaFactors(nextState.factors);
        setMfaLevel(nextState.level);
      })
      .catch(error => {
        if (!active) return;
        console.error('Falha ao consultar o estado do segundo fator:', {
          name: error?.name || 'Error',
          code: error?.code || 'MFA_STATE_ERROR',
        });
      })
      .finally(() => {
        if (active) setMfaResolvedUserId(userId);
      });

    return () => {
      active = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const signInWithPassword = async (emailOrUsername, password) => {
    const identifier = emailOrUsername.trim();
    let authenticationError = null;

    // Todo login real passa pelo servidor, inclusive quando o identificador já
    // é um e-mail, para aplicar os mesmos gates e limites sem expor contas.
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

        clearLocalAuthenticatedUser();
        setUser(sessionData.user ?? data.user ?? null);
        return sessionData;
      }
    } catch (functionError) {
      authenticationError ||= functionError;
    }

    // Credenciais locais só são importadas no servidor Vite de desenvolvimento
    // quando o opt-in foi explicitamente habilitado.
    if (LOCAL_FALLBACK_ENABLED) {
      const localAuth = await loadLocalAuthFallback();
      const localMatch = localAuth?.authenticateLocalUser(identifier, password);
      if (localMatch) {
        const mockUser = createMockUser(localMatch, localMatch.username);
        storeLocalAuthenticatedUser(mockUser);
        setUser(mockUser);
        setProfile(createLocalProfile(mockUser));
        return { user: mockUser, session: null };
      }
    }

    throw authenticationError || new Error('Usuário ou senha incorretos.');
  };

  const signOut = async () => {
    // Precisa ser chamado ANTES de auth.signOut(): depois disso não há
    // mais token para o servidor identificar quem saiu. Best-effort —
    // nunca deve atrasar ou bloquear o logout no cliente.
    if (!user?._isLocal) {
      try {
        await supabase.functions.invoke('log-logout', { body: {} });
      } catch {
        // silencioso de propósito — ver comentário acima
      }
    }

    clearLocalAuthenticatedUser();
    setUser(null);
    setProfile(null);
    setMfaFactors([]);
    setMfaLevel({ currentLevel: null, nextLevel: null });
    await supabase.auth.signOut();
  };

  const enrollMfa = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Reability One',
    });
    if (error) throw error;
    return data;
  };

  const verifyMfa = async (factorId, code) => {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) throw challengeError;

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) throw verifyError;

    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    await refreshMfaState();
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
  const isClinicAdmin = profile?.role === 'clinic_admin' && profile?.is_active === true && profile?.must_change_password !== true;
  const isKnowledgeReviewer = profile?.role === 'knowledge_reviewer' && profile?.is_active === true && profile?.must_change_password !== true;
  const mustChangePassword = profile?.is_active === true && profile?.must_change_password === true;
  const needsMfa = profile?.mfa_required === true && mfaLevel.currentLevel !== 'aal2';
  const profileLoading = Boolean(
    user?.id && profileResolvedUserId !== user.id,
  );
  const mfaLoading = Boolean(user?.id && mfaResolvedUserId !== user.id);
  const loading = sessionLoading || profileLoading || mfaLoading;

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      profileError,
      isSuperAdmin,
      isClinicAdmin,
      isKnowledgeReviewer,
      mustChangePassword,
      needsMfa,
      mfaFactors,
      mfaLevel,
      enrollMfa,
      verifyMfa,
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
