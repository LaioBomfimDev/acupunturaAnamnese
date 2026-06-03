import { normalizePointCode } from '../knowledge/aliases';

const LOCAL_KNOWLEDGE_REVIEWS_KEY = 'acup_living_library_reviews_v1';
export const HIGH_CONFIDENCE_KNOWLEDGE_REVIEWS_URL = '/knowledge/source-assets/atlas-ednea/high-confidence-reviews.json';
export const DEEP_CURATED_KNOWLEDGE_REVIEWS_URL = '/knowledge/source-assets/atlas-ednea/deep-curated-reviews.json';

function generateId() {
  return `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function reviewKey(review) {
  return normalizePointCode(review?.code || review?.displayCode || review?.sourceDraftId || review?.id);
}

export function mergeKnowledgeReviews(...reviewGroups) {
  const merged = new Map();

  reviewGroups.flat().filter(Boolean).forEach(review => {
    const key = reviewKey(review);
    if (!key) return;
    merged.set(key, review);
  });

  return [...merged.values()];
}

export async function getHighConfidenceKnowledgeReviews() {
  return getKnowledgeReviewsFromUrl(HIGH_CONFIDENCE_KNOWLEDGE_REVIEWS_URL);
}

export async function getDeepCuratedKnowledgeReviews() {
  return getKnowledgeReviewsFromUrl(DEEP_CURATED_KNOWLEDGE_REVIEWS_URL);
}

export function mergeClinicalKnowledgeReviews({
  deepCuratedReviews = [],
  highConfidenceReviews = [],
  localReviews = getLocalKnowledgeReviews(),
} = {}) {
  return mergeKnowledgeReviews(deepCuratedReviews, highConfidenceReviews, localReviews);
}

export async function getClinicalKnowledgeReviews() {
  const [deepCuratedReviews, highConfidenceReviews] = await Promise.all([
    getDeepCuratedKnowledgeReviews(),
    getHighConfidenceKnowledgeReviews(),
  ]);

  return mergeClinicalKnowledgeReviews({
    deepCuratedReviews,
    highConfidenceReviews,
    localReviews: getLocalKnowledgeReviews(),
  });
}

async function getKnowledgeReviewsFromUrl(url) {
  if (typeof fetch === 'undefined') return [];

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.reviews) ? data.reviews : [];
  } catch {
    return [];
  }
}

export function getLocalKnowledgeReviews() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const data = JSON.parse(localStorage.getItem(LOCAL_KNOWLEDGE_REVIEWS_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveLocalKnowledgeReview(payload) {
  const reviews = getLocalKnowledgeReviews();
  const review = {
    id: payload.id || generateId(),
    status: payload.status || 'review',
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...payload,
  };

  const next = [
    review,
    ...reviews.filter(item => item.id !== review.id && item.code !== review.code),
  ];

  localStorage.setItem(LOCAL_KNOWLEDGE_REVIEWS_KEY, JSON.stringify(next));
  return review;
}

export function removeLocalKnowledgeReview(id) {
  const next = getLocalKnowledgeReviews().filter(item => item.id !== id);
  localStorage.setItem(LOCAL_KNOWLEDGE_REVIEWS_KEY, JSON.stringify(next));
}

export function downloadKnowledgeReviews(filename = 'biblioteca-viva-revisoes.json') {
  const reviews = getLocalKnowledgeReviews();
  const blob = new Blob([JSON.stringify(reviews, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
