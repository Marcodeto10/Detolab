import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Eye, EyeOff, LogOut } from 'lucide-react';
import { avatarUrl, displayName, useAuth } from '../lib/auth';
import { useGallery } from '../lib/galleryContext';
import { fetchUsage, type UsageRow } from '../lib/usage';
import { formatBytes } from '../lib/gallery';
import { MODELS, MODEL_ORDER, TEXT_MODEL } from '../lib/models';
import { getApiKey, setApiKey } from '../lib/settings';
import { friendlyError, isInvalidKeyError, validateApiKey } from '../lib/generate';
import { Button, Segmented } from './ui/controls';
import { useDialog } from './ui/Dialog';
import { useToast } from './ui/Toast';
import { cn } from '../lib/utils';

type Period = 7 | 30 | 90 | 0;

const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 0, label: 'All time' },
];

// Color de la serie (un solo tono, validado contra la superficie oscura de las tarjetas)
const SERIES = '#3987e5';
const DAY_MS = 24 * 60 * 60 * 1000;

const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const grouped = (n: number) => new Intl.NumberFormat('en-US').format(n);

const modelLabel = (id: string) => {
  if (id === TEXT_MODEL) return 'Prompt improver';
  const type = MODEL_ORDER.find((m) => MODELS[m].id === id);
  return type ? MODELS[type].label : id;
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Tope "redondo" para el eje: 1, 2, 5, 10, 20, 50… */
const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};

const StatTile: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div className="rounded-2xl bg-raised p-5">
    <p className="text-[13px] text-muted">{label}</p>
    <p className="mt-2 text-[34px] font-semibold tracking-tight leading-none">{value}</p>
    {note && <p className="mt-2 text-[12px] text-faint">{note}</p>}
  </div>
);

