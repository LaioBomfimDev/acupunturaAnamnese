import { useEffect, useRef, useState } from 'react';
import { Panel } from '../ui/Panel';
import { CheckGrid } from '../ui/CheckGrid';
import { usePatient } from '../../hooks/PatientContext';
import { tongueOrganAlterations, resolveTongueAiTag } from '../../data/tongueData';
import {
  analyzeTongueImages,
  confidenceBand,
  TONGUE_AI_DISCLAIMER,
} from '../../services/tongueAiService';
import {
  uploadTonguePhoto,
  getTonguePhotoUrl,
  deleteTonguePhoto,
} from '../../services/tongueMediaService';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';

// Imagem extraída do HTML original e salva em public/
const TONGUE_MAP_SRC = '/tongue-map.jpg';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10;

const FINDING_TYPE_LABELS = {
  color: 'Cor',
  coating: 'Saburra',
  shape: 'Forma',
  moisture: 'Umidade',
  sublingual: 'Sublingual',
};

const UPLOAD_STATUS_LABELS = {
  uploading: { text: 'Enviando ao armazenamento seguro…', level: 'pending' },
  uploaded: { text: 'No armazenamento seguro', level: 'ok' },
  'local-only': { text: 'Apenas neste dispositivo (login local) — não será restaurada ao reabrir', level: 'warn' },
  error: { text: 'Falha no envio — a foto segue apenas neste dispositivo', level: 'warn' },
};

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function countSelectedByPrefix(selectedMap, prefix) {
  return Object.entries(selectedMap || {})
    .filter(([key, value]) => Boolean(value) && key.startsWith(prefix))
    .length;
}

// Slot de upload de foto: clique para escolher, preview, substituir/remover.
function PhotoUpload({ label, hint, photo, onSelect, onRemove, onError }) {
  const inputRef = useRef(null);

  function handleFile(event) {
    const file = event.target.files?.[0];
    // Permite reescolher o mesmo arquivo depois de remover
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      onError(`Formato não suportado (${file.type || 'desconhecido'}). Use JPG, PNG ou WEBP.`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      onError(`Arquivo acima de ${MAX_SIZE_MB} MB. Reduza a imagem antes de enviar.`);
      return;
    }

    onError(null);
    onSelect(file);
  }

  const status = photo ? UPLOAD_STATUS_LABELS[photo.uploadStatus] : null;

  return (
    <div className="tongue-upload-slot">
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      {photo ? (
        <div className="tongue-photo-preview">
          {photo.url ? (
            <img src={photo.url} alt={label} />
          ) : (
            <div className="tongue-photo-loading">Carregando foto salva…</div>
          )}
          <div className="tongue-photo-meta">
            <span className="small">{photo.name}{photo.size != null ? ` · ${formatSize(photo.size)}` : ''}</span>
            <div className="tongue-photo-actions">
              <button type="button" className="btn-mini" onClick={() => inputRef.current?.click()}>
                Substituir
              </button>
              <button type="button" className="btn-mini danger" onClick={onRemove}>
                Remover
              </button>
            </div>
          </div>
          {status && (
            <p className={`small tongue-photo-status ${status.level}`}>{status.text}</p>
          )}
        </div>
      ) : (
        <button type="button" className="upload tongue-upload-btn" onClick={() => inputRef.current?.click()}>
          <b>{label}</b>
          <span className="small tongue-upload-hint">{hint}</span>
        </button>
      )}
    </div>
  );
}

