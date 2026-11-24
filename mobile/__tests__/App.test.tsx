import { render, screen } from '@testing-library/react-native';

import App from '@/app/App';

import { createFakeSupabase } from './helpers/fakeSupabase';

describe('App env gate', () => {
  it('shows the config error and never creates a client when env is missing', () => {
    const createClient = jest.fn();
    render(<App rawEnv={{ url: undefined, key: undefined }} createClient={createClient} />);
    expect(screen.getByTestId('config-error')).toBeTruthy();
    expect(screen.getByText(/Thiếu EXPO_PUBLIC_SUPABASE_URL/)).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('refuses a secret key', () => {
    const createClient = jest.fn();
    render(
      <App rawEnv={{ url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_secret_x' }} createClient={createClient} />,
    );
    expect(screen.getByText(/secret key/)).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('starts the app with a valid env', async () => {
    const fake = createFakeSupabase();
    const createClient = jest.fn(() => fake.client);
    render(
      <App
        rawEnv={{ url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_ok' }}
        createClient={createClient}
      />,
    );
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('config-error')).toBeNull();
    expect(await screen.findByText('Khám phá món Việt')).toBeTruthy();
  });
});
