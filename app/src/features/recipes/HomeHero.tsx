import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

import { formatMinutes, servingsLabel, totalMinutes } from './format';
import type { RecipeSummary } from './types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.84, 320);

interface HomeHeroProps {
  recipes: RecipeSummary[];
  coverUrls: Map<string, string>;
  onSelectRecipe: (slug: string) => void;
}

export function HomeHero({ recipes, coverUrls, onSelectRecipe }: HomeHeroProps) {
  if (recipes.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={13} color={colors.primary} />
          <AppText variant="caption" style={styles.badgeText}>
            GỢI Ý CHỌN LỌC
          </AppText>
        </View>
        <AppText variant="title" style={styles.title}>
          Bộ sưu tập nổi bật
        </AppText>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={HERO_CARD_WIDTH + spacing.md}
      >
        {recipes.map((item) => {
          const cover = coverUrls.get(item.slug);
          const time = totalMinutes(item.prepTimeMinutes, item.cookTimeMinutes);

          return (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
              onPress={() => onSelectRecipe(item.slug)}
            >
              {cover ? (
                <Image source={{ uri: cover }} style={styles.cardImage} resizeMode="cover" />
              ) : (
                <View style={[styles.cardImage, styles.noImage]}>
                  <Ionicons name="restaurant-outline" size={40} color={colors.textMuted} />
                </View>
              )}

              {/* Top Badges */}
              <View style={styles.topBadgeRow}>
                {item.categoryName ? (
                  <View style={styles.categoryPill}>
                    <AppText variant="caption" style={styles.categoryPillText}>
                      {item.categoryName}
                    </AppText>
                  </View>
                ) : null}
                <View style={styles.ratingPill}>
                  <Ionicons name="star" size={12} color={colors.star} />
                  <AppText variant="caption" style={styles.ratingPillText}>
                    Nổi bật
                  </AppText>
                </View>
              </View>

              {/* Bottom Gradient overlay */}
              <LinearGradient colors={['transparent', 'rgba(17,24,39,0.92)']} style={styles.gradient}>
                <AppText variant="heading" numberOfLines={2} style={styles.cardTitle}>
                  {item.name}
                </AppText>

                <View style={styles.statsRow}>
                  {time !== null ? (
                    <View style={styles.statPill}>
                      <Ionicons name="time-outline" size={12} color={colors.textInverse} />
                      <AppText variant="caption" style={styles.statPillText}>
                        {formatMinutes(time)}
                      </AppText>
                    </View>
                  ) : null}

                  {item.defaultServings ? (
                    <View style={styles.statPill}>
                      <Ionicons name="people-outline" size={12} color={colors.textInverse} />
                      <AppText variant="caption" style={styles.statPillText}>
                        {servingsLabel(item.defaultServings)}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  header: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: 4,
  },
  badgeText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  card: {
    width: HERO_CARD_WIDTH,
    height: 210,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  noImage: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBadgeRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  categoryPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    ...shadows.subtle,
  },
  categoryPillText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  ratingPillText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 11,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '65%',
    justifyContent: 'flex-end',
    padding: spacing.lg,
    zIndex: 1,
  },
  cardTitle: {
    color: colors.textInverse,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  statPillText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '600',
  },
});
