import { render, screen } from '@testing-library/react-native';

import App from '@/app/App';

describe('App placeholder', () => {
  it('renders the app name', () => {
    render(<App />);
    expect(screen.getByText('YoChef')).toBeTruthy();
  });
});
