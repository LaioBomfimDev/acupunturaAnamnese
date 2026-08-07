// Fronteira compartilhada para payloads clínicos enviados a provedores de IA.
//
// O cliente também anonimiza, mas a Edge Function nunca confia nessa etapa:
// valida uma allowlist estrutural e remove PII estruturada novamente antes de
// qualquer recuperação de contexto, montagem de prompt ou chamada externa.

export type ClinicalPayloadValidationCode =
  | 'invalid_json'
  | 'payload_too_large'
  | 'invalid_type'
  | 'missing_field'
  | 'unexpected_field'
  | 'invalid_value'
  | 'value_too_large';

export class ClinicalPayloadValidationError extends Error {
  code: ClinicalPayloadValidationCode;

  constructor(code: ClinicalPayloadValidationCode) {
    super('Payload clínico inválido.');
    this.name = 'ClinicalPayloadValidationError';
    this.code = code;
  }
}

type BaseSchema = {
  required?: boolean;
  nullable?: boolean;
};

export type ClinicalPayloadSchema =
  | (BaseSchema & {
    type: 'string';
    maxLength: number;
    enum?: readonly string[];
    redact?: boolean;
    trim?: boolean;
  })
  | (BaseSchema & {
    type: 'number';
    min?: number;
    max?: number;
    integer?: boolean;
  })
  | (BaseSchema & {
    type: 'stringOrNumber';
    maxLength: number;
    min?: number;
    max?: number;
  })
  | (BaseSchema & {
    type: 'boolean';
  })
  | (BaseSchema & {
    type: 'array';
    maxItems: number;
    items: ClinicalPayloadSchema;
  })
  | (BaseSchema & {
    type: 'object';
    properties: Readonly<Record<string, ClinicalPayloadSchema>>;
  });

const PII_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:telefone|celular|whats(?:app)?)\s*[:=-]?\s*(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/gi, '[TELEFONE]'],
  // CNPJ antes de CPF/telefone para preservar o marcador mais específico.
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]'],
  // Telefone BR com DDD: (11) 91234-5678, 11912345678, +55 11 91234 5678.
  [/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g, '[TELEFONE]'],
  [/\b\d{5}-?\d{3}\b/g, '[CEP]'],
  [/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, '[DATA]'],
  [/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g, '[DATA]'],
  [/\bRG\s*(?:n[ºo.]?\s*)?[:#-]?\s*[A-Z0-9.-]{5,20}\b/gi, '[RG]'],
  [/\b(?:CNS|Cart[aã]o Nacional de Sa[uú]de)\s*[:#-]?\s*\d{15}\b/gi, '[CNS]'],
  [/\b(?:endere[cç]o|logradouro)\s*[:=-]\s*[^\n;]{3,160}/gi, '[ENDEREÇO]'],
];

const PERSON_TOKEN = String.raw`[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][a-záàâãéêíóôõúüç]{1,}`;
const FULL_NAME = String.raw`${PERSON_TOKEN}(?:\s+(?:(?:d[aeo]s?|e)\s+)?${PERSON_TOKEN}){0,4}`;
const LABELED_NAME_PATTERN = new RegExp(
  String.raw`\b(?:nome(?:\s+do\s+paciente)?|paciente|respons[aá]vel|informante|solicitante)\s*[:=-]\s*${FULL_NAME}`,
  'g',
);
const PATIENT_NARRATIVE_PATTERN = new RegExp(
  String.raw`\bPaciente\s+${FULL_NAME}(?=\s+(?:relata|refere|apresenta|informa|comparece|descreve)\b)`,
  'g',
);
const LEADING_NAME_PATTERN = new RegExp(
  String.raw`(^|\n)${PERSON_TOKEN}(?:\s+(?:(?:d[aeo]s?|e)\s+)?${PERSON_TOKEN}){1,4}(?=\s+(?:relata|refere|apresenta|informa|comparece|descreve)\b)`,
  'g',
);
const DOCUMENT_CONTEXT_NAME_PATTERN = new RegExp(
  String.raw`\b(?:avalia[cç][aã]o|atendimento|relat[oó]rio)\s+(?:de|do|da)\s+${FULL_NAME}(?=\s*[,;.\n])`,
  'g',
);

export function scrubClinicalText(value: string) {
  let sanitized = String(value || '');
  for (const [pattern, marker] of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, marker);
  }

  // Sem o nome do paciente no contrato, o servidor não consegue fazer NER
  // perfeito. Estes contextos conservadores cobrem identificadores nominais
  // explícitos sem mascarar termos clínicos soltos.
  sanitized = sanitized
    .replace(LABELED_NAME_PATTERN, '[NOME]')
    .replace(PATIENT_NARRATIVE_PATTERN, 'Paciente [NOME]')
    .replace(LEADING_NAME_PATTERN, '$1[NOME]')
    .replace(DOCUMENT_CONTEXT_NAME_PATTERN, '[NOME]');

  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalid(code: ClinicalPayloadValidationCode): never {
  throw new ClinicalPayloadValidationError(code);
}

export function sanitizeClinicalPayload(
  value: unknown,
  schema: ClinicalPayloadSchema,
): unknown {
  if (value === null) {
    if (schema.nullable) return null;
    return invalid('invalid_type');
  }

  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') return invalid('invalid_type');
      const normalized = schema.trim ? value.trim() : value;
      if (normalized.length > schema.maxLength) return invalid('value_too_large');
      if (schema.enum && !schema.enum.includes(normalized)) {
        return invalid('invalid_value');
      }
      if (schema.redact) {
        return normalized ? '[IDENTIFICADOR REMOVIDO]' : '';
      }
      return scrubClinicalText(normalized);
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return invalid('invalid_type');
      }
      if (schema.integer && !Number.isInteger(value)) return invalid('invalid_value');
      if (schema.min !== undefined && value < schema.min) return invalid('invalid_value');
      if (schema.max !== undefined && value > schema.max) return invalid('invalid_value');
      return value;
    }
    case 'stringOrNumber': {
      if (typeof value === 'string') {
        if (value.length > schema.maxLength) return invalid('value_too_large');
        return scrubClinicalText(value);
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return invalid('invalid_type');
      }
      if (schema.min !== undefined && value < schema.min) return invalid('invalid_value');
      if (schema.max !== undefined && value > schema.max) return invalid('invalid_value');
      return value;
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : invalid('invalid_type');
    case 'array': {
      if (!Array.isArray(value)) return invalid('invalid_type');
      if (value.length > schema.maxItems) return invalid('value_too_large');
      return value.map(item => sanitizeClinicalPayload(item, schema.items));
    }
    case 'object': {
      if (!isRecord(value)) return invalid('invalid_type');
      const allowedKeys = new Set(Object.keys(schema.properties));
      if (Object.keys(value).some(key => !allowedKeys.has(key))) {
        return invalid('unexpected_field');
      }

      const output: Record<string, unknown> = {};
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          if (childSchema.required) return invalid('missing_field');
          continue;
        }
        output[key] = sanitizeClinicalPayload(value[key], childSchema);
      }
      return output;
    }
  }
}

export async function readClinicalJsonBody(
  req: Request,
  maxBytes = 32_768,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return invalid('payload_too_large');
  }
  if (!req.body) return invalid('invalid_json');

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let raw = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return invalid('payload_too_large');
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid('invalid_json');
  }
  return isRecord(parsed) ? parsed : invalid('invalid_type');
}
