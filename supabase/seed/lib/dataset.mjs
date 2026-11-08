// Loads the recipe release candidate zip and normalizes it to the v2 schema
// (docs/database/SCHEMA_V2.md §7). Pure: no database, no network.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { readZip } from './zip.mjs';

// The 8 covers still flagged IMAGE_PENDING after the image audit
// (independent_qa.json, README_IMPORT.md §5, validation_v2.md §4). They are
// not uploaded to the public bucket and their recipes get cover_image_path NULL.
export const QUARANTINED_IMAGE_NUMBERS = [112, 125, 134, 141, 149, 208, 217, 248];

// Bibliographic record from source_provenance.json (imprint-level audit).
// The recipes_working.json header names the book differently; see warnings.
const SOURCE = {
  source_key: 'dieu-thao-2014',
  title: '250 món ăn ngon dễ làm',
  compiler: 'Diệu Thảo (biên soạn)',
  publishers: ['Nhà xuất bản Chính trị quốc gia - Sự thật', 'Nhà xuất bản Thanh niên'],
  publication_year: 2014,
  usage_note: 'Sử dụng cho mục đích giáo dục, lớp học.',
};

export const EXPECTED = Object.freeze({
  recipes: 250,
  published: 236,
  staged: 14,
  categories: 10,
  ingredients: 542,
  recipeIngredients: 2942,
  toTaste: 1024,
  steps: 1166,
  timers: 252,
  nullDurations: 8,
  covers: 250 - QUARANTINED_IMAGE_NUMBERS.length,
});

const blank = (s) => (typeof s === 'string' && s.trim() === '' ? null : (s ?? null));

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function json(entries, name) {
  const buf = entries.get(name);
  if (!buf) throw new Error(`dataset: ${name} missing from zip`);
  return JSON.parse(buf.toString('utf8'));
}

function check(cond, message) {
  if (!cond) throw new Error(`dataset: ${message}`);
}

/**
 * @param {string} zipPath
 * @param {string} expectedSha256  lower-case hex
 * @returns {{ sha256: string, doc: object, covers: {path: string, data: Buffer}[], warnings: string[] }}
 */
export function loadDataset(zipPath, expectedSha256) {
  const zipBuf = readFileSync(zipPath);
  const actual = sha256(zipBuf);
  check(actual === expectedSha256.toLowerCase(), `sha256 mismatch: expected ${expectedSha256}, got ${actual}`);

  const entries = readZip(zipBuf);
  const working = json(entries, 'recipes_working.json');
  const cats = json(entries, 'categories_approved.json').categories;
  const dict = json(entries, 'ingredient_dictionary.fixed.json').ingredients;
  const warnings = [];

  if (working.source_title !== SOURCE.title) {
    warnings.push(
      `recipes_working.json names the source "${working.source_title}"; using the provenance record "${SOURCE.title}" (${SOURCE.compiler}, ${SOURCE.publication_year}).`,
    );
  }

  const categories = cats.map((c, i) => ({
    slug: c.slug,
    name: c.name_vi,
    description: blank(c.description),
    sort_order: i + 1,
  }));

  const ingredients = dict.map((d) => ({
    source_key: d.id,
    slug: d.slug,
    name: d.canonical_name,
    aliases: d.aliases ?? [],
    common_units: d.common_units ?? [],
  }));
  const ingredientNames = new Set(ingredients.map((i) => i.name));
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const quarantined = new Set(QUARANTINED_IMAGE_NUMBERS);

  const covers = [];
  const recipes = working.recipes.map((r) => {
    check(categorySlugs.has(r.primary_category), `${r.slug}: unknown category ${r.primary_category}`);
    check(['ready', 'needs_review'].includes(r.status), `${r.slug}: unknown status ${r.status}`);

    const isQuarantined = quarantined.has(r.source_recipe_number);
    if (isQuarantined) {
      check(r.status === 'needs_review', `${r.slug}: quarantined image on a ready recipe`);
    } else {
      const data = entries.get(`images/${r.cover_image_path}`);
      check(data, `${r.slug}: cover image missing`);
      covers.push({ path: r.cover_image_path, data });
      if (r.issues.some((s) => s.startsWith('IMAGE_DEFECT'))) {
        warnings.push(`${r.slug}: issue text still says IMAGE_DEFECT, but the image audit lists this cover as replaced; kept in review_issues for the editor.`);
      }
    }

    const seen = new Map();
    const ingredientsRows = r.ingredients.map((i) => {
      check(ingredientNames.has(i.name), `${r.slug}: ingredient "${i.name}" not in dictionary`);
      if (seen.has(i.name)) {
        warnings.push(`${r.slug}: "${i.name}" appears twice (sort ${seen.get(i.name)} and ${i.sort_order}); review mapping.`);
      }
      seen.set(i.name, i.sort_order);
      const toTaste = i.quantity_basis === 'to_taste';
      return {
        sort_order: i.sort_order,
        ingredient_name: i.name,
        quantity: toTaste ? null : i.quantity,
        unit: toTaste ? null : blank(i.unit),
        quantity_basis: i.quantity_basis,
        preparation_note: blank(i.preparation_note),
        quantity_note: blank(i.quantity_note),
        is_optional: i.is_optional,
      };
    });

    const steps = r.steps.map((s) => ({
      step_number: s.step_number,
      instruction: s.instruction,
      duration_seconds: s.duration_seconds,
      duration_basis: s.duration_basis === 'unspecified' ? null : s.duration_basis,
      timer_enabled: s.timer_enabled,
    }));

    return {
      source_key: r.source_key,
      source_recipe_number: r.source_recipe_number,
      source_page: r.source_page,
      slug: r.slug,
      name: r.name,
      description: blank(r.description),
      category_slug: r.primary_category,
      difficulty: r.difficulty,
      default_servings: r.default_servings,
      serving_basis: r.serving_basis,
      serving_note: blank(r.serving_note),
      prep_time_minutes: r.prep_time_minutes,
      cook_time_minutes: r.cook_time_minutes,
      cover_image_path: isQuarantined ? null : r.cover_image_path,
      status: r.status === 'ready' ? 'published' : 'staged',
      review_issues: r.issues,
      ingredients: ingredientsRows,
      steps,
    };
  });

  // Counts must match the dataset manifest before anything is generated.
  const flatIng = recipes.flatMap((r) => r.ingredients);
  const flatSteps = recipes.flatMap((r) => r.steps);
  const counts = {
    recipes: recipes.length,
    published: recipes.filter((r) => r.status === 'published').length,
    staged: recipes.filter((r) => r.status === 'staged').length,
    categories: categories.length,
    ingredients: ingredients.length,
    recipeIngredients: flatIng.length,
    toTaste: flatIng.filter((i) => i.quantity === null).length,
    steps: flatSteps.length,
    timers: flatSteps.filter((s) => s.timer_enabled).length,
    nullDurations: flatSteps.filter((s) => s.duration_seconds === null).length,
    covers: covers.length,
  };
  for (const [k, v] of Object.entries(EXPECTED)) check(counts[k] === v, `count ${k}: expected ${v}, got ${counts[k]}`);

  return { sha256: actual, doc: { source: SOURCE, categories, ingredients, recipes }, covers, warnings };
}
