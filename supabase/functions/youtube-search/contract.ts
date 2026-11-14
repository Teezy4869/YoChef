// YouTube contract (YoChef v2, step 4.4): validation and classification only, with an injected
// fetch. Ported from the v1 reference; see phase4_08_youtube_freshness_policy.md.
// The API key goes in the X-goog-api-key header, never in a URL.
//
// search.list -> candidate. It is never proof that a video can be played.
// videos.list -> verified or unavailable. This is the only source of a verified state.

import {
  ContractError,
  fetchProviderJson,
  isRecord,
  validateQuery,
  type FetchLike,
} from '../_shared/http.ts';

export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
export const MAX_SEARCH_RESULTS = 8;
export const MAX_VIDEOS_PER_CALL = 50;
/** The app's audience. A video blocked here is unavailable to its users. */
export const APP_REGION = 'VN';

export interface VideoCandidate {
  id: string;
  title: string;
  channelTitle: string;
  description: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  verificationStatus: 'candidate';
}

export type VideoCheck =
  | {
      id: string;
      verificationStatus: 'verified';
      embeddable: true;
      title: string;
      channelTitle: string;
      description: string | null;
      thumbnailUrl: string | null;
    }
  | { id: string; verificationStatus: 'unavailable'; embeddable: false; reason: string };

export interface YoutubeDeps {
  fetchImpl: FetchLike;
  apiKey: string | undefined;
}

export function requireApiKey(key: string | undefined): string {
  if (!key || key === 'placeholder-key' || key.trim().length < 10) {
    throw new ContractError('config_error', 'YOUTUBE_API_KEY is not configured on the server.');
  }
  return key;
}

export function validateVideoId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!VIDEO_ID_PATTERN.test(id)) {
    throw new ContractError('invalid_input', 'A YouTube video ID is exactly 11 characters.');
  }
  return id;
}

function classifyYoutubeError(res: { status: number; ok: boolean; body: unknown }): void {
  if (res.ok) return;
  const errors = isRecord(res.body) && isRecord(res.body.error) ? res.body.error.errors : null;
  const reason = Array.isArray(errors) && isRecord(errors[0]) ? errors[0].reason : null;
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded') {
    throw new ContractError('quota_exceeded', 'YouTube API quota is exhausted. Try again after it resets.');
  }
  if (reason === 'keyInvalid' || res.status === 401) {
    throw new ContractError('config_error', 'YouTube rejected the configured API key.');
  }
  throw new ContractError('provider_error', 'YouTube API returned an error.');
}

function bestThumbnail(snippet: Record<string, unknown>): string | null {
  const thumbs = isRecord(snippet.thumbnails) ? snippet.thumbnails : null;
  for (const size of ['high', 'medium', 'default']) {
    const t = thumbs && isRecord(thumbs[size]) ? (thumbs[size] as Record<string, unknown>) : null;
    if (t && typeof t.url === 'string') return t.url;
  }
  return null;
}

export function classifyVideoItem(id: string, item: unknown): VideoCheck {
  if (!isRecord(item) || !isRecord(item.status) || !isRecord(item.snippet)) {
    throw new ContractError('malformed_provider_response', 'YouTube returned an unexpected video shape.');
  }
  const { status, snippet } = item;

  const unavailable = (reason: string): VideoCheck => ({
    id,
    verificationStatus: 'unavailable',
    embeddable: false,
    reason,
  });

  if (status.privacyStatus !== 'public') return unavailable('not_public');
  if (status.uploadStatus !== 'processed') return unavailable('not_processed');
  if (status.embeddable !== true) return unavailable('not_embeddable');

  const details = isRecord(item.contentDetails) ? item.contentDetails : null;
  const region = details && isRecord(details.regionRestriction) ? details.regionRestriction : null;
  if (region) {
    if (Array.isArray(region.blocked) && region.blocked.includes(APP_REGION)) {
      return unavailable('region_blocked');
    }
    if (Array.isArray(region.allowed) && !region.allowed.includes(APP_REGION)) {
      return unavailable('region_blocked');
    }
  }

  // A check with no title cannot produce the metadata that assignment needs.
  if (typeof snippet.title !== 'string' || snippet.title.trim() === '') {
    throw new ContractError('malformed_provider_response', 'YouTube returned a video without a title.');
  }

  return {
    id,
    verificationStatus: 'verified',
    embeddable: true,
    title: snippet.title,
    channelTitle: typeof snippet.channelTitle === 'string' ? snippet.channelTitle : '',
    description: typeof snippet.description === 'string' ? snippet.description : null,
    thumbnailUrl: bestThumbnail(snippet),
  };
}

