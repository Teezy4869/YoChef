import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { DISPLAY_NAME_MAX, validateDisplayName } from '@/features/auth/validation';
import { ModerationEntry } from '@/features/moderation/ModerationEntry';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

import { pickAvatar } from './pickAvatar';
import {
  avatarPublicUrl,
  BIO_MAX,
  fetchMyProfile,
  ProfileError,
  replaceAvatar,
  updateMyProfile,
  type MyProfile,
} from './profileApi';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; profile: MyProfile };

const messageOf = (e: unknown) => (e instanceof ProfileError ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.');

export function ProfileView({ session }: { session: Session }) {
  const supabase = useSupabase();
  const { signOut } = useAuth();
  const userId = session.user.id;

  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; bio?: string }>({});
  const [banner, setBanner] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'avatar' | 'signout'>(null);

  const [attempt, setAttempt] = useState(0);

  // State is set only when the request settles (never synchronously in the
  // effect), and a stale response after unmount or retry is ignored.
  useEffect(() => {
    let active = true;
    fetchMyProfile(supabase).then(
      (profile) => {
        if (!active) return;
        setLoad(profile ? { state: 'ready', profile } : { state: 'error', message: 'Không tìm thấy hồ sơ của bạn.' });
      },
      (e: unknown) => {
        if (active) setLoad({ state: 'error', message: messageOf(e) });
      },
    );
    return () => {
      active = false;
    };
  }, [supabase, attempt]);

  function retry() {
    setLoad({ state: 'loading' });
    setAttempt((n) => n + 1);
  }

  if (load.state === 'loading') {
    return (
      <Screen centered testID="profile-loading">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải hồ sơ" />
      </Screen>
    );
  }

  if (load.state === 'error') {
    return (
      <Screen centered testID="profile-error">
        <Banner tone="error" message={load.message} />
        <Button title="Thử lại" onPress={retry} />
        <Button title="Đăng xuất" variant="ghost" onPress={() => signOut()} />
      </Screen>
    );
  }

  const { profile } = load;

  function startEdit() {
    setName(profile.display_name ?? '');
    setBio(profile.bio ?? '');
    setFieldErrors({});
    setBanner(null);
    setEditing(true);
  }

  async function save() {
    const errors: { name?: string; bio?: string } = {};
    const nameError = validateDisplayName(name);
    if (nameError) errors.name = nameError;
    if (bio.trim().length > BIO_MAX) errors.bio = `Giới thiệu tối đa ${BIO_MAX} ký tự.`;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy('save');
    setBanner(null);
    try {
      await updateMyProfile(supabase, userId, { displayName: name, bio });
      const fresh = await fetchMyProfile(supabase);
      if (fresh) setLoad({ state: 'ready', profile: fresh });
      setEditing(false);
      setBanner({ tone: 'success', message: 'Đã lưu hồ sơ.' });
    } catch (e) {
      setBanner({ tone: 'error', message: messageOf(e) });
    } finally {
      setBusy(null);
    }
  }

  async function changeAvatar() {
    setBanner(null);
    let picked;
    try {
      picked = await pickAvatar();
    } catch {
      setBanner({ tone: 'error', message: 'Không mở được thư viện ảnh.' });
      return;
    }
    if (!picked) return;
    setBusy('avatar');
    try {
      const path = await replaceAvatar(supabase, userId, picked, profile.avatar_path);
      setLoad({ state: 'ready', profile: { ...profile, avatar_path: path } });
      setBanner({ tone: 'success', message: 'Đã cập nhật ảnh đại diện.' });
    } catch (e) {
      setBanner({ tone: 'error', message: messageOf(e) });
    } finally {
      setBusy(null);
    }
  }

  async function onSignOut() {
    setBusy('signout');
    const r = await signOut();
    // On success this view unmounts; only an error leaves us here.
    if (r.error) {
      setBanner({ tone: 'error', message: r.error });
      setBusy(null);
    }
  }

  return (
    <Screen testID="account-signed-in">
      {/* Modern Profile Header Card */}
      <View style={styles.profileCard}>
        <Avatar uri={avatarPublicUrl(supabase, profile.avatar_path)} name={profile.display_name ?? session.user.email ?? null} size={64} />
        <View style={styles.headerText}>
          <AppText variant="title" testID="profile-name" style={styles.displayName}>
            {profile.display_name ?? 'Chưa đặt tên'}
          </AppText>
          <AppText tone="muted" style={styles.emailText}>
            {session.user.email}
          </AppText>
        </View>
      </View>

      {banner ? <Banner tone={banner.tone} message={banner.message} testID="profile-banner" /> : null}

      {editing ? (
        <View style={styles.editCard}>
          <AppText variant="heading" style={styles.cardSectionTitle}>Chỉnh sửa thông tin</AppText>
          <TextField
            label="Tên hiển thị"
            value={name}
            onChangeText={setName}
            error={fieldErrors.name}
            hint={`Tối đa ${DISPLAY_NAME_MAX} ký tự. Để trống nếu không muốn đặt tên.`}
            maxLength={DISPLAY_NAME_MAX + 10}
          />
          <TextField
            label="Giới thiệu"
            value={bio}
            onChangeText={setBio}
            error={fieldErrors.bio}
            hint={`${bio.trim().length}/${BIO_MAX} ký tự. Chỉ bạn xem được.`}
            multiline
            maxLength={BIO_MAX + 50}
          />
          <View style={styles.editButtonsRow}>
            <Button title="Lưu" onPress={save} loading={busy === 'save'} />
            <Button title="Hủy" variant="ghost" onPress={() => setEditing(false)} disabled={busy === 'save'} />
          </View>
        </View>
      ) : (
        <View style={styles.infoCard}>
          <View style={styles.bioBlock}>
            <AppText variant="heading" style={styles.cardSectionTitle}>Giới thiệu</AppText>
            <AppText tone={profile.bio ? 'default' : 'muted'} testID="profile-bio" style={styles.bioText}>
              {profile.bio ?? 'Chưa có giới thiệu.'}
            </AppText>
          </View>

          <View style={styles.actionsBlock}>
            <Button title="Sửa hồ sơ" onPress={startEdit} disabled={busy !== null} />
            <Button
              title="Đổi ảnh đại diện"
              variant="secondary"
              onPress={changeAvatar}
              loading={busy === 'avatar'}
              disabled={busy !== null && busy !== 'avatar'}
            />
            <ModerationEntry userId={userId} />
            <Button
              title="Đăng xuất"
              variant="ghost"
              onPress={onSignOut}
              loading={busy === 'signout'}
              disabled={busy !== null && busy !== 'signout'}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  headerText: { flex: 1, gap: 2 },
  displayName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  emailText: {
    fontSize: 13,
  },
  editCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
    ...shadows.subtle,
  },
  editButtonsRow: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  infoCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.xl,
    ...shadows.subtle,
  },
  bioBlock: {
    gap: spacing.xs,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  bioText: {
    fontSize: 15,
    lineHeight: 22,
  },
  actionsBlock: {
    gap: spacing.sm,
  },
});
