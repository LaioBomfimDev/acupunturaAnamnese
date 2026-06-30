import { supabase } from '../lib/supabase';
import { publicAtlasAssetUrl } from './knowledgeSourceAssetService';

export const HEALTH_STATUS = {
  OK: 'ok',
  WARNING: 'warning',
  BLOCKED: 'blocked',
};

export const PUBLIC_ATLAS_BUCKET = 'knowledge-atlas-public';
export const PUBLIC_ATLAS_PROBE_ASSET_KEY = 'atlas-ednea/source-index.json';
export const KNOWLEDGE_SOURCE_ASSET_FUNCTION = 'knowledge-source-asset-url';
export const EDGE_FUNCTION_PROBE_ASSET_KEY = 'deploy-health/probe-missing.json';
export const AI_SMOKE_PURPOSE = 'deploy-health';

export const AI_SMOKE_FUNCTIONS = [
  {
    id: 'aiSmokeSuggestMarks',
    functionName: 'suggest-marks',
    title: 'IA de anamnese: suggest-marks',
  },
  {
    id: 'aiSmokeClinicalReasoning',
    functionName: 'clinical-reasoning',
    title: 'IA de raciocínio: clinical-reasoning',
  },
  {
    id: 'aiSmokeDraftNarrative',
    functionName: 'draft-narrative',
    title: 'IA de narrativas: draft-narrative',
  },
  {
    id: 'aiSmokeLibraryQa',
    functionName: 'library-qa',
    title: 'IA da Biblioteca: library-qa',
  },
];

const SUPABASE_URL = String(import.meta.env?.VITE_SUPABASE_URL || '').trim();

export const CRITICAL_DEPLOY_MIGRATIONS = [
  {
    id: '20260522_patient_age_archive',
    title: 'Pacientes: idade e arquivamento',
    file: 'supabase/migrations/20260522_patient_age_archive.sql',
    correction: 'Execute a migration 20260522_patient_age_archive.sql antes de cadastrar idade ou arquivar pacientes.',
  },
  {
    id: '20260612_clinics',
    title: 'Clínicas: cadastro institucional',
    file: 'supabase/migrations/20260612_clinics.sql',
    correction: 'Execute a migration 20260612_clinics.sql para criar clinics, clinic_id e admin_set_profile_clinic.',
  },
  {
    id: '20260612_clinics_hardening',
    title: 'Clínicas: RLS endurecido',
    file: 'supabase/migrations/20260612_clinics_hardening.sql',
    correction: 'Execute 20260612_clinics_hardening.sql para restringir leitura de clínicas ao SuperAdm ou profissional vinculado.',
  },
  {
    id: '20260614_clinic_logo',
    title: 'Clínicas: logo no papel timbrado',
    file: 'supabase/migrations/20260614_clinic_logo.sql',
    correction: 'Execute 20260614_clinic_logo.sql para habilitar logo_url nas clínicas.',
  },
  {
    id: '20260615_knowledge_source_assets',
    title: 'Fontes privadas: manifesto e bucket protegido',
    file: 'supabase/migrations/20260615_knowledge_source_assets.sql',
    correction: 'Execute 20260615_knowledge_source_assets.sql e sincronize o manifesto das fontes privadas.',
  },
  {
    id: '20260615_knowledge_atlas_public_bucket',
    title: 'Atlas público: bucket dedicado',
    file: 'supabase/migrations/20260615_knowledge_atlas_public_bucket.sql',
    correction: 'Execute 20260615_knowledge_atlas_public_bucket.sql e envie o índice do Atlas para o bucket público.',
  },
];

