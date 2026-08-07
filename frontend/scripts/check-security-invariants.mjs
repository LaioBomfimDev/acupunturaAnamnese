import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const frontendRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const scanRoots = [
  path.join(frontendRoot, 'src'),
  path.join(repositoryRoot, 'supabase', 'functions'),
  path.join(repositoryRoot, 'supabase', 'migrations'),
];

const textExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.jsx', '.json', '.md', '.mjs', '.sql', '.ts', '.tsx',
]);

const historicalMigrationCutoff = '20260723';

const universalRules = [
  {
    id: 'private-key',
    // Exige material PEM entre os delimitadores. Código que apenas remove os
    // cabeçalhos de uma chave recebida por variável de ambiente não é segredo.
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{64,}-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    message: 'chave privada versionada',
  },
  {
    id: 'service-role-frontend',
    applies: file => file.includes(`${path.sep}frontend${path.sep}src${path.sep}`),
    pattern: /SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEYS)|VITE_[A-Z0-9_]*SERVICE_ROLE/i,
    message: 'service role referenciada no código do navegador',
  },
  {
    id: 'local-user-production-path',
    applies: file => file.includes(`${path.sep}frontend${path.sep}src${path.sep}`),
    pattern: /localStorage\.(?:getItem|setItem)\(\s*['"]acup_local_user['"]/,
    message: 'fallback de usuário local alcançável no frontend',
  },
  {
    id: 'vertex-us-default',
    applies: file => file.endsWith(`${path.sep}_shared${path.sep}vertex.ts`),
    pattern: /(?:\|\||\?\?)\s*['"]us-central1['"]/,
    message: 'região Vertex fora do Brasil usada como fallback',
  },
  {
    id: 'cors-wildcard',
    applies: file => file.endsWith(`${path.sep}_shared${path.sep}security.ts`),
    pattern: /['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/,
    message: 'CORS irrestrito nas Edge Functions',
  },
  {
    id: 'secret-console-log',
    pattern: /console\.(?:log|info|warn|error)\([^)]*(?:password|senha|token|secret|service.?role|private.?key)/i,
    message: 'possível segredo enviado ao console',
  },
];

const newMigrationRules = [
  {
    id: 'plaintext-clinical-key-insert',
    pattern: /INSERT\s+INTO\s+(?:public\.)?app_config[\s\S]{0,400}VALUES\s*\(\s*['"](?:clinical_records_encryption_key|clinical_encryption_key)['"]\s*,\s*['"][^'"]{16,}['"]/i,
    message: 'chave clínica em texto puro numa migração nova',
  },
  {
    id: 'plaintext-clinical-key-update',
    pattern: /UPDATE\s+(?:public\.)?app_config\s+SET\s+(?:value|config_value)\s*=\s*['"][^'"]{16,}['"][\s\S]{0,300}(?:clinical_records_encryption_key|clinical_encryption_key)/i,
    message: 'chave clínica em texto puro numa migração nova',
  },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name))) files.push(target);
  }
  return files;
}

function migrationIsNew(file) {
  const match = path.basename(file).match(/^(\d{8})/);
  return Boolean(match && match[1] >= historicalMigrationCutoff);
}

function lineFor(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

const findings = [];
for (const root of scanRoots) {
  for (const file of await walk(root)) {
    const source = await readFile(file, 'utf8');
    const rules = [
      ...universalRules,
      ...(file.includes(`${path.sep}migrations${path.sep}`) && migrationIsNew(file)
        ? newMigrationRules
        : []),
    ];

    for (const rule of rules) {
      if (rule.applies && !rule.applies(file)) continue;
      const match = rule.pattern.exec(source);
      if (!match) continue;
      findings.push({
        file: path.relative(repositoryRoot, file),
        line: lineFor(source, match.index),
        rule: rule.id,
        message: rule.message,
      });
    }
  }
}

if (findings.length) {
  console.error('Falha nas invariantes de segurança:');
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log('Invariantes de segurança verificadas.');
}