// Card de um achado sugerido pela IA, com aceite parcial por item.
function FindingCard({ finding, onAccept, onIgnore, onUndo, onToggleTag, modelVersion, patientName }) {
  const band = confidenceBand(finding.confidence);
  const pct = Math.round(finding.confidence * 100);
  const isPending = finding.status === 'pending';

  return (
    <div className={`ai-finding-card ${finding.status}`}>
      <div className="ai-finding-head">
        <div>
          <span className="ai-finding-type">{FINDING_TYPE_LABELS[finding.type] || finding.type}</span>
          <h4>{finding.title}</h4>
          <p className="ai-finding-pattern">{finding.pattern}</p>
        </div>
        <div className={`ai-confidence ${band.level}`} title={`Confiança estimada: ${pct}%`}>
          <span className="ai-confidence-label">confiança {band.label}</span>
          <div className="ai-confidence-bar">
            <div className="ai-confidence-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="small">{pct}%</span>
        </div>
      </div>

      <p className="small ai-finding-explanation">{finding.explanation}</p>

      <div className="ai-finding-checklist">
        <span className="small"><b>Itens de checklist sugeridos:</b></span>
        {finding.suggestedTags.map(tag => {
          const resolved = resolveTongueAiTag(tag);
          if (!resolved) {
            return (
              <span key={tag} className="small ai-tag-unmapped">
                ⚠ sugestão não mapeada ({tag}) — ignorada
              </span>
            );
          }
          const checked = finding.checkedTags.includes(tag);
          return (
            <label key={tag} className={`ai-tag-option${isPending ? '' : ' locked'}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!isPending}
                onChange={() => onToggleTag(finding.id, tag)}
              />
              <span>{resolved.organ}: <b>{resolved.item}</b></span>
            </label>
          );
        })}
      </div>

      <div className="ai-finding-actions">
        {isPending ? (
          <>
            <button
              type="button"
              className="btn-mini accept"
              disabled={finding.checkedTags.length === 0}
              onClick={() => onAccept(finding.id)}
            >
              ✓ Aceitar selecionados
            </button>
            <button type="button" className="btn-mini" onClick={() => onIgnore(finding.id)}>
              Ignorar
            </button>
          </>
        ) : (
          <>
            <span className={`ai-status-badge ${finding.status}`}>
              {finding.status === 'accepted'
                ? `Aceito pela profissional (${finding.acceptedTags.length} ${finding.acceptedTags.length === 1 ? 'item' : 'itens'})`
                : 'Ignorado'}
            </span>
            <button type="button" className="btn-mini" onClick={() => onUndo(finding.id)}>
              Desfazer
            </button>
          </>
        )}
        <AiCorrectionButton
          surface={AI_SURFACES.TONGUE}
          aiOutput={{
            title: finding.title,
            pattern: finding.pattern,
            type: finding.type,
            suggestedTags: finding.suggestedTags,
            confidence: finding.confidence,
            explanation: finding.explanation,
          }}
          contextSnapshot={{ findingType: finding.type, suggestedTags: finding.suggestedTags }}
          modelVersion={modelVersion}
          patientName={patientName}
        />
      </div>
    </div>
  );
}

export function Lingua({ selectedMap, onToggle, onSetSelection, tongueAi, onTongueAiChange }) {
  const { selectedPatient } = usePatient();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  // Sequência por slot para descartar uploads que terminam depois de a foto
  // ter sido trocada/removida (evita estado órfão e arquivo perdido no bucket)
  const uploadSeqRef = useRef({ top: 0, sublingual: 0 });
  const fetchingUrlsRef = useRef(new Set());

  const { photos, analysis } = tongueAi;

  // Atualiza metadados de uma foto sem invalidar a análise (conclusão de
  // upload e resolução de URL assinada não são "troca de foto")
  function updatePhotoMeta(slot, updater) {
    onTongueAiChange(prev => {
      const current = prev.photos[slot];
      if (!current) return prev;
      return { ...prev, photos: { ...prev.photos, [slot]: updater(current) } };
    });
  }

  // Fotos hidratadas da sessão salva têm `path` mas não `url`:
  // gera a URL assinada de exibição sob demanda.
  useEffect(() => {
    for (const slot of ['top', 'sublingual']) {
      const photo = photos[slot];
      if (!photo?.path || photo.url || fetchingUrlsRef.current.has(photo.path)) continue;
      const path = photo.path;
      fetchingUrlsRef.current.add(path);
      getTonguePhotoUrl(path).then(url => {
        fetchingUrlsRef.current.delete(path);
        if (!url) return;
        onTongueAiChange(prev => {
          const current = prev.photos[slot];
          if (!current || current.path !== path || current.url) return prev;
          return { ...prev, photos: { ...prev.photos, [slot]: { ...current, url } } };
        });
      });
    }
  }, [photos, onTongueAiChange]);

  // Trocar foto: preview imediato, análise invalidada, upload em segundo plano
  async function handlePhotoSelect(slot, file) {
    setError(null);
    const seq = ++uploadSeqRef.current[slot];
    const previewUrl = URL.createObjectURL(file);

    onTongueAiChange(prev => {
      const previous = prev.photos[slot];
      if (previous?.url?.startsWith('blob:')) URL.revokeObjectURL(previous.url);
      if (previous?.path) deleteTonguePhoto(previous.path);
      return {
        ...prev,
        photos: {
          ...prev.photos,
          [slot]: {
            url: previewUrl,
            name: file.name,
            size: file.size,
            type: file.type,
            path: null,
            uploadStatus: 'uploading',
          },
        },
        analysis: null,
      };
    });

    try {
      const { path, blob, localOnly } = await uploadTonguePhoto({
        patientId: selectedPatient?.id,
        slot,
        file,
      });
      if (uploadSeqRef.current[slot] !== seq) {
        // Foto trocada/removida durante o envio — descarta o resultado
        if (path) deleteTonguePhoto(path);
        return;
      }
      const compressedUrl = URL.createObjectURL(blob);
      URL.revokeObjectURL(previewUrl);
      updatePhotoMeta(slot, p => ({
        ...p,
        url: compressedUrl,
        size: blob.size,
        type: 'image/webp',
        path,
        uploadedAt: new Date().toISOString(),
        uploadStatus: localOnly ? 'local-only' : 'uploaded',
      }));
    } catch (err) {
      if (uploadSeqRef.current[slot] !== seq) return;
      updatePhotoMeta(slot, p => ({ ...p, uploadStatus: 'error' }));
      setError(err.message || 'Falha ao enviar a foto.');
    }
  }

  // Remover foto: invalida análise e apaga o arquivo do Storage (best-effort)
  function handlePhotoRemove(slot) {
    uploadSeqRef.current[slot] += 1;
    onTongueAiChange(prev => {
      const previous = prev.photos[slot];
      if (previous?.url?.startsWith('blob:')) URL.revokeObjectURL(previous.url);
      if (previous?.path) deleteTonguePhoto(previous.path);
      return { ...prev, photos: { ...prev.photos, [slot]: null }, analysis: null };
    });
  }

  async function handleAnalyze() {
    setError(null);
    setAnalyzing(true);
    try {
      const result = await analyzeTongueImages(photos, { patientId: selectedPatient?.id });
      onTongueAiChange(prev => ({
        ...prev,
        analysis: {
          ...result,
          findings: result.findings.map(f => ({
            ...f,
            status: 'pending',
            // Pré-seleciona apenas tags que existem no mapeamento
            checkedTags: f.suggestedTags.filter(tag => resolveTongueAiTag(tag)),
            acceptedTags: [],
          })),
        },
      }));
    } catch (err) {
      setError(err.message || 'Falha ao analisar as imagens.');
    } finally {
      setAnalyzing(false);
    }
  }

  function updateFinding(findingId, updater) {
    onTongueAiChange(prev => {
      if (!prev.analysis) return prev;
      return {
        ...prev,
        analysis: {
          ...prev.analysis,
          findings: prev.analysis.findings.map(f => (f.id === findingId ? updater(f) : f)),
        },
      };
    });
  }

  function handleToggleTag(findingId, tag) {
    updateFinding(findingId, f => ({
      ...f,
      checkedTags: f.checkedTags.includes(tag)
        ? f.checkedTags.filter(t => t !== tag)
        : [...f.checkedTags, tag],
    }));
  }

  function handleAccept(findingId) {
    const finding = analysis?.findings.find(f => f.id === findingId);
    if (!finding) return;
    // Marca (nunca desmarca) os itens confirmados no checklist oficial
    finding.checkedTags.forEach(tag => {
      const resolved = resolveTongueAiTag(tag);
      if (resolved) onSetSelection(resolved.group, resolved.item, true);
    });
    updateFinding(findingId, f => ({ ...f, status: 'accepted', acceptedTags: [...f.checkedTags] }));
  }

  function handleIgnore(findingId) {
    updateFinding(findingId, f => ({ ...f, status: 'ignored' }));
  }

  // Desfazer volta o card para pendente; itens já marcados no checklist
  // permanecem — desmarcar é decisão explícita da profissional no checklist.
  function handleUndo(findingId) {
    updateFinding(findingId, f => ({ ...f, status: 'pending', acceptedTags: [] }));
  }

  const pendingCount = analysis?.findings.filter(f => f.status === 'pending').length ?? 0;
  const acceptedCount = analysis?.findings.filter(f => f.status === 'accepted').length ?? 0;
  const ignoredCount = analysis?.findings.filter(f => f.status === 'ignored').length ?? 0;
  const photoCount = Number(Boolean(photos.top)) + Number(Boolean(photos.sublingual));
  const confirmedTongueCount = Object.keys(tongueOrganAlterations)
    .reduce((total, organ) => total + countSelectedByPrefix(selectedMap, `linguaOrgao:${organ}:`), 0);
  const analysisSummary = analysis
    ? formatCount(analysis.findings.length, 'sugestão', 'sugestões')
    : analyzing
      ? 'analisando imagens'
      : 'aguardando análise';

  return (
    <Panel title="Inspeção da língua">
      <section className="tongue-workflow-panel">
        <div className="tongue-workflow-copy">
          <p className="small">Fluxo seguro</p>
          <h3>Fotos, IA assistiva e checklist confirmado</h3>
          <span>
            As fotos são tratadas em armazenamento privado. A IA sugere achados para conferência;
            somente o checklist marcado pela profissional entra no raciocínio clínico.
          </span>
        </div>
        <div className="tongue-workflow-steps" aria-label="Resumo da inspeção da língua">
          <div className={`tongue-step-card ${photoCount > 0 ? 'ready' : ''}`}>
            <span>1</span>
            <b>Fotos</b>
            <small>{photoCount}/2 anexada{photoCount === 1 ? '' : 's'}</small>
          </div>
          <div className={`tongue-step-card ${analysis ? 'ready' : ''}`}>
            <span>2</span>
            <b>IA assistiva</b>
            <small>{analysisSummary}</small>
          </div>
          <div className={`tongue-step-card ${confirmedTongueCount > 0 ? 'ready' : ''}`}>
            <span>3</span>
            <b>Checklist</b>
            <small>{formatCount(confirmedTongueCount, 'confirmado', 'confirmados')}</small>
          </div>
        </div>
      </section>

      <div className="tongue-duo">
        <div className="tongue-card">
          <div className="tongue-card-head">
            <div>
              <span className="small">Referência visual</span>
              <h3>Mapa fixo da língua</h3>
            </div>
            <span className="tongue-card-badge">MTC</span>
          </div>
          <img className="tongue-map-fixed" src={TONGUE_MAP_SRC} alt="Mapa da língua por órgãos na MTC" />
          <p className="small">Referência visual para comparar com a foto clínica.</p>
        </div>

        <div className="tongue-card">
          <div className="tongue-card-head">
            <div>
              <span className="small">Paciente</span>
              <h3>Fotos do paciente</h3>
            </div>
            <span className="tongue-card-badge">{photoCount}/2 fotos</span>
          </div>

          <PhotoUpload
            label="Adicionar foto superior da língua"
            hint="JPG, PNG ou WEBP · até 10 MB"
            photo={photos.top}
            onSelect={file => handlePhotoSelect('top', file)}
            onRemove={() => handlePhotoRemove('top')}
            onError={setError}
          />

          <PhotoUpload
            label="Adicionar foto sublingual (opcional)"
            hint="Face inferior da língua, para avaliação de estase"
            photo={photos.sublingual}
            onSelect={file => handlePhotoSelect('sublingual', file)}
            onRemove={() => handlePhotoRemove('sublingual')}
            onError={setError}
          />

          {error && <div className="alert tongue-inline-alert">{error}</div>}

          <button
            type="button"
            className="ai-analyze-btn"
            disabled={!photos.top || analyzing || photos.top.uploadStatus === 'uploading' || photos.sublingual?.uploadStatus === 'uploading'}
            onClick={handleAnalyze}
          >
            {analyzing ? 'Analisando imagens…' : analysis ? 'Analisar novamente' : 'Analisar com IA'}
          </button>
          {!photos.top && (
            <p className="small tongue-card-note">
              Envie ao menos a foto superior para habilitar a análise.
            </p>
          )}
          {(photos.top?.uploadStatus === 'uploading' || photos.sublingual?.uploadStatus === 'uploading') && (
            <p className="small tongue-card-note">
              Aguardando o envio ao armazenamento seguro…
            </p>
          )}
        </div>
      </div>

      {analysis && (
        <div className="ai-findings-section">
          <div className="ai-findings-headline">
            <div>
              <h3>
                Sugestões da IA para conferência
                {pendingCount > 0 && <span className="ai-pending-pill">{pendingCount} pendente{pendingCount === 1 ? '' : 's'}</span>}
              </h3>
              <p className="small">
                {TONGUE_AI_DISCLAIMER} Modelo: {analysis.modelVersion}
                {analysis.modelVersion?.startsWith('mock') ? ' (simulado)' : ''}.
              </p>
            </div>
            <div className="ai-findings-stats" aria-label="Status dos achados sugeridos">
              <span><b>{pendingCount}</b> pendente{pendingCount === 1 ? '' : 's'}</span>
              <span><b>{acceptedCount}</b> aceito{acceptedCount === 1 ? '' : 's'}</span>
              <span><b>{ignoredCount}</b> ignorado{ignoredCount === 1 ? '' : 's'}</span>
            </div>
          </div>
          {analysis.warning && (
            <div className="alert tongue-inline-alert">
              <b>Aviso da análise:</b> {analysis.warning}
            </div>
          )}
          {analysis.findings.length === 0 && (
            <p className="small tongue-card-note">
              Nenhum achado relatado pela IA para estas fotos.
            </p>
          )}

          <div className="ai-findings-grid">
            {analysis.findings.map(finding => (
              <FindingCard
                key={finding.id}
                finding={finding}
                onAccept={handleAccept}
                onIgnore={handleIgnore}
                onUndo={handleUndo}
                onToggleTag={handleToggleTag}
                modelVersion={analysis.modelVersion}
                patientName={selectedPatient?.name}
              />
            ))}
          </div>
        </div>
      )}

      <div className="tongue-checklist-head">
        <div>
          <h3>Checklist único por órgão / região do mapa</h3>
          <p className="small">
            Achados confirmados pela profissional. Somente o que está marcado aqui entra no diagnóstico.
          </p>
        </div>
        <span className="tongue-summary-pill">
          {formatCount(confirmedTongueCount, 'achado confirmado', 'achados confirmados')}
        </span>
      </div>
      <div className="organ-grid">
        {Object.entries(tongueOrganAlterations).map(([organ, data]) => {
          const selectedCount = countSelectedByPrefix(selectedMap, `linguaOrgao:${organ}:`);
          return (
            <div key={organ} className={`organ-box ${selectedCount > 0 ? 'has-selection' : ''}`}>
              <div className="organ-box-head">
                <div>
                  <h4>{organ}</h4>
                  <p className="organ-note">{data.subtitle}</p>
                </div>
                {selectedCount > 0 && (
                  <span className="organ-count">{formatCount(selectedCount, 'marcado', 'marcados')}</span>
                )}
              </div>
              <CheckGrid
                group={`linguaOrgao:${organ}`}
                items={data.items}
                cols={2}
                selectedMap={selectedMap}
                onToggle={onToggle}
              />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
