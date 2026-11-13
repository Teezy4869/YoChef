export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

/** One row of the recipe list. Unknown values are null, never 0 or ''. */
export type RecipeSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  difficulty: Difficulty | null;
  defaultServings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  coverImagePath: string | null;
};

export type Category = { slug: string; name: string };

export type SearchFilters = {
  query: string;
  categorySlug: string | null;
  difficulty: Difficulty | null;
  maxTotalMinutes: number | null;
};

export const EMPTY_FILTERS: SearchFilters = {
  query: '',
  categorySlug: null,
  difficulty: null,
  maxTotalMinutes: null,
};
