import { fireEvent, render, screen } from '@testing-library/react-native';

import { Banner } from '@/components/Banner';
import { BottomSheetModal } from '@/components/BottomSheetModal';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { RecipeListSkeleton } from '@/components/Skeleton';
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

  it('toggles password visibility when secureTextEntry is enabled', () => {
    render(<TextField label="Mật khẩu" secureTextEntry value="secret" onChangeText={() => undefined} />);
    expect(screen.getByLabelText('Mật khẩu').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(screen.getByLabelText('Mật khẩu').props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(screen.getByLabelText('Mật khẩu').props.secureTextEntry).toBe(true);
  });
});

describe('EmptyState, BottomSheetModal, Skeleton', () => {
  it('renders EmptyState with title, message and action', () => {
    const onPress = jest.fn();
    render(
      <EmptyState
        icon="heart-outline"
        title="Trống"
        message="Chưa có dữ liệu"
        action={<Button title="Thử lại" onPress={onPress} />}
      />,
    );
    expect(screen.getByText('Trống')).toBeTruthy();
    expect(screen.getByText('Chưa có dữ liệu')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders BottomSheetModal and closes on close button', () => {
    const onClose = jest.fn();
    render(
      <BottomSheetModal visible title="Tiêu đề" onClose={onClose}>
        <Button title="Xác nhận" onPress={() => undefined} />
      </BottomSheetModal>,
    );
    expect(screen.getByText('Tiêu đề')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders RecipeListSkeleton', () => {
    render(<RecipeListSkeleton count={2} testID="skeleton-list" />);
    expect(screen.getByTestId('skeleton-list')).toBeTruthy();
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
