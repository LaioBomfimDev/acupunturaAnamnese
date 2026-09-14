import { useCallback, useEffect, useState } from 'react';
import { addCustomQuickWord, listCustomQuickWords } from '../services/customQuickWordsService';

// Carrega 1x por disciplina (não por campo) e agrupa por field_id.
// mergeWords junta o estático (vindo de data/*Anamnese.js) com o
// customizado, sem duplicar; addWord grava otimista e persiste.
export function useCustomQuickWords(discipline) {
  const [byField, setByField] = useState({});

  useEffect(() => {
    if (!discipline) return undefined;
    let cancelled = false;
    listCustomQuickWords(discipline)
      .then(rows => {
        if (cancelled) return;
        const grouped = {};
        for (const row of rows) {
          (grouped[row.field_id] ||= []).push(row.word);
        }
        setByField(grouped);
      })
      .catch(err => {
        if (!cancelled) console.error('Erro ao carregar atalhos de texto:', err);
      });
    return () => { cancelled = true; };
  }, [discipline]);

  const mergeWords = useCallback((fieldId, staticWords = []) => {
    const custom = byField[fieldId] || [];
    return [...staticWords, ...custom.filter(word => !staticWords.includes(word))];
  }, [byField]);

  // Só entra na lista (e portanto só vira chip visível) depois que o
  // Supabase confirma a gravação — antes disso o texto parecia salvo
  // (atualização otimista) mas sumia no primeiro recarregamento sempre
  // que o insert falhava (ex.: sessão sem clínica), sem nenhum aviso,
  // porque o erro só ia pro console. Retorna a promise pro chamador
  // (QuickWordChips) poder mostrar o erro na hora.
  const addWord = useCallback((fieldId, word) => {
    const trimmed = String(word || '').trim();
    if (!trimmed) return Promise.resolve();
    if ((byField[fieldId] || []).includes(trimmed)) return Promise.resolve();

    return addCustomQuickWord(discipline, fieldId, trimmed)
      .then(() => {
        setByField(prev => {
          const list = prev[fieldId] || [];
          return list.includes(trimmed) ? prev : { ...prev, [fieldId]: [...list, trimmed] };
        });
      })
      .catch(err => {
        console.error('Erro ao salvar atalho de texto:', err);
        throw err;
      });
  }, [discipline, byField]);

  return { mergeWords, addWord };
}
