/**
 * PulseTube AI — YouTube URL Parsing & oEmbed Metadata Service
 */

export function extractYouTubeId(input) {
  if (!input) return null;
  const raw = input.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return raw;
  }

  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProto);
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && id.length === 11 ? id : null;
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const vParam = url.searchParams.get('v');
      if (vParam && vParam.length === 11) return vParam;

      const segments = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'live', 'embed', 'v'].includes(segments[0]) && segments[1]) {
        const candidate = segments[1].substring(0, 11);
        return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
      }
    }
  } catch {
    const regexMatch = raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/);
    if (regexMatch) return regexMatch[1];
  }

  return null;
}

export function getCanonicalYouTubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getFallbackThumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function buildYouTubeEmbedUrl(videoId, { startSeconds = null, autoplay = false } = {}) {
  const params = new URLSearchParams();
  if (startSeconds !== null) {
    params.set('start', String(startSeconds));
  }
  if (autoplay) {
    params.set('autoplay', '1');
  }
  params.set('enablejsapi', '1');
  params.set('rel', '0');

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

export async function fetchOembedMetadata(canonicalUrl) {
  const oembedRes = await fetch(
    `https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`
  );
  if (!oembedRes.ok) return null;

  const meta = await oembedRes.json();
  if (!meta || !meta.title) return null;

  return {
    title: meta.title,
    channel: meta.author_name || 'Canal do YouTube',
    thumbnail: meta.thumbnail_url || null
  };
}
