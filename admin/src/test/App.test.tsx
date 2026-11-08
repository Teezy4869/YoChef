import { render, screen } from '@testing-library/react';

import App from '@/App';

describe('Admin placeholder', () => {
  it('renders the admin title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'YoChef Admin' })).toBeInTheDocument();
  });
});