/** Checks up to 50 IDs for one quota unit. An ID absent from the reply is deleted or private. */
export async function checkVideos(ids: string[], deps: YoutubeDeps): Promise<Map<string, VideoCheck>> {
  if (ids.length === 0) return new Map();
  if (ids.length > MAX_VIDEOS_PER_CALL) {
    throw new ContractError('invalid_input', `At most ${MAX_VIDEOS_PER_CALL} video IDs per call.`);
  }
  const key = requireApiKey(deps.apiKey);
  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,contentDetails` +
    `&id=${ids.map(encodeURIComponent).join(',')}`;
  const res = await fetchProviderJson(deps.fetchImpl, url, { headers: { 'X-goog-api-key': key } });
  classifyYoutubeError(res);
  if (!isRecord(res.body) || !Array.isArray(res.body.items)) {
    throw new ContractError('malformed_provider_response', 'YouTube returned an unexpected response shape.');
  }

  const out = new Map<string, VideoCheck>();
  for (const item of res.body.items) {
    if (!isRecord(item) || typeof item.id !== 'string') {
      throw new ContractError('malformed_provider_response', 'YouTube returned a video without an ID.');
    }
    if (ids.includes(item.id)) out.set(item.id, classifyVideoItem(item.id, item));
  }
  for (const id of ids) {
    if (!out.has(id)) {
      out.set(id, { id, verificationStatus: 'unavailable', embeddable: false, reason: 'not_found_or_private' });
    }
  }
  return out;
}

export async function searchCandidates(rawQuery: unknown, deps: YoutubeDeps): Promise<VideoCandidate[]> {
  const query = validateQuery(rawQuery);
  const key = requireApiKey(deps.apiKey);
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true` +
    `&regionCode=${APP_REGION}&relevanceLanguage=vi&maxResults=${MAX_SEARCH_RESULTS}&q=${encodeURIComponent(query)}`;
  const res = await fetchProviderJson(deps.fetchImpl, url, { headers: { 'X-goog-api-key': key } });
  classifyYoutubeError(res);
  if (!isRecord(res.body) || !Array.isArray(res.body.items)) {
    throw new ContractError('malformed_provider_response', 'YouTube returned an unexpected response shape.');
  }

  const candidates: VideoCandidate[] = [];
  for (const item of res.body.items.slice(0, MAX_SEARCH_RESULTS)) {
    const id = isRecord(item) && isRecord(item.id) ? item.id.videoId : null;
    const snippet = isRecord(item) && isRecord(item.snippet) ? item.snippet : null;
    // One bad row is skipped rather than turned into a fake candidate.
    if (typeof id !== 'string' || !VIDEO_ID_PATTERN.test(id) || !snippet) continue;
    candidates.push({
      id,
      title: typeof snippet.title === 'string' ? snippet.title : '',
      channelTitle: typeof snippet.channelTitle === 'string' ? snippet.channelTitle : '',
      description: typeof snippet.description === 'string' ? snippet.description : null,
      publishedAt: typeof snippet.publishedAt === 'string' ? snippet.publishedAt : null,
      thumbnailUrl: bestThumbnail(snippet),
      verificationStatus: 'candidate',
    });
  }
  return candidates;
}

/** Pure refresh planner, so its behaviour can be tested without a database or network. */
export function toRefreshResults(ids: string[], checks: Map<string, VideoCheck> | null) {
  return ids.map((id) => {
    const check = checks?.get(id);
    if (!check) return { video_id: id, outcome: 'failed' as const };
    if (check.verificationStatus === 'verified') {
      return {
        video_id: id,
        outcome: 'verified' as const,
        title: check.title,
        channel_title: check.channelTitle,
        description: check.description,
      };
    }
    return { video_id: id, outcome: 'unavailable' as const, reason: check.reason };
  });
}
