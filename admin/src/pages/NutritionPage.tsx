import { useEffect, useState, type FormEvent } from 'react';

import { useAdminAuth } from '@/auth/AdminAuth';
import {
  calculate,
  findRecipes,
  listConversions,
  listIngredients,
  NUTRIENTS,
  REASON_LABEL,
  saveConversion,
  saveMapping,
  searchUsda,
  show,
  STATUS_LABEL,
  verifyConversion,
  verifyMapping,
  verifyRecipe,
  type CanonicalFood,
  type Conversion,
  type IngredientRow,
  type RecipeResult,
} from '@/lib/nutrition';

const input = 'rounded border border-slate-300 px-2 py-1 text-sm';
const btn = 'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50';
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra.');
type Notice = { ok: boolean; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  return notice ? (
    <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'text-green-800' : 'text-red-700'}>
      {notice.text}
    </p>
  ) : null;
}

/** Ingredient mappings (USDA), unit conversions and recipe results; all official values need verification. */
export function NutritionPage() {
  const [tab, setTab] = useState<'ingredients' | 'units' | 'recipes'>('ingredients');
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Dinh dưỡng</h1>
      <p className="text-sm text-slate-600">
        Giá trị chỉ được tính và công bố khi nguyên liệu, quy đổi và kết quả đều đã xác minh. Giá trị chưa rõ hiện là “—”, không phải 0.
      </p>
      <div role="tablist" className="flex gap-2">
        {([['ingredients', 'Nguyên liệu'], ['units', 'Quy đổi đơn vị'], ['recipes', 'Công thức']] as const).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`${btn} ${tab === t ? 'bg-orange-700 text-white' : 'border border-slate-300'}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'ingredients' ? <IngredientsTab /> : tab === 'units' ? <UnitsTab /> : <RecipesTab />}
    </section>
  );
}

function IngredientsTab() {
  const { client } = useAdminAuth();
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<{ key: string; list: IngredientRow[]; error: string | null } | null>(null);
  const [picked, setPicked] = useState<IngredientRow | null>(null);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<CanonicalFood[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const key = `${search}#${attempt}`;

  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      listIngredients(client, search).then(
        (list) => active && setRows({ key, list, error: null }),
        (e: unknown) => active && setRows({ key, list: [], error: messageOf(e) }),
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [client, search, key]);

  const act = async (work: () => Promise<void>, done: string) => {
    setNotice(null);
    setBusy(true);
    try {
      await work();
      setNotice({ ok: true, text: done });
      setAttempt((a) => a + 1);
    } catch (e) {
      setNotice({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };
  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      setFoods(await searchUsda(client, query));
    } catch (err) {
      setFoods(null);
      setNotice({ ok: false, text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  };
  const current = rows?.list.find((r) => r.id === picked?.id) ?? picked;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Tìm nguyên liệu
          <input className={input} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {!rows || rows.key !== key ? <p role="status">Đang tải…</p> : rows.error ? <p role="alert" className="text-red-700">{rows.error}</p> : (
          <ul className="flex max-h-[32rem] flex-col overflow-auto rounded border border-slate-200 bg-white">
            {rows.list.map((r) => (
              <li key={r.id}>
                <button type="button" className={`flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${picked?.id === r.id ? 'bg-orange-50' : ''}`}
                  onClick={() => (setPicked(r), setFoods(null), setQuery(''), setNotice(null))}>
                  <span>{r.name}</span>
                  <span className="text-xs text-slate-500">{STATUS_LABEL[r.mapping?.status ?? 'UNMAPPED']}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {current ? (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4" aria-label={`Dinh dưỡng của ${current.name}`}>
          <h2 className="text-lg font-semibold">{current.name}</h2>
          <p className="text-sm">
            Trạng thái: <strong>{STATUS_LABEL[current.mapping?.status ?? 'UNMAPPED']}</strong>
            {current.mapping?.description ? ` · USDA ${current.mapping.externalId}: ${current.mapping.description}` : ''}
          </p>
          {current.mapping ? (
            <dl className="grid grid-cols-2 gap-1 text-sm">
              {NUTRIENTS.map(([k, label, unit]) => (
                <div key={k} className="flex justify-between gap-2"><dt>{label} /100 g</dt><dd>{show(current.mapping!.values[k], unit)}</dd></div>
              ))}
            </dl>
          ) : null}
          <div className="flex gap-2">
            {current.mapping && ['CANDIDATE', 'NEEDS_REVIEW'].includes(current.mapping.status) ? (
              <button type="button" className={`${btn} bg-green-700 text-white`} disabled={busy} onClick={() => act(() => verifyMapping(client, current.id), 'Đã xác minh.')}>
                Xác minh
              </button>
            ) : null}
            <button type="button" className={`${btn} border border-slate-300`} disabled={busy} onClick={() => act(() => saveMapping(client, current.id, null, 'UNAVAILABLE'), 'Đã ghi nhận không có dữ liệu.')}>
              Không có dữ liệu
            </button>
          </div>
          <form onSubmit={lookup} className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Tìm trên USDA (tiếng Anh, ví dụ “pork loin raw”)
              <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} />
            </label>
            <button type="submit" className={`${btn} border border-slate-300`} disabled={busy || !query.trim()}>Tìm</button>
          </form>
          <NoticeLine notice={notice} />
          {foods ? (
            foods.length === 0 ? <p className="text-sm text-slate-600">Không có kết quả.</p> : (
              <ul className="flex flex-col gap-2">
                {foods.map((f) => (
                  <li key={f.externalId} className="rounded border border-slate-200 p-2 text-sm" aria-label={`USDA ${f.externalId}`}>
                    <p className="font-medium">{f.description}</p>
                    <p className="text-xs text-slate-500">
                      {f.dataType} · {f.basis ? 'trên 100 g' : 'không rõ căn cứ, không dùng được'}
                    </p>
                    <p className="text-xs">
                      {show(f.nutrients.energyKcal, 'kcal')} · đạm {show(f.nutrients.proteinG, 'g')} · béo {show(f.nutrients.fatG, 'g')} · bột {show(f.nutrients.carbsG, 'g')} · natri {show(f.nutrients.sodiumMg, 'mg')}
                    </p>
                    <button type="button" className={`${btn} mt-1 border border-slate-300`} disabled={busy || !f.basis}
                      onClick={() => act(() => saveMapping(client, current.id, f, 'CANDIDATE'), 'Đã lưu làm ứng viên. Kiểm tra rồi bấm Xác minh.')}>
                      Dùng thực phẩm này
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : (
        <p className="text-slate-600">Chọn một nguyên liệu.</p>
      )}
    </div>
  );
}

function UnitsTab() {
  const { client } = useAdminAuth();
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<{ attempt: number; rows: Conversion[]; error: string | null } | null>(null);
  const [form, setForm] = useState({ unit: '', grams: '', ingredientId: '', source: '', method: '' });
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let active = true;
    listConversions(client).then(
      (rows) => active && setList({ attempt, rows, error: null }),
      (e: unknown) => active && setList({ attempt, rows: [], error: messageOf(e) }),
    );
    return () => {
      active = false;
    };
  }, [client, attempt]);
  useEffect(() => {
    listIngredients(client, '').then(setIngredients, () => setIngredients([]));
  }, [client]);

  const act = async (work: () => Promise<void>, done: string) => {
    setNotice(null);
    setBusy(true);
    try {
      await work();
      setNotice({ ok: true, text: done });
      setAttempt((a) => a + 1);
    } catch (e) {
      setNotice({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act(
      () => saveConversion(client, { ...form, ingredientId: form.ingredientId || null, grams: Number(form.grams.replace(',', '.')) }),
      'Đã lưu quy đổi (chưa xác minh).',
    ).then(() => setForm({ unit: '', grams: '', ingredientId: '', source: '', method: '' }));
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">Đơn vị<input className={input} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-sm">Số gam cho 1 đơn vị<input className={`${input} w-28`} inputMode="decimal" value={form.grams} onChange={(e) => setForm({ ...form, grams: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-sm">
          Áp dụng cho
          <select className={input} value={form.ingredientId} onChange={(e) => setForm({ ...form, ingredientId: e.target.value })}>
            <option value="">Mọi nguyên liệu</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Nguồn<input className={input} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-sm">Cách đo<input className={input} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} /></label>
        <button type="submit" className={`${btn} bg-orange-700 text-white`} disabled={busy}>Lưu quy đổi</button>
      </form>
      <NoticeLine notice={notice} />
      {!list ? <p role="status">Đang tải…</p> : list.error ? <p role="alert" className="text-red-700">{list.error}</p> : (
        <table className="w-full border-collapse bg-white text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-600"><th className="p-2">Đơn vị</th><th className="p-2">Gam</th><th className="p-2">Áp dụng cho</th><th className="p-2">Nguồn · cách đo</th><th className="p-2">Xác minh</th></tr></thead>
          <tbody>
            {list.rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="p-2">{c.unit}</td>
                <td className="p-2">{String(c.grams).replace('.', ',')}</td>
                <td className="p-2">{c.ingredientName ?? 'Mọi nguyên liệu'}</td>
                <td className="p-2">{[c.source, c.method].filter(Boolean).join(' · ') || '—'}</td>
                <td className="p-2">
                  {c.verified ? 'Đã xác minh' : (
                    <button type="button" className={`${btn} border border-slate-300`} disabled={busy} aria-label={`Xác minh quy đổi ${c.unit}`}
                      onClick={() => act(() => verifyConversion(client, c.id), 'Đã xác minh quy đổi.')}>
                      Xác minh
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RecipesTab() {
  const { client } = useAdminAuth();
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; status: string; nutrition: string | null }[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [result, setResult] = useState<RecipeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      setFound(await findRecipes(client, search));
    } catch (err) {
      setNotice({ ok: false, text: messageOf(err) });
    }
  };
  const run = async (recipe: { id: string; name: string }) => {
    setPicked(recipe);
    setNotice(null);
    setBusy(true);
    try {
      const res = await calculate(client, recipe.id);
      setResult(res);
      setFound((f) => f.map((x) => (x.id === recipe.id ? { ...x, nutrition: res.status } : x)));
    } catch (e) {
      setResult(null);
      setNotice({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await verifyRecipe(client, picked.id);
      setResult((r) => (r ? { ...r, status: 'VERIFIED' } : r));
      setFound((f) => f.map((x) => (x.id === picked.id ? { ...x, nutrition: 'VERIFIED' } : x)));
      setNotice({ ok: true, text: 'Đã xác minh. Kết quả hiện công khai nếu công thức đã công bố.' });
    } catch (e) {
      setNotice({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={lookup} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">Tìm công thức<input className={input} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <button type="submit" className={`${btn} border border-slate-300`}>Tìm</button>
      </form>
      {found.length ? (
        <ul className="flex flex-col gap-1">
          {found.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span>{r.name}</span>
              <span className="text-xs text-slate-500">{r.nutrition ? STATUS_LABEL[r.nutrition] : 'Chưa tính'}</span>
              <button type="button" className={`${btn} border border-slate-300`} disabled={busy} aria-label={`Tính dinh dưỡng ${r.name}`} onClick={() => void run(r)}>Tính</button>
            </li>
          ))}
        </ul>
      ) : null}
      <NoticeLine notice={notice} />
      {picked && result ? (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Kết quả dinh dưỡng">
          <h2 className="text-lg font-semibold">{picked.name}</h2>
          <p className="text-sm">
            Trạng thái: <strong>{STATUS_LABEL[result.status] ?? result.status}</strong> · đủ dữ liệu {Math.round(result.completeness * 100)}%
          </p>
          <table className="text-sm">
            <thead><tr className="text-left text-slate-600"><th className="pr-4">Chất</th><th className="pr-4">Cả món</th><th>Mỗi phần</th></tr></thead>
            <tbody>
              {NUTRIENTS.map(([k, label, unit]) => (
                <tr key={k}><td className="pr-4">{label}</td><td className="pr-4">{show(result.totals[k], unit)}</td><td>{show(result.per_serving?.[k], unit)}</td></tr>
              ))}
            </tbody>
          </table>
          {result.breakdown.some((b) => b.reasons.length) ? (
            <ul className="list-disc pl-5 text-sm text-amber-800">
              {result.breakdown.filter((b) => b.reasons.length).map((b) => (
                <li key={b.ingredient_id}>{b.name}: {b.reasons.map((r) => REASON_LABEL[r] ?? r).join(', ')}</li>
              ))}
            </ul>
          ) : null}
          {result.status === 'CALCULATED' ? (
            <button type="button" className={`${btn} self-start bg-green-700 text-white`} disabled={busy} onClick={() => void verify()}>Xác minh kết quả</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
