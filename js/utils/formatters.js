/**
 * PulseTube AI — Pure String & Timecode Formatting Helpers
 */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseTimestampToSeconds(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const cleaned = ts.replace(/[\[\]()]/g, '').trim();
  const parts = cleaned.split(':').map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function slugifyFilename(title, fallback = 'resumo-video') {
  const slug = (title || 'resumo-youtube')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

  return slug || fallback;
}