const DB_CHECKS = [
  {
    id: 'patientsAgeColumn',
    title: 'Coluna patients.age',
    fallbackOk: 'A coluna patients.age está disponível.',
    fallbackBlocked: 'A coluna patients.age não foi encontrada.',
    correction: 'Execute supabase/migrations/20260522_patient_age_archive.sql.',
  },
  {
    id: 'publicAtlasBucket',
    title: `Bucket público ${PUBLIC_ATLAS_BUCKET}`,
    fallbackOk: 'Bucket público do Atlas encontrado.',
    fallbackBlocked: 'Bucket público do Atlas ausente ou privado.',
    correction: 'Execute a migration 20260615_knowledge_atlas_public_bucket.sql e confirme public=true no Storage.',
  },
  {
    id: 'knowledgeSourceAssets',
    title: 'Fontes privadas protegidas',
    fallbackOk: 'Bucket privado e manifesto de fontes protegidas estão disponíveis.',
    fallbackBlocked: 'Bucket privado ou manifesto de fontes protegidas está ausente.',
    correction: 'Execute 20260615_knowledge_source_assets.sql e sincronize knowledge_source_assets.',
  },
  {
    id: 'clinicsSchema',
    title: 'Schema de clínicas',
    fallbackOk: 'Estrutura de clínicas disponível.',
    fallbackBlocked: 'Estrutura de clínicas incompleta.',
    correction: 'Execute as migrations 20260612_clinics.sql, 20260612_clinics_hardening.sql e 20260614_clinic_logo.sql.',
  },
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function countByStatus(items, status) {
  return items.filter(item => item.status === status).length;
}

function buildHealthResult(items, checkedAt = new Date().toISOString()) {
  return {
    checkedAt,
    checks: items,
    migrations: [],
    items,
    summary: summarizeDeployHealth(items),
  };
}

export function summarizeDeployHealth(items) {
  const all = asArray(items);
  const blocked = countByStatus(all, HEALTH_STATUS.BLOCKED);
  const warning = countByStatus(all, HEALTH_STATUS.WARNING);

  return {
    total: all.length,
    ok: countByStatus(all, HEALTH_STATUS.OK),
    warning,
    blocked,
    status: blocked > 0 ? HEALTH_STATUS.BLOCKED : warning > 0 ? HEALTH_STATUS.WARNING : HEALTH_STATUS.OK,
  };
}

export function getSupabaseUrlConfigCheck(value = SUPABASE_URL) {
  const raw = String(value || '').trim();

  if (!raw) {
    return {
      id: 'supabaseProjectUrl',
      title: 'URL do projeto Supabase',
      group: 'Configuração',
      status: HEALTH_STATUS.BLOCKED,
      detail: 'VITE_SUPABASE_URL não está configurada.',
      correction: 'Configure VITE_SUPABASE_URL com a URL do projeto, no formato https://<project-ref>.supabase.co.',
    };
  }

  try {
    const url = new URL(raw);
    if (url.hostname === 'api.supabase.com') {
      return {
        id: 'supabaseProjectUrl',
        title: 'URL do projeto Supabase',
        group: 'Configuração',
        status: HEALTH_STATUS.BLOCKED,
        detail: 'VITE_SUPABASE_URL aponta para api.supabase.com, que é a API administrativa do Supabase.',
        correction: 'Troque por Project Settings > API > Project URL, no formato https://<project-ref>.supabase.co. Não use https://api.supabase.com.',
        technical: { configuredHost: url.hostname },
      };
    }

    return {
      id: 'supabaseProjectUrl',
      title: 'URL do projeto Supabase',
      group: 'Configuração',
      status: HEALTH_STATUS.OK,
      detail: 'URL do projeto Supabase configurada.',
      correction: '',
      technical: { configuredHost: url.hostname },
    };
  } catch {
    return {
      id: 'supabaseProjectUrl',
      title: 'URL do projeto Supabase',
      group: 'Configuração',
      status: HEALTH_STATUS.BLOCKED,
      detail: 'VITE_SUPABASE_URL não é uma URL válida.',
      correction: 'Configure VITE_SUPABASE_URL com a URL do projeto, no formato https://<project-ref>.supabase.co.',
      technical: { configuredValue: raw },
    };
  }
}

function normalizeDbCheck(definition, rawCheck) {
  const ok = Boolean(rawCheck?.ok);
  return {
    id: definition.id,
    title: definition.title,
    group: 'Banco e Storage',
    status: ok ? HEALTH_STATUS.OK : HEALTH_STATUS.BLOCKED,
    detail: rawCheck?.message || (ok ? definition.fallbackOk : definition.fallbackBlocked),
    correction: ok ? rawCheck?.note || '' : rawCheck?.correction || definition.correction,
    technical: rawCheck?.details || null,
  };
}

function normalizeMigration(rawMigration) {
  const definition = CRITICAL_DEPLOY_MIGRATIONS.find(item => item.id === rawMigration?.id) || {
    id: rawMigration?.id || 'migration_desconhecida',
    title: rawMigration?.title || 'Migration crítica',
    file: rawMigration?.file || '',
    correction: 'Confirme a migration no Supabase e reaplique se necessário.',
  };
  const evidenceOk = Boolean(rawMigration?.evidenceOk);
  const recorded = rawMigration?.recorded;
  const status = !evidenceOk
    ? HEALTH_STATUS.BLOCKED
    : recorded === false
      ? HEALTH_STATUS.WARNING
      : HEALTH_STATUS.OK;

  return {
    id: definition.id,
    title: definition.title,
    group: 'Migrations críticas',
    status,
    detail: !evidenceOk
      ? rawMigration?.message || 'Evidência da migration não encontrada no schema atual.'
      : recorded === false
        ? 'Estrutura encontrada, mas o histórico de migrations não registrou este arquivo.'
        : rawMigration?.message || 'Estrutura esperada encontrada.',
    correction: status === HEALTH_STATUS.OK
      ? ''
      : status === HEALTH_STATUS.WARNING
        ? 'Confirme se a migration foi aplicada manualmente e alinhe o histórico do Supabase antes do próximo deploy.'
        : rawMigration?.correction || definition.correction,
    technical: {
      file: definition.file,
      recorded,
      evidence: rawMigration?.evidence || [],
    },
  };
}

export function normalizeDeployHealthPayload(payload) {
  const checks = DB_CHECKS.map(definition => normalizeDbCheck(definition, payload?.checks?.[definition.id]));
  const rawMigrations = asArray(payload?.criticalMigrations);
  const migrations = CRITICAL_DEPLOY_MIGRATIONS.map(definition => (
    normalizeMigration(rawMigrations.find(item => item?.id === definition.id) || { id: definition.id })
  ));
  const items = [...checks, ...migrations];

  return {
    checkedAt: payload?.checkedAt || null,
    migrationsTableAvailable: payload?.migrationsTableAvailable ?? null,
    checks,
    migrations,
    items,
    summary: summarizeDeployHealth(items),
  };
}

async function functionErrorMessage(error, fallback) {
  if (typeof error?.context?.json === 'function') {
    try {
      const body = await error.context.json();
      return body?.error || body?.message || error.message || fallback;
    } catch {
      return error?.message || fallback;
    }
  }
  return error?.message || fallback;
}

function isExpectedProbeMiss(message) {
  return /Fonte visual não encontrada|fonte visual nao encontrada/i.test(String(message || ''));
}

function isMockModelVersion(value) {
  return /^mock\b/i.test(String(value || '').trim());
}

function aiSmokeCorrection(message, functionName) {
  const text = String(message || '');
  if (/Sessão|Acesso restrito|SuperAdm|suspenso/i.test(text)) {
    return 'Entre com uma sessão real de SuperAdm ativo; login local ou perfil comum não executa smoke de IA.';
  }
  if (/Vertex|conta de serviço|IA não configurada|autenticar/i.test(text)) {
    return 'Configure os secrets GCP_SERVICE_ACCOUNT_JSON e GCP_LOCATION nas Edge Functions e confirme permissões do modelo na Vertex AI.';
  }
  if (/Function not found|não encontrada|not found/i.test(text)) {
    return `Faça deploy da Edge Function ${functionName}.`;
  }
  return `Verifique o deploy da Edge Function ${functionName} e os secrets Supabase/Vertex no projeto.`;
}

function sanitizeAiSmokeTechnical(data, functionName) {
  return {
    functionName,
    purpose: data?.purpose || null,
    modelVersion: data?.modelVersion || null,
    vertexLocation: data?.vertex?.location || null,
    realVertexCall: data?.smoke?.realVertexCall === true,
    checkedAt: data?.checkedAt || null,
  };
}

export async function probeAiEdgeFunction(
  definition,
  {
    invoke = (...args) => supabase.functions.invoke(...args),
  } = {},
) {
  const base = {
    id: definition.id,
    title: definition.title,
    group: 'IA real e Vertex',
  };

  try {
    const { data, error } = await invoke(definition.functionName, {
      body: {
        purpose: AI_SMOKE_PURPOSE,
        smoke: true,
      },
    });

    if (error) {
      const message = await functionErrorMessage(error, 'Smoke real da IA indisponível.');
      return {
        ...base,
        status: HEALTH_STATUS.BLOCKED,
        detail: message,
        correction: aiSmokeCorrection(message, definition.functionName),
      };
    }

    const technical = sanitizeAiSmokeTechnical(data, definition.functionName);
    const validRealSmoke = data?.ok === true
      && data?.purpose === AI_SMOKE_PURPOSE
      && data?.functionName === definition.functionName
      && data?.vertex?.configured === true
      && data?.smoke?.realVertexCall === true
      && typeof data?.modelVersion === 'string'
      && !isMockModelVersion(data.modelVersion);

    if (!validRealSmoke) {
      const detail = isMockModelVersion(data?.modelVersion)
        ? 'A função retornou modelVersion mock; conteúdo simulado é bloqueado em sessão real.'
        : 'A função respondeu sem comprovar smoke real na Vertex AI.';
      return {
        ...base,
        status: HEALTH_STATUS.BLOCKED,
        detail,
        correction: `Revise o deploy da Edge Function ${definition.functionName}; o healthcheck só aceita purpose deploy-health com chamada real à Vertex.`,
        technical,
      };
    }

    return {
      ...base,
      status: HEALTH_STATUS.OK,
      detail: 'Edge Function respondeu ao smoke real e validou chamada à Vertex AI sem expor segredo.',
      correction: '',
      technical,
    };
  } catch (error) {
    const message = error.message || 'Não foi possível executar o smoke real da IA.';
    return {
      ...base,
      status: HEALTH_STATUS.BLOCKED,
      detail: message,
      correction: aiSmokeCorrection(message, definition.functionName),
    };
  }
}

export async function probeAiEdgeFunctions({
  invoke = (...args) => supabase.functions.invoke(...args),
} = {}) {
  return Promise.all(AI_SMOKE_FUNCTIONS.map(definition => probeAiEdgeFunction(definition, { invoke })));
}

export async function probeKnowledgeSourceAssetFunction({
  invoke = (...args) => supabase.functions.invoke(...args),
} = {}) {
  try {
    const { data, error } = await invoke(KNOWLEDGE_SOURCE_ASSET_FUNCTION, {
      body: {
        assetKey: EDGE_FUNCTION_PROBE_ASSET_KEY,
        purpose: 'deploy-health',
      },
    });

    if (error) {
      const message = await functionErrorMessage(error, 'Edge Function indisponível.');
      if (isExpectedProbeMiss(message)) {
        return {
          id: 'knowledgeSourceAssetFunction',
          title: 'Edge Function knowledge-source-asset-url',
          group: 'Funções Supabase',
          status: HEALTH_STATUS.OK,
          detail: 'Função respondeu com validação esperada do manifesto.',
          correction: '',
        };
      }

      return {
        id: 'knowledgeSourceAssetFunction',
        title: 'Edge Function knowledge-source-asset-url',
        group: 'Funções Supabase',
        status: HEALTH_STATUS.BLOCKED,
        detail: message,
        correction: /Acesso restrito|Sessão|Perfil/i.test(message)
          ? 'Entre com um SuperAdm ativo e confirme se a função usa o _shared/security.ts atualizado.'
          : 'Faça deploy da Edge Function knowledge-source-asset-url e confirme os secrets SUPABASE_URL e service role.',
      };
    }

    if (data?.error && isExpectedProbeMiss(data.error)) {
      return {
        id: 'knowledgeSourceAssetFunction',
        title: 'Edge Function knowledge-source-asset-url',
        group: 'Funções Supabase',
        status: HEALTH_STATUS.OK,
        detail: 'Função respondeu com validação esperada do manifesto.',
        correction: '',
      };
    }

    return {
      id: 'knowledgeSourceAssetFunction',
      title: 'Edge Function knowledge-source-asset-url',
      group: 'Funções Supabase',
      status: HEALTH_STATUS.OK,
      detail: 'Função respondeu à chamada de saúde.',
      correction: data?.signedUrl
        ? 'Remova deploy-health/probe-missing.json do manifesto se ele foi cadastrado por engano.'
        : '',
    };
  } catch (error) {
    return {
      id: 'knowledgeSourceAssetFunction',
      title: 'Edge Function knowledge-source-asset-url',
      group: 'Funções Supabase',
      status: HEALTH_STATUS.BLOCKED,
      detail: error.message || 'Não foi possível chamar a Edge Function.',
      correction: 'Verifique o deploy da função e as variáveis de ambiente do Supabase.',
    };
  }
}

export async function probePublicAtlasIndex({
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return {
      id: 'publicAtlasIndex',
      title: 'Índice público do Atlas',
      group: 'Storage público',
      status: HEALTH_STATUS.WARNING,
      detail: 'Este ambiente não permite testar fetch do índice público.',
      correction: 'Valide manualmente a URL pública do arquivo atlas-ednea/source-index.json.',
    };
  }

  let url = '';
  try {
    url = publicAtlasAssetUrl(PUBLIC_ATLAS_PROBE_ASSET_KEY);
    const response = await fetchImpl(url, { cache: 'no-store' });
    if (response.ok) {
      return {
        id: 'publicAtlasIndex',
        title: 'Índice público do Atlas',
        group: 'Storage público',
        status: HEALTH_STATUS.OK,
        detail: 'Arquivo atlas-ednea/source-index.json acessível por URL pública.',
        correction: '',
        technical: { url },
      };
    }

    return {
      id: 'publicAtlasIndex',
      title: 'Índice público do Atlas',
      group: 'Storage público',
      status: HEALTH_STATUS.BLOCKED,
      detail: `Storage respondeu HTTP ${response.status} para o índice público.`,
      correction: response.status === 403 || response.status === 401
        ? 'Confirme que o bucket knowledge-atlas-public está público.'
        : 'Envie atlas-ednea/source-index.json para o bucket knowledge-atlas-public.',
      technical: { url },
    };
  } catch (error) {
    return {
      id: 'publicAtlasIndex',
      title: 'Índice público do Atlas',
      group: 'Storage público',
      status: HEALTH_STATUS.BLOCKED,
      detail: error.message || 'Não foi possível acessar o índice público do Atlas.',
      correction: 'Confirme VITE_SUPABASE_URL e o upload do índice público no Storage.',
      technical: url ? { url } : null,
    };
  }
}

function rpcUnavailableCheck(error) {
  const message = error?.message || 'RPC de saúde do deploy indisponível.';
  const failedFetch = /failed to fetch|networkerror|load failed/i.test(message);
  const managementApiHost = /api\.supabase\.com/i.test(message);

  return {
    id: 'adminDeployHealthRpc',
    title: 'RPC admin_deploy_health_check',
    group: 'Banco e Storage',
    status: HEALTH_STATUS.BLOCKED,
    detail: message,
    correction: managementApiHost
      ? 'VITE_SUPABASE_URL deve apontar para https://<project-ref>.supabase.co, não para api.supabase.com.'
      : failedFetch
        ? 'Confirme VITE_SUPABASE_URL, conexão de rede e CORS do projeto Supabase antes de reaplicar os checks.'
        : 'Execute a migration supabase/migrations/20260616_deploy_health_check.sql no Supabase.',
  };
}

async function runDeployHealthRpc(supabaseClient) {
  try {
    return await supabaseClient.rpc('admin_deploy_health_check');
  } catch (error) {
    return { data: null, error };
  }
}

export async function runDeployHealthCheck({
  supabaseClient = supabase,
  fetchImpl = globalThis.fetch,
  supabaseUrl = SUPABASE_URL,
} = {}) {
  const configCheck = getSupabaseUrlConfigCheck(supabaseUrl);
  if (configCheck.status === HEALTH_STATUS.BLOCKED) {
    return buildHealthResult([configCheck]);
  }

  const [rpcResult, atlasProbe, functionProbe, aiSmokeProbes] = await Promise.all([
    runDeployHealthRpc(supabaseClient),
    probePublicAtlasIndex({ fetchImpl }),
    probeKnowledgeSourceAssetFunction({
      invoke: (...args) => supabaseClient.functions.invoke(...args),
    }),
    probeAiEdgeFunctions({
      invoke: (...args) => supabaseClient.functions.invoke(...args),
    }),
  ]);

  const dbHealth = rpcResult.error
    ? {
      checkedAt: null,
      checks: [rpcUnavailableCheck(rpcResult.error)],
      migrations: [],
      items: [rpcUnavailableCheck(rpcResult.error)],
      summary: summarizeDeployHealth([rpcUnavailableCheck(rpcResult.error)]),
    }
    : normalizeDeployHealthPayload(rpcResult.data);

  const items = [
    ...dbHealth.items,
    atlasProbe,
    functionProbe,
    ...aiSmokeProbes,
  ];

  return {
    ...dbHealth,
    items,
    summary: summarizeDeployHealth(items),
  };
}
