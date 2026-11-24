import { Image, StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

import { AppText } from './AppText';

export function initialsOf(name: string | null | undefined, fallback = '?'): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ uri, name, size = 88 }: { uri: string | null; name: string | null; size?: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[styles.base, box]} accessibilityLabel="Ảnh đại diện" testID="avatar-image" />;
  }
  return (
    <View style={[styles.base, styles.placeholder, box]} accessible accessibilityLabel="Chưa có ảnh đại diện">
      <AppText variant="title" tone="primary" style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}>
        {initialsOf(name)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceMuted },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
});
