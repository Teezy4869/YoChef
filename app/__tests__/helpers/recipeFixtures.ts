// Shared recipe detail fixture, shaped like the PostgREST embedded select.
export function detailRow(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    slug: '001-thit-kho',
    name: 'Thịt lợn kho cốt dừa',
    description: 'Món kho đậm đà.',
    difficulty: 'medium',
    default_servings: 4,
    serving_basis: 'book',
    serving_note: null,
    prep_time_minutes: 15,
    cook_time_minutes: 60,
    cover_image_path: '001-thit-kho/cover.webp',
    category: { slug: 'mon_chinh', name: 'Món chính' },
    source: { title: 'Dieu Thao 2014', compiler: 'Điều Thảo', publication_year: 2014, usage_note: 'Sử dụng cho mục đích giáo dục' },
    recipe_ingredients: [
      { sort_order: 2, quantity: 2.5, unit: 'muỗng canh', quantity_basis: 'book', preparation_note: null, quantity_note: null, is_optional: false, ingredient: { name: 'Nước mắm' } },
      { sort_order: 1, quantity: 500, unit: 'g', quantity_basis: 'book', preparation_note: 'cắt miếng', quantity_note: null, is_optional: false, ingredient: { name: 'Thịt lợn' } },
      { sort_order: 3, quantity: null, unit: null, quantity_basis: 'to_taste', preparation_note: null, quantity_note: null, is_optional: false, ingredient: { name: 'Tiêu' } },
      { sort_order: 4, quantity: 300, unit: 'ml', quantity_basis: 'editor_estimate', preparation_note: null, quantity_note: null, is_optional: true, ingredient: { name: 'Nước dừa' } },
    ],
    recipe_steps: [
      { step_number: 2, instruction: 'Kho nhỏ lửa.', timer_enabled: true, duration_seconds: 2400 },
      { step_number: 1, instruction: 'Ướp thịt.', timer_enabled: false, duration_seconds: null },
    ],
    ...over,
  };
}
