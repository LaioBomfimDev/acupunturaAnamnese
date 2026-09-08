import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './styles/tokens.css';
import './styles/surveyPage.css';

// ============================================================
// Pesquisa de satisfação — página pública
//
// Montada diretamente por main.jsx quando a URL é /pesquisa-satisfacao,
// FORA de AuthProvider/PatientProvider — quem abre este link não tem
// conta nenhuma no sistema. Toda a validação (token existe, não
// expirou, ainda não foi respondido) acontece no servidor
// (Edge Function satisfaction-survey); esta tela só reflete o que ela
// devolve, sem guardar segredo nenhum aqui.
// ============================================================

const RATING_OPTIONS = [1, 2, 3, 4, 5];

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || '';
}

async function callSurveyFunction(body) {
  const { data, error } = await supabase.functions.invoke('satisfaction-survey', { body });
  if (error) throw new Error('Não foi possível concluir. Tente novamente em instantes.');
  if (data?.error) throw new Error(data.error);
  return data;
}

export function SurveyPage() {
  const [token] = useState(getTokenFromUrl);
  // loading | ready | invalid | sent
  const [status, setStatus] = useState(() => (getTokenFromUrl() ? 'loading' : 'invalid'));
  const [clinicName, setClinicName] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const data = await callSurveyFunction({ token });
        if (cancelled) return;
        setClinicName(data.clinicName || '');
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('invalid');
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!rating) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      await callSurveyFunction({ token, rating, comment: comment.trim() || undefined });
      setStatus('sent');
    } catch (err) {
      setErrorMessage(err.message || 'Não foi possível enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sv-page">
      <div className="sv-card">
        {status === 'loading' && <p className="sv-note">Carregando…</p>}

        {status === 'invalid' && (
          <>
            <h1>Link indisponível</h1>
            <p className="sv-note">
              Este link é inválido, expirou ou já foi respondido. Se você
              recebeu um link novo, confira se copiou o endereço completo.
            </p>
          </>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit}>
            <h1>Como foi seu atendimento?</h1>
            {clinicName && <p className="sv-note">{clinicName}</p>}

            <div className="sv-rating" role="radiogroup" aria-label="Nota de 1 a 5">
              {RATING_OPTIONS.map(option => (
                <button
                  key={option}
                  type="button"
                  className="sv-rating-btn"
                  aria-pressed={rating === option}
                  onClick={() => setRating(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            <label className="sv-field">
              Comentário (opcional)
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="Conte como foi, se quiser."
              />
            </label>

            {errorMessage && <div className="sv-error" role="alert">{errorMessage}</div>}

            <button type="submit" className="sv-submit" disabled={!rating || submitting}>
              {submitting ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        )}

        {status === 'sent' && (
          <>
            <h1>Obrigado!</h1>
            <p className="sv-note">Sua resposta foi registrada.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default SurveyPage;
