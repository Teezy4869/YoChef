import { fireEvent, render, screen } from '@testing-library/react-native';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors } from '@/theme/tokens';

describe('Button', () => {
  it('calls onPress when enabled', () => {
    const onPress = jest.fn();
    render(<Button title="Lưu" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and shows a spinner while loading', () => {
    const onPress = jest.fn();
    render(<Button title="Lưu" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Lưu' });
    expect(button).toBeDisabled();
    expect(screen.getByTestId('button-spinner')).toBeTruthy();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('is reachable by its label and shows an error', () => {
    const onChangeText = jest.fn();
    render(<TextField label="Email" error="Email không hợp lệ." onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.vn');
    expect(onChangeText).toHaveBeenCalledWith('a@b.vn');
    expect(screen.getByText('Email không hợp lệ.')).toBeTruthy();
  });
});

describe('Banner', () => {
  it('announces errors as alerts', () => {
    render(<Banner tone="error" message="Có lỗi" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('tokens', () => {
  // WCAG relative luminance contrast, so palette edits cannot silently break AA.
  function luminance(hex: string) {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a: string, b: string) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  it.each([
    ['text on background', colors.text, colors.background],
    ['muted text on background', colors.textMuted, colors.background],
    ['white on primary', colors.textOnPrimary, colors.primary],
    ['primary on background', colors.primary, colors.background],
    ['danger on danger soft', colors.danger, colors.dangerSoft],
    ['success on success soft', colors.success, colors.successSoft],
  ])('%s meets 4.5:1', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
