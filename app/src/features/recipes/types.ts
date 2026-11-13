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

export type QuantityBasis = 'book' | 'editor_estimate' | 'to_taste';
export type ServingBasis = 'book' | 'editor_estimate' | 'inferred_yield';

export type IngredientLine = {
  sortOrder: number;
  name: string;
  /** null for "to taste" (vừa ăn); never 0. */
  quantity: number | null;
  unit: string | null;
  basis: QuantityBasis;
  preparationNote: string | null;
  quantityNote: string | null;
  isOptional: boolean;
};

export type RecipeStep = {
  stepNumber: number;
  instruction: string;
  timerEnabled: boolean;
  /** null when the book gives no duration. */
  durationSeconds: number | null;
};

export type RecipeSource = {
  title: string;
  compiler: string | null;
  publicationYear: number | null;
  usageNote: string | null;
};

export type RecipeDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categoryName: string | null;
  difficulty: Difficulty | null;
  defaultServings: number | null;
  servingBasis: ServingBasis | null;
  servingNote: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  coverImagePath: string | null;
  source: RecipeSource | null;
  ingredients: IngredientLine[];
  steps: RecipeStep[];
};
