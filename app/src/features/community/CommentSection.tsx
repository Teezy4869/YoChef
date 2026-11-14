import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { avatarPublicUrl } from '@/features/profile/profileApi';
import { useSupabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme/tokens';

import {
  COMMENT_MAX,
  COMMENTS_PAGE,
  commentLength,
  deleteComment,
  editComment,
  fetchComments,
  formatCommentDate,
  postComment,
  type Comment,
} from './commentsApi';

type Loaded = { key: string; comments: Comment[]; hasMore: boolean; error: string | null };
type Mode = { id: string; kind: 'edit'; text: string } | { id: string; kind: 'delete' };
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
const lengthError = (text: string) =>
  commentLength(text) > COMMENT_MAX ? `Bình luận tối đa ${COMMENT_MAX} ký tự.` : null;

/** Newest comments first, 20 at a time; signed-in users post, edit and remove their own. */
export function CommentSection({ recipeId }: { recipeId: string }) {
  const supabase = useSupabase();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [limit, setLimit] = useState(COMMENTS_PAGE);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<Mode | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const userKey = `${recipeId}#${userId ?? 'guest'}`;
  const key = `${userKey}#${limit}#${attempt}`;

  useEffect(() => {
    let active = true;
    fetchComments(supabase, recipeId, limit).then(
      (r) => active && setLoaded({ key, ...r, error: null }),
      (e: unknown) => active && setLoaded({ key, comments: [], hasMore: false, error: messageOf(e) }),
    );
    return () => {
      active = false;
    };
  }, [supabase, recipeId, limit, key]);

  // Keep this user's last list on screen while a refresh runs; never show another user's.
  const current = loaded && loaded.key.startsWith(`${userKey}#`) ? loaded : null;
  const refreshing = loaded?.key !== key;

  const run = async (action: () => Promise<void>, success: string | null) => {
    setNotice(null);
    setBusy(true);
    try {
      await action();
      setMode(null);
      if (success) setNotice({ tone: 'success', message: success });
      setAttempt((n) => n + 1);
    } catch (e) {
      setNotice({ tone: 'error', message: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    userId &&
    run(async () => {
      await postComment(supabase, userId, recipeId, draft);
      setDraft('');
    }, 'Đã gửi. Bình luận sẽ hiện công khai sau khi được duyệt.');

  const draftError = lengthError(draft);
  return (
    <View style={styles.root} testID="comments">
      <AppText variant="title">Bình luận</AppText>
      {userId ? (
        <View style={styles.composer}>
          <TextField
            label="Viết bình luận"
            multiline
            value={draft}
            onChangeText={setDraft}
            editable={!busy}
            error={draftError}
            hint={`${commentLength(draft)}/${COMMENT_MAX}`}
          />
          <Button
            title="Gửi bình luận"
            fullWidth={false}
            loading={busy && mode === null}
            disabled={busy || draft.trim() === '' || draftError !== null}
            onPress={send}
          />
        </View>
      ) : (
        <Button title="Đăng nhập để bình luận" variant="secondary" fullWidth={false} onPress={() => navigation.navigate('SignIn')} />
      )}
      {notice ? <Banner tone={notice.tone} message={notice.message} /> : null}
      {current?.error ? <Banner tone="error" message={current.error} /> : null}

      {!current ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Đang tải bình luận" />
      ) : current.comments.length === 0 && !current.error ? (
        <AppText tone="muted">Chưa có bình luận nào.</AppText>
      ) : (
        current.comments.map((c) => {
          const mine = c.userId === userId;
          const editing = mode?.id === c.id && mode.kind === 'edit' ? mode : null;
          const confirming = mode?.id === c.id && mode.kind === 'delete';
          return (
            <View key={c.id} style={styles.comment} testID="comment-row">
              <View style={styles.head}>
                {/* Decorative here: the name next to it is what a screen reader needs. */}
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Avatar uri={avatarPublicUrl(supabase, c.authorAvatarPath)} name={c.authorName} size={32} />
                </View>
                <View style={styles.headText}>
                  <AppText variant="label">{c.authorName ?? 'Người dùng YoChef'}</AppText>
                  <AppText variant="caption" tone="muted">
                    {formatCommentDate(c.createdAt)}
                  </AppText>
                </View>
              </View>
              {mine && c.status === 'pending' ? (
                <AppText variant="caption" tone="primary">
                  Đang chờ duyệt
                </AppText>
              ) : null}
              {editing ? (
                <>
                  <TextField
                    label="Sửa bình luận"
                    multiline
                    value={editing.text}
                    onChangeText={(text) => setMode({ ...editing, text })}
                    editable={!busy}
                    error={lengthError(editing.text)}
                    hint={
                      c.status === 'approved'
                        ? 'Sau khi sửa, bình luận sẽ chờ duyệt lại.'
                        : `${commentLength(editing.text)}/${COMMENT_MAX}`
                    }
                  />
                  <View style={styles.actions}>
                    <Button
                      title="Lưu"
                      fullWidth={false}
                      loading={busy}
                      disabled={busy || editing.text.trim() === '' || lengthError(editing.text) !== null}
                      onPress={() => run(() => editComment(supabase, c.id, editing.text), null)}
                    />
                    <Button title="Hủy" variant="ghost" fullWidth={false} disabled={busy} onPress={() => setMode(null)} />
                  </View>
                </>
              ) : (
                <AppText>{c.content}</AppText>
              )}
              {confirming ? (
                <View style={styles.actions}>
                  <AppText>Xóa bình luận này?</AppText>
                  <Button
                    title="Xóa"
                    variant="danger"
                    fullWidth={false}
                    loading={busy}
                    disabled={busy}
                    onPress={() => run(() => deleteComment(supabase, c.id), null)}
                  />
                  <Button title="Không xóa" variant="ghost" fullWidth={false} disabled={busy} onPress={() => setMode(null)} />
                </View>
              ) : mine && !editing ? (
                <View style={styles.actions}>
                  <Button
                    title="Sửa"
                    variant="ghost"
                    fullWidth={false}
                    disabled={busy}
                    accessibilityLabel="Sửa bình luận"
                    onPress={() => setMode({ id: c.id, kind: 'edit', text: c.content })}
                  />
                  <Button
                    title="Xóa"
                    variant="ghost"
                    fullWidth={false}
                    disabled={busy}
                    accessibilityLabel="Xóa bình luận"
                    onPress={() => setMode({ id: c.id, kind: 'delete' })}
                  />
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {current?.hasMore ? (
        <Button
          title="Xem thêm bình luận"
          variant="secondary"
          loading={refreshing}
          disabled={refreshing}
          onPress={() => setLimit((n) => n + COMMENTS_PAGE)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  composer: { gap: spacing.sm },
  comment: { gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headText: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
});
