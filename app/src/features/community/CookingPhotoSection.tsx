import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';

import {
  addCookingPhoto,
  CAPTION_MAX,
  deleteCookingPhoto,
  fetchCookingPhotos,
  PHOTOS_PAGE,
  type CookingPhoto,
} from './cookingPhotosApi';
import { pickCookingPhoto, type PhotoSource, type PickedPhoto } from './pickCookingPhoto';

type Loaded = { key: string; photos: CookingPhoto[]; hasMore: boolean; error: string | null };
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
const captionLength = (text: string) => Array.from(text.trim()).length;

/** Photos of this recipe by its cooks, newest first; signed-in users add and remove their own. */
export function CookingPhotoSection({ recipeId }: { recipeId: string }) {
  const supabase = useSupabase();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [limit, setLimit] = useState(PHOTOS_PAGE);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [caption, setCaption] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const userKey = `${recipeId}#${userId ?? 'guest'}`;
  const key = `${userKey}#${limit}#${attempt}`;

  useEffect(() => {
    let active = true;
    fetchCookingPhotos(supabase, recipeId, limit).then(
      (r) => active && setLoaded({ key, ...r, error: null }),
      (e: unknown) => active && setLoaded({ key, photos: [], hasMore: false, error: messageOf(e) }),
    );
    return () => {
      active = false;
    };
  }, [supabase, recipeId, limit, key]);

  // Keep this user's last photos on screen while a refresh runs; never show another user's.
  const current = loaded && loaded.key.startsWith(`${userKey}#`) ? loaded : null;
  const refreshing = loaded?.key !== key;

  const choose = async (source: PhotoSource) => {
    setNotice(null);
    try {
      const result = await pickCookingPhoto(source);
      if (result === 'denied') {
        setNotice({ tone: 'error', message: 'YoChef chưa được dùng camera. Hãy cho phép trong phần cài đặt của máy.' });
      } else if (result) {
        setPicked(result);
      }
    } catch {
      setNotice({ tone: 'error', message: source === 'camera' ? 'Không mở được camera.' : 'Không mở được thư viện ảnh.' });
    }
  };

  const run = async (action: () => Promise<void>, success: string | null) => {
    setNotice(null);
    setBusy(true);
    try {
      await action();
      if (success) setNotice({ tone: 'success', message: success });
      setAttempt((n) => n + 1);
      return true;
    } catch (e) {
      setNotice({ tone: 'error', message: messageOf(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!userId || !picked) return;
    const ok = await run(
      () => addCookingPhoto(supabase, userId, recipeId, picked, caption),
      'Đã gửi. Ảnh sẽ hiện công khai sau khi được duyệt.',
    );
    if (ok) {
      setPicked(null);
      setCaption('');
    }
  };

  const captionError = captionLength(caption) > CAPTION_MAX ? `Chú thích tối đa ${CAPTION_MAX} ký tự.` : null;
  return (
    <View style={styles.root} testID="cooking-photos">
      <AppText variant="title">Ảnh món đã nấu</AppText>
      {!userId ? (
        <Button title="Đăng nhập để đăng ảnh" variant="secondary" fullWidth={false} onPress={() => navigation.navigate('SignIn')} />
      ) : picked ? (
        <View style={styles.composer} testID="photo-composer">
          <Image source={{ uri: picked.uri }} style={styles.preview} accessibilityLabel="Ảnh sắp đăng" />
          <TextField
            label="Chú thích (không bắt buộc)"
            value={caption}
            onChangeText={setCaption}
            editable={!busy}
            error={captionError}
            hint={`${captionLength(caption)}/${CAPTION_MAX}`}
          />
          <View style={styles.actions}>
            <Button title="Đăng ảnh" fullWidth={false} loading={busy} disabled={busy || captionError !== null} onPress={post} />
            <Button title="Bỏ ảnh này" variant="ghost" fullWidth={false} disabled={busy} onPress={() => setPicked(null)} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button title="Chụp ảnh" variant="secondary" fullWidth={false} disabled={busy} onPress={() => choose('camera')} />
          <Button title="Chọn từ thư viện" variant="secondary" fullWidth={false} disabled={busy} onPress={() => choose('library')} />
        </View>
      )}
      {notice ? <Banner tone={notice.tone} message={notice.message} /> : null}
      {current?.error ? <Banner tone="error" message={current.error} /> : null}

      {!current ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Đang tải ảnh" />
      ) : current.photos.length === 0 && !current.error ? (
        <AppText tone="muted">Chưa có ảnh nào.</AppText>
      ) : (
        <View style={styles.grid}>
          {current.photos.map((p) => {
            const mine = p.userId === userId;
            const label = [p.caption, `Ảnh của ${p.authorName ?? 'người dùng YoChef'}`].filter(Boolean).join('. ');
            return (
              <View key={p.id} style={styles.tile} testID="photo-tile">
                {p.url ? (
                  <Image source={{ uri: p.url }} style={styles.photo} accessibilityLabel={label} />
                ) : (
                  <View style={[styles.photo, styles.missing]} accessible accessibilityLabel={label}>
                    <AppText variant="caption" tone="muted" align="center">
                      Không tải được ảnh
                    </AppText>
                  </View>
                )}
                {p.caption ? <AppText variant="caption">{p.caption}</AppText> : null}
                <AppText variant="caption" tone="muted">
                  {p.authorName ?? 'Người dùng YoChef'}
                </AppText>
                {mine && p.status === 'pending' ? (
                  <AppText variant="caption" tone="primary">
                    Đang chờ duyệt
                  </AppText>
                ) : null}
                {mine && confirming === p.id ? (
                  <View style={styles.actions}>
                    <Button
                      title="Xóa"
                      variant="danger"
                      fullWidth={false}
                      loading={busy}
                      disabled={busy}
                      onPress={async () => {
                        if (await run(() => deleteCookingPhoto(supabase, p), null)) setConfirming(null);
                      }}
                    />
                    <Button title="Không xóa" variant="ghost" fullWidth={false} disabled={busy} onPress={() => setConfirming(null)} />
                  </View>
                ) : mine ? (
                  <Button
                    title="Xóa ảnh"
                    variant="ghost"
                    fullWidth={false}
                    disabled={busy}
                    onPress={() => setConfirming(p.id)}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {current?.hasMore ? (
        <Button
          title="Xem thêm ảnh"
          variant="secondary"
          loading={refreshing}
          disabled={refreshing}
          onPress={() => setLimit((n) => n + PHOTOS_PAGE)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  composer: { gap: spacing.sm },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47%', gap: spacing.xxs },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  missing: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
});
