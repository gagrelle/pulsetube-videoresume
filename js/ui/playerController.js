/**
 * PulseTube AI — URL Preview Strip & Synchronized YouTube Player Controller
 */

import {
  buildYouTubeEmbedUrl,
  extractYouTubeId,
  fetchOembedMetadata,
  getCanonicalYouTubeUrl,
  getFallbackThumbnailUrl
} from '../services/youtubeService.js';
import { state } from '../state/store.js';
import { dom } from './dom.js';

export async function previewDetectedUrl(rawUrl) {
  const videoId = extractYouTubeId(rawUrl);
  if (!videoId) {
    dom.detectedStrip.classList.remove('visible');
    state.currentVideo = null;
    return null;
  }

  const canonicalUrl = getCanonicalYouTubeUrl(videoId);
  const fallbackThumb = getFallbackThumbnailUrl(videoId);

  const videoMeta = {
    videoId,
    canonicalUrl,
    title: 'Vídeo do YouTube identificado',
    channel: 'YouTube · Pronto para análise multimodal',
    thumbnail: fallbackThumb
  };

  state.currentVideo = videoMeta;
  dom.detectedThumb.src = fallbackThumb;
  dom.detectedTitle.textContent = 'Buscando informações do vídeo...';
  dom.detectedChannel.textContent = canonicalUrl;
  dom.detectedVideoId.textContent = videoId;
  dom.detectedStrip.classList.add('visible');

  try {
    const meta = await fetchOembedMetadata(canonicalUrl);
    if (meta) {
      videoMeta.title = meta.title;
      videoMeta.channel = meta.channel;
      videoMeta.thumbnail = meta.thumbnail || fallbackThumb;

      if (state.currentVideo && state.currentVideo.videoId === videoId) {
        dom.detectedTitle.textContent = videoMeta.title;
        dom.detectedChannel.textContent = `Canal: ${videoMeta.channel}`;
        dom.detectedThumb.src = videoMeta.thumbnail;
      }
    }
  } catch {
    if (state.currentVideo && state.currentVideo.videoId === videoId) {
      dom.detectedTitle.textContent = 'Vídeo pronto para análise pelo link';
    }
  }

  return videoMeta;
}

export function syncResultPlayer(video) {
  if (video.videoId) {
    const embedUrl = buildYouTubeEmbedUrl(video.videoId);
    if (dom.ytIframe.src !== embedUrl) {
      dom.ytIframe.src = embedUrl;
      state.playerReadyWithJsApi = true;
    }
    dom.resultExternalLink.href = video.canonicalUrl;
    dom.resultExternalLink.style.display = 'inline-flex';
  } else {
    dom.ytIframe.src = 'about:blank';
    dom.resultExternalLink.style.display = 'none';
  }
}

export function seekVideoTo(seconds) {
  const videoId = state.currentResult?.video?.videoId;
  if (!videoId) return;

  if (state.playerReadyWithJsApi && dom.ytIframe.contentWindow) {
    // Send YouTube IFrame Player API postMessage command for smooth zero-reload jump
    dom.ytIframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }),
      '*'
    );
    dom.ytIframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
      '*'
    );

    // Fallback reload if player had not been started yet
    if (!dom.ytIframe.dataset.hasPlayed) {
      dom.ytIframe.src = buildYouTubeEmbedUrl(videoId, {
        startSeconds: seconds,
        autoplay: true
      });
      dom.ytIframe.dataset.hasPlayed = 'true';
    }
  } else {
    dom.ytIframe.src = buildYouTubeEmbedUrl(videoId, {
      startSeconds: seconds,
      autoplay: true
    });
    state.playerReadyWithJsApi = true;
    dom.ytIframe.dataset.hasPlayed = 'true';
  }

  if (window.innerWidth <= 980) {
    dom.ytIframe.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
