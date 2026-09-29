import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { clinicAccentStyle, describeAppointmentWhen } from './utils/appointmentConfirmation';
import {
  COMMENT_MAX_LENGTH,
  SURVEY_RATINGS,
  commentPlaceholder,
  ratingLabel,
  surveyTitle,
} from './utils/satisfactionSurvey';
import {
  IconBuilding,
  IconCheckBold,
  IconLinkOff,
  IconSend,
  PublicLoading,
  PublicStateMessage,
  PublicWhenBlock,
} from './components/public/PublicPageParts';
import './styles/tokens.css';
import './styles/confirmPage.css';
import './styles/surveyPage.css';

// ============================================================
// Pesquisa de satisfação — página pública
//
// Montada diretamente por main.jsx quando a URL é /pesquisa-satisfacao,
// FORA de AuthProvider/PatientProvider — quem abre este link não tem
// conta nenhuma no sistema. Toda a validação (token existe, não
// expirou, ainda não foi respondido) acontece no servidor
// (Edge Function satisfaction-survey); esta tela só reflete o que ela
// devolve, sem guardar segredo nenhum aqui. Visual e peças são os da
// confirmação de agendamento (confirmPage.css + PublicPageParts).
// ============================================================

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

function StarGlyph({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true">
      <path
        d="M12 2.8l2.83 5.73 6.32.92-4.58 4.46 1.08 6.3L12 17.24l-5.65 2.97 1.08-6.3-4.58-4.46 6.32-.92z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SurveyPage() {
  const [token] = useState(getTokenFromUrl);
  // loading | ready | invalid | sent
  const [status, setStatus] = useState(() => (getTokenFromUrl() ? 'loading' : 'invalid'));
  const [survey, setSurvey] = useState(null);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
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
        setSurvey(data || {});
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

  const clinicName = survey?.clinicName || '';
  const when = survey?.startsAt ? describeAppointmentWhen(survey.startsAt, survey.endsAt, new Date()) : null;
  const shownRating = hovered || rating;

  return (
    <div className="cf-page" style={clinicAccentStyle(survey?.clinicColor) || undefined}>
      <main className="cf-card" aria-busy={status === 'loading'}>
        {status === 'loading' && <PublicLoading />}

        {status === 'invalid' && (
          <PublicStateMessage icon={<IconLinkOff />} title="Link indisponível">
            Este link é inválido, expirou ou já foi respondido. Se você
            recebeu um link novo, confira se copiou o endereço completo.
          </PublicStateMessage>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit}>
            <header className="cf-head">
              {clinicName && (
                <p className="cf-clinic">
                  <IconBuilding size={14} />
                  {clinicName}
                </p>
              )}
              <h1>{surveyTitle(survey?.professionalName)}</h1>
              <p className="cf-note">Leva menos de um minuto.</p>
            </header>

            <PublicWhenBlock when={when} showTime={false} />

            <fieldset className="sv-stars" onMouseLeave={() => setHovered(0)}>
              <legend className="sv-legend">Sua nota</legend>
              <div className="sv-stars-row">
                {SURVEY_RATINGS.map(option => (
                  <label
                    key={option}
                    className={`sv-star${option <= shownRating ? ' sv-star--on' : ''}`}
                    onMouseEnter={() => setHovered(option)}
                  >
                    <input
                      type="radio"
                      name="rating"
                      value={option}
                      checked={rating === option}
                      onChange={() => setRating(option)}
                      aria-label={`${option} de 5: ${ratingLabel(option)}`}
                    />
                    <span className="sv-star-glyph"><StarGlyph filled={option <= shownRating} /></span>
                  </label>
                ))}
              </div>
              <p className={`sv-rating-label${shownRating ? ' sv-rating-label--set' : ''}`} aria-live="polite">
                {ratingLabel(shownRating)}
              </p>
            </fieldset>

            <label className="sv-field">
              <span className="sv-field-head">
                Quer contar mais?
                <span className="sv-optional">opcional</span>
              </span>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                maxLength={COMMENT_MAX_LENGTH}
                rows={4}
                placeholder={commentPlaceholder(rating)}
              />
              <span className="sv-counter" aria-hidden="true">{comment.length}/{COMMENT_MAX_LENGTH}</span>
            </label>

            {errorMessage && <div className="cf-error" role="alert">{errorMessage}</div>}

            <button type="submit" className="cf-submit" disabled={!rating || submitting} aria-busy={submitting}>
              {submitting ? (
                <><span className="cf-spinner cf-spinner--on-accent" aria-hidden="true" />Enviando…</>
              ) : (
                <><IconSend />Enviar avaliação</>
              )}
            </button>
          </form>
        )}

        {status === 'sent' && (
          <>
            <PublicStateMessage tone="success" icon={<IconCheckBold size={26} />} title="Obrigado!">
              Sua avaliação foi registrada. Você já pode fechar esta página.
            </PublicStateMessage>
            <p className="sv-given" aria-label={`Sua nota: ${rating} de 5, ${ratingLabel(rating)}`}>
              <span className="sv-given-stars" aria-hidden="true">
                {SURVEY_RATINGS.map(option => (
                  <span key={option} className={option <= rating ? 'sv-star--on' : ''}>
                    <StarGlyph filled={option <= rating} />
                  </span>
                ))}
              </span>
              <span aria-hidden="true">{ratingLabel(rating)}</span>
            </p>
          </>
        )}
      </main>

      {status === 'ready' && (
        <p className="cf-foot">Sua resposta vai direto para a equipe da clínica.</p>
      )}
    </div>
  );
}

export default SurveyPage;