/** Columnas de imágenes por día, con tooltip por columna. */
const DailyChart: React.FC<{ days: { date: Date; images: number }[] }> = ({ days }) => {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...days.map((d) => d.images)));
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const ticks = [max, max / 2, 0];

  return (
    <div>
      <div className="relative flex gap-3">
        {/* Eje Y */}
        <div className="flex flex-col justify-between h-44 text-[11px] text-faint tabular-nums text-right w-7 shrink-0 -my-1.5">
          {ticks.map((t) => (
            <span key={t}>{Number.isInteger(t) ? grouped(t) : t.toFixed(1)}</span>
          ))}
        </div>

        <div className="relative flex-1 h-44">
          {/* Líneas guía */}
          {ticks.map((t, i) => (
            <div key={t} className="absolute inset-x-0 border-t border-[#2c2c2a]" style={{ top: `${(i / 2) * 100}%` }} />
          ))}

          <div className="absolute inset-0 flex items-end gap-0.5" onPointerLeave={() => setActive(null)}>
            {days.map((d, i) => (
              <div
                key={dayKey(d.date)}
                tabIndex={0}
                role="img"
                aria-label={`${fmt(d.date)}: ${d.images} ${d.images === 1 ? 'image' : 'images'}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="relative flex-1 h-full flex items-end justify-center outline-none"
              >
                {d.images > 0 && (
                  <div
                    className="w-full max-w-6 rounded-t-[4px] transition-opacity"
                    style={{
                      height: `${(d.images / max) * 100}%`,
                      background: SERIES,
                      opacity: active === null || active === i ? 1 : 0.55,
                    }}
                  />
                )}
                {active === i && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-lg bg-[#2c2c2e] border border-white/10 px-2.5 py-1.5 shadow-xl pointer-events-none">
                    <p className="text-[13px] font-semibold text-ink">
                      {grouped(d.images)} {d.images === 1 ? 'image' : 'images'}
                    </p>
                    <p className="text-[11px] text-muted">{fmt(d.date)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Eje X: primera, media y última fecha */}
      <div className="ml-10 mt-2 flex justify-between text-[11px] text-faint">
        <span>{fmt(days[0].date)}</span>
        <span>{fmt(days[Math.floor(days.length / 2)].date)}</span>
        <span>{fmt(days[days.length - 1].date)}</span>
      </div>
    </div>
  );
};

interface AccountViewProps {
  onKeyRemoved: () => void;
}

export const AccountView: React.FC<AccountViewProps> = ({ onKeyRemoved }) => {
  const { user, signOut } = useAuth();
  const { images, usedBytes } = useGallery();
  const { confirm } = useDialog();
  const toast = useToast();

  const [period, setPeriod] = useState<Period>(30);
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const name = displayName(user);
  const avatar = avatarUrl(user);
  const currentKey = getApiKey() ?? '';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setUsageError(null);
    fetchUsage(period ? new Date(Date.now() - period * DAY_MS) : undefined)
      .then((data) => alive && setRows(data))
      .catch((err) => alive && setUsageError(err instanceof Error ? err.message : "Couldn't load usage."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [period]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const imageRows = list.filter((r) => r.tool !== 'improve');
    const generated = imageRows.reduce((s, r) => s + r.images, 0);
    const failed = imageRows.filter((r) => r.status === 'error').length;
    const tokens = list.reduce((s, r) => s + (r.total_tokens ?? 0), 0);

    // Columnas por día: el período elegido, o los últimos 90 días en "All time"
    const span = period || 90;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const perDay = new Map<string, number>();
    imageRows.forEach((r) => {
      const k = dayKey(new Date(r.created_at));
      perDay.set(k, (perDay.get(k) ?? 0) + r.images);
    });
    const days = Array.from({ length: span }, (_, i) => {
      const date = new Date(today.getTime() - (span - 1 - i) * DAY_MS);
      return { date, images: perDay.get(dayKey(date)) ?? 0 };
    });

    const byModel = new Map<string, { images: number; requests: number; tokens: number }>();
    list.forEach((r) => {
      const m = byModel.get(r.model) ?? { images: 0, requests: 0, tokens: 0 };
      m.images += r.images;
      m.requests += 1;
      m.tokens += r.total_tokens ?? 0;
      byModel.set(r.model, m);
    });
    const models = [...byModel.entries()]
      .map(([id, v]) => ({ id, label: modelLabel(id), ...v }))
      .sort((a, b) => b.images - a.images || b.requests - a.requests);

    return { generated, requests: imageRows.length, failed, tokens, days, models };
  }, [rows, period]);

  const maxModelImages = Math.max(1, ...stats.models.map((m) => m.images));

  const saveKey = async () => {
    const k = newKey.trim();
    if (k.length < 10) {
      setKeyError('That key looks incomplete.');
      return;
    }
    setSavingKey(true);
    setKeyError(null);
    try {
      await validateApiKey(k);
      setApiKey(k);
      setEditingKey(false);
      setNewKey('');
      toast({ message: 'API key updated.', tone: 'success' });
    } catch (err) {
      setKeyError(isInvalidKeyError(err) ? "That key isn't valid. Make sure you copied all of it." : friendlyError(err));
    } finally {
      setSavingKey(false);
    }
  };

  const removeKey = async () => {
    const ok = await confirm({
      title: 'Remove API key',
      message: "The key will be removed from this browser. You'll need to paste it again to generate.",
      confirmLabel: 'Remove key',
      danger: true,
    });
    if (!ok) return;
    setApiKey(null);
    onKeyRemoved();
  };

  const handleSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out',
      message: 'Your images stay in your account. The API key is removed from this browser.',
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (!ok) return;
    setApiKey(null);
    await signOut();
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 lg:px-10 lg:py-10 space-y-10">
      {/* Perfil */}
      <section className="flex flex-wrap items-center gap-4">
        {avatar ? (
          <img src={avatar} alt="" referrerPolicy="no-referrer" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <span className="w-16 h-16 rounded-full bg-gradient-to-br from-[#8e8e93] to-[#48484a] grid place-items-center text-2xl font-semibold uppercase">
            {name[0] ?? 'D'}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight truncate">{name || 'Your account'}</h1>
          <p className="text-[15px] text-muted truncate">{user?.email}</p>
        </div>
        <Button className="sm:ml-auto" onClick={handleSignOut}>
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </section>

      {/* API key */}
      <section className="rounded-2xl bg-raised p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold">Gemini API key</h2>
            <p className="mt-1 text-[13px] text-muted">Stored only in this browser and sent directly to Google.</p>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"
          >
            Manage keys in Google AI Studio
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {!editingKey ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="h-10 px-3.5 rounded-[10px] bg-fill flex items-center font-sans text-[14px] text-muted tracking-wider">
              {currentKey ? `••••••••${currentKey.slice(-4)}` : 'No key'}
            </code>
            <Button onClick={() => setEditingKey(true)}>Change</Button>
            <Button variant="ghost" className="text-red-300 hover:text-red-200 hover:bg-red-500/10" onClick={removeKey}>
              Remove from this browser
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveKey();
            }}
            className="mt-4 space-y-2 max-w-lg"
          >
            <div className="relative">
              <input
                autoFocus
                type={showKey ? 'text' : 'password'}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Paste your new key"
                autoComplete="off"
                spellCheck={false}
                className="input pr-11"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-faint hover:text-ink"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {keyError && <p className="text-[13px] text-red-300">{keyError}</p>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={savingKey}>
                Validate & save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingKey(false);
                  setKeyError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* Uso */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight">Usage</h2>
            <p className="mt-1 text-[13px] text-muted">Requests made from Detolab with your account.</p>
          </div>
          <Segmented ariaLabel="Period" value={period} onChange={setPeriod} options={PERIODS} className="w-full sm:w-auto sm:min-w-[340px]" />
        </div>

        {usageError ? (
          <p className="rounded-2xl bg-raised p-6 text-[14px] text-red-300">{usageError}</p>
        ) : (
          <div className={cn('space-y-5 transition-opacity', loading && rows && 'opacity-50')}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Images generated" value={rows ? grouped(stats.generated) : '–'} />
              <StatTile
                label="Requests"
                value={rows ? grouped(stats.requests) : '–'}
                note={rows ? (stats.failed ? `${grouped(stats.failed)} failed` : 'None failed') : undefined}
              />
              <StatTile label="Tokens" value={rows ? compact(stats.tokens) : '–'} note="As reported by Google" />
              <StatTile label="Gallery storage" value={formatBytes(usedBytes)} note={`${grouped(images.length)} images saved`} />
            </div>

            <div className="rounded-2xl bg-raised p-5 lg:p-6">
              <div className="flex items-baseline justify-between gap-3 mb-5">
                <h3 className="text-[15px] font-semibold">Images per day</h3>
                <span className="text-[12px] text-faint">{period ? `Last ${period} days` : 'Last 90 days'}</span>
              </div>
              {rows && stats.generated > 0 ? (
                <DailyChart days={stats.days} />
              ) : (
                <p className="h-44 grid place-items-center text-[14px] text-muted">{rows ? 'No images in this period yet.' : 'Loading…'}</p>
              )}
            </div>

            <div className="rounded-2xl bg-raised p-5 lg:p-6">
              <h3 className="text-[15px] font-semibold mb-4">By model</h3>
              {stats.models.length === 0 ? (
                <p className="text-[14px] text-muted">{rows ? 'Nothing here yet.' : 'Loading…'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="text-left text-[12px] text-faint">
                        <th className="font-medium pb-2 pr-4">Model</th>
                        <th className="font-medium pb-2 pr-4 text-right sm:text-left sm:w-[40%]">Images</th>
                        <th className="font-medium pb-2 pr-4 text-right">Requests</th>
                        <th className="font-medium pb-2 text-right">Tokens</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {stats.models.map((m) => (
                        <tr key={m.id} className="border-t border-line">
                          <td className="py-2.5 pr-4">
                            <p className="text-ink">{m.label}</p>
                            <p className="hidden sm:block text-[11px] text-faint font-mono">{m.id}</p>
                          </td>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center justify-end sm:justify-start gap-2.5">
                              <div className="hidden sm:block flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(m.images / maxModelImages) * 100}%`, background: SERIES }} />
                              </div>
                              <span className="w-10 text-right text-ink">{grouped(m.images)}</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 text-right text-muted">{grouped(m.requests)}</td>
                          <td className="py-2.5 text-right text-muted">{compact(m.tokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-[12px] text-faint leading-relaxed">
              Google bills your API key directly. For exact costs, check billing in Google AI Studio.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
