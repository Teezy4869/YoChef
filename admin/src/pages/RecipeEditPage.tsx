import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAdminAuth } from '@/auth/AdminAuth';
import { hasRole } from '@/lib/supabase';
import {
  coverUrl,
  deleteRecipe,
  emptyForm,
  loadOptions,
  loadRecipe,
  moveRecipe,
  MOVES,
  RecipeSaveError,
  removeCover,
  saveRecipe,
  slugify,
  STATUS_LABEL,
  uploadCover,
  validateForm,
  type IngredientLine,
  type Option,
  type RecipeForm,
  type RecipeStatus,
  type StepLine,
} from '@/lib/recipes';

const input = 'rounded border border-slate-300 px-2 py-1 text-sm';
const btn = 'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50';
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra.');

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {children}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  );
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Create (/recipes/new) or edit (/recipes/:id/edit) a recipe, its ingredients, steps, cover and status. */
export function RecipeEditPage() {
  const { client, roles } = useAdminAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const [options, setOptions] = useState<{ categories: Option[]; ingredients: Option[] } | null>(null);
  const [loaded, setLoaded] = useState<{ id: string | null; status: RecipeStatus; error: string | null } | null>(null);
  const [form, setForm] = useState<RecipeForm>(emptyForm);
  const [savedCover, setSavedCover] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([loadOptions(client), id ? loadRecipe(client, id) : Promise.resolve(null)]).then(
      ([opts, record]) => {
        if (!active) return;
        setOptions(opts);
        if (id && !record) return setLoaded({ id, status: 'draft', error: 'Không tìm thấy công thức.' });
        if (record) {
          setForm(record.form);
          setSavedCover(record.form.coverPath);
        }
        setLoaded({ id: id ?? null, status: record?.status ?? 'draft', error: null });
      },
      (e: unknown) => active && setLoaded({ id: id ?? null, status: 'draft', error: messageOf(e) }),
    );
    return () => {
      active = false;
    };
  }, [client, id, reload]);

  const byName = useMemo(
    () => new Map((options?.ingredients ?? []).map((i) => [i.name.toLowerCase(), i.id] as const)),
    [options],
  );
  const set = <K extends keyof RecipeForm>(key: K, value: RecipeForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setIngredient = (idx: number, patch: Partial<IngredientLine>) =>
    set('ingredients', form.ingredients.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const setStep = (idx: number, patch: Partial<StepLine>) => set('steps', form.steps.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  if (!loaded || !options) return <p role="status">Đang tải…</p>;
  if (loaded.error && !isNew && loaded.id) {
    return (
      <p role="alert" className="text-red-700">
        {loaded.error}
      </p>
    );
  }

  const save = async () => {
    setNotice(null);
    const local = validateForm(form);
    setErrors(local);
    if (Object.keys(local).length) return setNotice({ ok: false, text: 'Hãy sửa các ô được đánh dấu.' });
    setBusy(true);
    try {
      const savedId = await saveRecipe(client, loaded.id, form, byName);
      if (savedCover && savedCover !== form.coverPath && !savedCover.startsWith('https://')) {
        // The replaced cover is unreferenced now; a failure only leaves an orphan file.
        if (!(await removeCover(client, savedCover))) setNotice({ ok: true, text: 'Đã lưu. Không xóa được ảnh bìa cũ.' });
      }
      setSavedCover(form.coverPath);
      setNotice((n) => n ?? { ok: true, text: 'Đã lưu công thức.' });
      if (isNew) navigate(`/recipes/${savedId}/edit`, { replace: true });
      else setReload((r) => r + 1);
    } catch (e) {
      // The new cover would be orphaned by a failed save: remove it and forget it (phase4_08).
      if (form.coverPath && form.coverPath !== savedCover) {
        await removeCover(client, form.coverPath);
        set('coverPath', savedCover);
      }
      setErrors(e instanceof RecipeSaveError ? mapFields(e.fields) : {});
      setNotice({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  const onCover = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    setBusy(true);
    try {
      const path = await uploadCover(client, form.slug, file);
      // An earlier unsaved upload is no longer needed.
      if (form.coverPath && form.coverPath !== savedCover) await removeCover(client, form.coverPath);
      set('coverPath', path);
    } catch (e) {
      setNotice({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  const transition = async (to: RecipeStatus) => {
    if (!loaded.id) return;
    setNotice(null);
    setBusy(true);
    try {
      await moveRecipe(client, loaded.id, to);
      setNotice({ ok: true, text: `Đã chuyển sang "${STATUS_LABEL[to]}".` });
      setReload((r) => r + 1);
    } catch (e) {
      setErrors(e instanceof RecipeSaveError ? mapFields(e.fields) : {});
      setNotice({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!loaded.id) return;
    setBusy(true);
    try {
      await deleteRecipe(client, loaded.id, confirmSlug.trim(), deleteReason.trim());
      navigate('/recipes', { replace: true });
    } catch (e) {
      setNotice({ ok: false, text: messageOf(e) });
      setBusy(false);
    }
  };

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{isNew ? 'Tạo công thức' : form.name || 'Sửa công thức'}</h1>
        <Link to="/recipes" className="text-sm text-orange-800 underline">
          Về danh sách
        </Link>
      </div>
      {!isNew ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm" aria-label="Trạng thái công thức">
          <span>
            Trạng thái: <strong>{STATUS_LABEL[loaded.status]}</strong>
          </span>
          {MOVES[loaded.status].map((to) => (
            <button key={to} type="button" className={`${btn} border border-slate-300`} disabled={busy} onClick={() => void transition(to)}>
              Chuyển sang {STATUS_LABEL[to]}
            </button>
          ))}
          <span className="text-xs text-slate-500">Lưu thay đổi trước khi chuyển trạng thái.</span>
        </div>
      ) : null}
      {notice ? (
        <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'text-green-800' : 'text-red-700'}>
          {notice.text}
        </p>
      ) : null}

      <fieldset className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 font-medium">Thông tin</legend>
        <Field label="Tên món" error={errors.name}>
          <input
            className={input}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: isNew && (!f.slug || f.slug === slugify(f.name)) ? slugify(e.target.value) : f.slug }))}
          />
        </Field>
        <Field label="Slug" error={errors.slug}>
          <input className={`${input} font-mono`} value={form.slug} onChange={(e) => set('slug', e.target.value)} />
        </Field>
        <Field label="Danh mục" error={errors.categoryId}>
          <select className={input} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Chưa chọn</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Độ khó">
          <select className={input} value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
            <option value="">Chưa rõ</option>
            <option value="easy">Dễ</option>
            <option value="medium">Trung bình</option>
            <option value="hard">Khó</option>
          </select>
        </Field>
        <Field label="Khẩu phần mặc định (người)" error={errors.defaultServings}>
          <input className={input} inputMode="numeric" value={form.defaultServings} onChange={(e) => set('defaultServings', e.target.value)} />
        </Field>
        <Field label="Căn cứ khẩu phần">
          <select className={input} value={form.servingBasis} onChange={(e) => set('servingBasis', e.target.value)}>
            <option value="">Chưa rõ</option>
            <option value="book">Theo sách</option>
            <option value="editor_estimate">Biên tập ước tính</option>
            <option value="inferred_yield">Suy ra từ thành phẩm</option>
          </select>
        </Field>
        <Field label="Sơ chế (phút, để trống nếu chưa rõ)" error={errors.prepMinutes}>
          <input className={input} inputMode="numeric" value={form.prepMinutes} onChange={(e) => set('prepMinutes', e.target.value)} />
        </Field>
        <Field label="Nấu (phút, để trống nếu chưa rõ)" error={errors.cookMinutes}>
          <input className={input} inputMode="numeric" value={form.cookMinutes} onChange={(e) => set('cookMinutes', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Mô tả">
            <textarea className={input} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Ghi chú khẩu phần">
            <input className={input} value={form.servingNote} onChange={(e) => set('servingNote', e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Field label="Ảnh bìa (WebP, JPEG hoặc PNG, tối đa 5 MB)" error={errors.coverPath}>
            <input type="file" accept="image/webp,image/jpeg,image/png" disabled={busy} onChange={(e) => void onCover(e.target.files?.[0])} />
          </Field>
          {form.coverPath ? <img src={coverUrl(client, form.coverPath)} alt="Ảnh bìa" className="max-h-40 w-auto rounded" /> : <span className="text-xs text-slate-500">Chưa có ảnh bìa.</span>}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 font-medium">Nguyên liệu</legend>
        {errors.ingredients ? <p className="text-sm text-red-700">{errors.ingredients}</p> : null}
        <datalist id="ingredient-names">
          {options.ingredients.map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
        {form.ingredients.map((line, idx) => (
          <div key={idx} role="group" className="flex flex-wrap items-end gap-2 border-b border-slate-100 pb-2" aria-label={`Nguyên liệu ${idx + 1}`}>
            <Field label="Tên" error={errors[`ingredients.${idx}`]}>
              <input
                className={input}
                list="ingredient-names"
                value={line.name}
                onChange={(e) => setIngredient(idx, { name: e.target.value, ingredientId: byName.get(e.target.value.trim().toLowerCase()) ?? null })}
              />
            </Field>
            <Field label="Căn cứ">
              <select className={input} value={line.basis} onChange={(e) => setIngredient(idx, { basis: e.target.value as IngredientLine['basis'] })}>
                <option value="book">Theo sách</option>
                <option value="editor_estimate">Ước tính</option>
                <option value="to_taste">Vừa ăn</option>
              </select>
            </Field>
            {line.basis !== 'to_taste' ? (
              <>
                <Field label="Số lượng">
                  <input className={`${input} w-24`} inputMode="decimal" value={line.quantity} onChange={(e) => setIngredient(idx, { quantity: e.target.value })} />
                </Field>
                <Field label="Đơn vị">
                  <input className={`${input} w-28`} value={line.unit} onChange={(e) => setIngredient(idx, { unit: e.target.value })} />
                </Field>
              </>
            ) : null}
            <Field label="Sơ chế">
              <input className={input} value={line.preparationNote} onChange={(e) => setIngredient(idx, { preparationNote: e.target.value })} />
            </Field>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={line.isOptional} onChange={(e) => setIngredient(idx, { isOptional: e.target.checked })} /> Không bắt buộc
            </label>
            {!line.ingredientId && line.name.trim() ? <span className="text-xs text-amber-700">Sẽ tạo nguyên liệu mới</span> : null}
            <div className="flex gap-1">
              <button type="button" className={btn} aria-label={`Đưa nguyên liệu ${idx + 1} lên`} onClick={() => set('ingredients', move(form.ingredients, idx, idx - 1))}>↑</button>
              <button type="button" className={btn} aria-label={`Đưa nguyên liệu ${idx + 1} xuống`} onClick={() => set('ingredients', move(form.ingredients, idx, idx + 1))}>↓</button>
              <button type="button" className={`${btn} text-red-700`} aria-label={`Bỏ nguyên liệu ${idx + 1}`} onClick={() => set('ingredients', form.ingredients.filter((_, i) => i !== idx))}>Bỏ</button>
            </div>
          </div>
        ))}
        <button type="button" className={`${btn} self-start border border-slate-300`} onClick={() => set('ingredients', [...form.ingredients, { ...emptyForm().ingredients[0] }])}>
          Thêm nguyên liệu
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 font-medium">Các bước</legend>
        {errors.steps ? <p className="text-sm text-red-700">{errors.steps}</p> : null}
        {form.steps.map((step, idx) => (
          <div key={idx} role="group" className="flex flex-wrap items-end gap-2 border-b border-slate-100 pb-2" aria-label={`Bước ${idx + 1}`}>
            <div className="min-w-[16rem] flex-1">
              <Field label={`Bước ${idx + 1}`} error={errors[`steps.${idx}`]}>
                <textarea className={input} rows={2} value={step.instruction} onChange={(e) => setStep(idx, { instruction: e.target.value })} />
              </Field>
            </div>
            <Field label="Thời lượng (phút)">
              <input className={`${input} w-24`} inputMode="decimal" value={step.durationMinutes} onChange={(e) => setStep(idx, { durationMinutes: e.target.value })} />
            </Field>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={step.timerEnabled} onChange={(e) => setStep(idx, { timerEnabled: e.target.checked })} /> Hẹn giờ
            </label>
            <div className="flex gap-1">
              <button type="button" className={btn} aria-label={`Đưa bước ${idx + 1} lên`} onClick={() => set('steps', move(form.steps, idx, idx - 1))}>↑</button>
              <button type="button" className={btn} aria-label={`Đưa bước ${idx + 1} xuống`} onClick={() => set('steps', move(form.steps, idx, idx + 1))}>↓</button>
              <button type="button" className={`${btn} text-red-700`} aria-label={`Bỏ bước ${idx + 1}`} onClick={() => set('steps', form.steps.filter((_, i) => i !== idx))}>Bỏ</button>
            </div>
          </div>
        ))}
        <button type="button" className={`${btn} self-start border border-slate-300`} onClick={() => set('steps', [...form.steps, { ...emptyForm().steps[0] }])}>
          Thêm bước
        </button>
      </fieldset>

      <button type="button" className={`${btn} self-start bg-orange-700 text-white`} disabled={busy} onClick={() => void save()}>
        {busy ? 'Đang lưu…' : isNew ? 'Tạo bản nháp' : 'Lưu thay đổi'}
      </button>

      {!isNew && hasRole(roles ?? [], ['super_admin']) ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
          <legend className="px-1 font-medium text-red-800">Xóa vĩnh viễn (chỉ super admin)</legend>
          <p className="text-sm text-red-800">Không xóa được công thức đã công bố hoặc đã có yêu thích, đánh giá, bình luận, ảnh. Thao tác không hoàn tác được.</p>
          <Field label={`Gõ lại slug "${form.slug}" để xác nhận`}>
            <input className={input} value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} />
          </Field>
          <Field label="Lý do (bắt buộc)">
            <input className={input} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
          </Field>
          <button
            type="button"
            className={`${btn} self-start bg-red-700 text-white`}
            disabled={busy || confirmSlug.trim() !== form.slug || !deleteReason.trim()}
            onClick={() => void remove()}
          >
            Xóa vĩnh viễn
          </button>
        </fieldset>
      ) : null}
    </section>
  );
}

/** Server field names (snake_case) to the form's. */
function mapFields(fields: Record<string, string>): Record<string, string> {
  const names: Record<string, string> = { category_id: 'categoryId', default_servings: 'defaultServings', cover_image_path: 'coverPath' };
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [names[k] ?? k, v]));
}
