import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import App from '@/app/App';
import { fetchRecipeVideo } from '@/features/videos/VideoButton';

import { createFakeSupabase } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const SEARCH_ROW = {
  id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa', category_slug: 'mon_chinh', category_name: 'Món chính',
  difficulty: 'medium', default_servings: 4, prep_time_minutes: 15, cook_time_minutes: 60, cover_image_path: null, description: null,
};
const row = (over: Record<string, unknown> = {}) => ({
  recipe_id: 'r1', youtube_video_id: 'dQw4w9WgXcQ', title: 'Thịt kho tàu', channel_title: 'Bếp Việt', is_primary: true,
  last_verified_at: new Date().toISOString(), ...over,
});

function setup(videos: Record<string, unknown>[]) {
  const fake = createFakeSupabase(null);
  fake.catalog.recipes = [SEARCH_ROW];
  fake.catalog.details['001-thit-kho'] = detailRow();
  fake.tables.recipe_videos = videos;
  return fake;
}

describe('recipe video', () => {
  it('opens the primary video on YouTube, never by itself', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const fake = setup([row()]);
    render(<App rawEnv={ENV} createClient={() => fake.client} />);
    fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
    expect(await screen.findByText('Thịt kho tàu · Bếp Việt')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Xem video hướng dẫn' }));
    expect(open).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    open.mockRestore();
  });

  it('repeats the 30-day check and ignores malformed rows', async () => {
    const now = Date.parse('2026-11-14T00:00:00Z');
    const old = setup([row({ last_verified_at: '2026-10-14T00:00:00Z' })]);
    expect(await fetchRecipeVideo(old.client, 'r1', now)).toBeNull();
    const fresh = setup([row({ last_verified_at: '2026-11-01T00:00:00Z' })]);
    expect(await fetchRecipeVideo(fresh.client, 'r1', now)).toEqual({ id: 'dQw4w9WgXcQ', title: 'Thịt kho tàu', channel: 'Bếp Việt' });
    const bad = setup([row({ youtube_video_id: 'not-an-id' })]);
    expect(await fetchRecipeVideo(bad.client, 'r1', now)).toBeNull();
  });
});
