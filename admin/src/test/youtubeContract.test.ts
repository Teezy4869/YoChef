// The youtube-search / youtube-refresh logic, run with an injected fetch (E5).
import { checkRefreshSecret } from '../../../supabase/functions/_shared/auth.ts';
import { ContractError } from '../../../supabase/functions/_shared/http.ts';
import { checkVideos, searchCandidates, toRefreshResults, validateVideoId } from '../../../supabase/functions/youtube-search/contract.ts';

const KEY = 'youtube-test-key-123456';
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const video = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  snippet: { title: `Cách làm ${id}`, channelTitle: 'Bếp Việt', thumbnails: { high: { url: `https://i.ytimg.com/${id}.jpg` } } },
  status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: true },
  contentDetails: {},
  ...over,
});
const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return e instanceof ContractError ? e.code : String(e);
  }
};

describe('youtube contract', () => {
  it('searches candidates with the key in a header, in Vietnam, skipping bad rows', async () => {
    const fetchImpl = reply(200, {
      items: [
        { id: { videoId: 'dQw4w9WgXcQ' }, snippet: { title: 'Thịt kho', channelTitle: 'Bếp' } },
        { id: { videoId: 'bad' }, snippet: { title: 'x' } },
      ],
    });
    const items = await searchCandidates(' thịt kho ', { fetchImpl, apiKey: KEY });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(KEY);
    expect(url).toContain('regionCode=VN');
    expect((init.headers as Record<string, string>)['X-goog-api-key']).toBe(KEY);
    expect(items).toEqual([expect.objectContaining({ id: 'dQw4w9WgXcQ', verificationStatus: 'candidate' })]);
  });

  it('verifies only public, processed, embeddable videos that play in Vietnam', async () => {
    const fetchImpl = reply(200, {
      items: [
        video('aaaaaaaaaaa'),
        video('bbbbbbbbbbb', { status: { privacyStatus: 'unlisted', uploadStatus: 'processed', embeddable: true } }),
        video('ccccccccccc', { status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: false } }),
        video('ddddddddddd', { contentDetails: { regionRestriction: { blocked: ['VN'] } } }),
        video('eeeeeeeeeee', { contentDetails: { regionRestriction: { allowed: ['US'] } } }),
      ],
    });
    const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee', 'fffffffffff'];
    const checks = await checkVideos(ids, { fetchImpl, apiKey: KEY });
    expect(ids.map((id) => {
      const c = checks.get(id)!;
      return c.verificationStatus === 'verified' ? 'verified' : c.reason;
    })).toEqual(['verified', 'not_public', 'not_embeddable', 'region_blocked', 'region_blocked', 'not_found_or_private']);
    expect(toRefreshResults(['aaaaaaaaaaa', 'bbbbbbbbbbb'], checks)).toEqual([
      { video_id: 'aaaaaaaaaaa', outcome: 'verified', title: 'Cách làm aaaaaaaaaaa', channel_title: 'Bếp Việt', description: null },
      { video_id: 'bbbbbbbbbbb', outcome: 'unavailable', reason: 'not_public' },
    ]);
    expect(toRefreshResults(['aaaaaaaaaaa'], null)).toEqual([{ video_id: 'aaaaaaaaaaa', outcome: 'failed' }]);
  });

  it('maps quota and key problems, bad ids and a missing key', async () => {
    const quota = reply(403, { error: { errors: [{ reason: 'quotaExceeded' }] } });
    await expect(checkVideos(['aaaaaaaaaaa'], { fetchImpl: quota, apiKey: KEY })).rejects.toMatchObject({ code: 'quota_exceeded' });
    const badKey = reply(400, { error: { errors: [{ reason: 'keyInvalid' }] } });
    await expect(searchCandidates('x', { fetchImpl: badKey, apiKey: KEY })).rejects.toMatchObject({ code: 'config_error' });
    await expect(searchCandidates('x', { fetchImpl: reply(200, {}), apiKey: undefined })).rejects.toMatchObject({ code: 'config_error' });
    expect(codeOf(() => validateVideoId('short'))).toBe('invalid_input');
    expect(codeOf(() => validateVideoId(' dQw4w9WgXcQ '))).toBe('ok');
  });

  it('the refresh secret must be configured, long, and match', () => {
    const secret = 's'.repeat(40);
    expect(codeOf(() => checkRefreshSecret(secret, undefined))).toBe('config_error');
    expect(codeOf(() => checkRefreshSecret('short', 'short'))).toBe('config_error');
    expect(codeOf(() => checkRefreshSecret('x'.repeat(40), secret))).toBe('unauthorized');
    expect(codeOf(() => checkRefreshSecret(secret, secret))).toBe('ok');
  });
});
