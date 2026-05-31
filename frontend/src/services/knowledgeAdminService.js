const LOCAL_KNOWLEDGE_REVIEWS_KEY = 'acup_living_library_reviews_v1';

function generateId() {
  return `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getLocalKnowledgeReviews() {
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
