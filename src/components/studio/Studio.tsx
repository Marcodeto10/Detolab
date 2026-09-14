import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Circle,
  Download,
  Images,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  SquareSplitHorizontal,
  Wand2,
  X,
} from 'lucide-react';
import {
  BASE_PRODUCT_PROMPT,
  TOOLS,
  TOOL_ORDER,
  USE_AS,
  baseSlotOf,
  joinList,
  missingFor,
  type Inputs,
  type SlotId,
  type ToolId,
} from '../../lib/tools';
import {
  downloadName,
  downloadUrl,
  fileFromUrl,
  imageFilesFrom,
  makeInput,
  releaseInput,
  uid,
  type InputSource,
} from '../../lib/imageInput';
import {
  buildBulkParts,
  buildParts,
  friendlyError,
  improvePrompt,
  isCancelled,
  requestImage,
  resolveFormat,
} from '../../lib/generate';
import {
  getApiKey,
  loadSettings,
  normalizeSettings,
  ratioLabel,
  saveSettings,
  type StudioSettings,
} from '../../lib/settings';
import { MODELS, TEXT_MODEL, getModelId, ratiosFor, sizesFor, supportsSearch } from '../../lib/models';
import { ModelPicker } from './ModelPicker';
import { logUsage } from '../../lib/usage';
import { useGallery } from '../../lib/galleryContext';
import { useToast } from '../ui/Toast';
import { Button, Label, Menu, Segmented, Select, Toggle } from '../ui/controls';
import { ImageSlot } from './ImageSlot';
import { CompareSlider } from './CompareSlider';
import { GalleryPicker } from '../gallery/GalleryPicker';
import { cn } from '../../lib/utils';

export interface StudioRequest {
  url: string;
  tool: ToolId;
  slot: SlotId;
  nonce: number;
}

interface Generation {
  id: string;
  galleryId?: string;
  /** Si no se pudo guardar en la galería, mostramos el data URL directo */
  fallbackUrl?: string;
  tool: ToolId;
  prompt: string;
  /** Imagen base usada, para el antes/después */
  baseUrl?: string;
  batchId: string;
  createdAt: number;
  error?: string;
  sourceName?: string;
}

interface RunState {
  id: string;
  tool: ToolId;
  batchId: string;
  startedAt: number;
  total: number;
  done: number;
  failed: number;
  controller: AbortController;
}

interface StudioProps {
  visible: boolean;
  tool: ToolId;
  onToolChange: (t: ToolId) => void;
  request: StudioRequest | null;
  onRequestHandled: () => void;
  onOpenGallery: () => void;
  onOpenImage: (galleryId: string, ids?: string[]) => void;
}

const EMPTY_INPUTS: Record<ToolId, Inputs> = { create: {}, edit: {}, mockup: {}, product: {}, bulk: {} };

// Mockup y Product arrancan con su prompt precargado y editable, como en la versión original
const INITIAL_PROMPTS: Record<ToolId, string> = {
  create: '',
  edit: '',
  mockup: TOOLS.mockup.defaultPrompt ?? '',
  product: TOOLS.product.defaultPrompt ?? '',
  bulk: '',
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent);

export const Studio: React.FC<StudioProps> = ({
  visible,
  tool,
  onToolChange,
  request,
  onRequestHandled,
  onOpenGallery,
  onOpenImage,
}) => {
  const toast = useToast();
  const gallery = useGallery();

  const [inputs, setInputs] = useState(EMPTY_INPUTS);
  const [prompts, setPrompts] = useState(INITIAL_PROMPTS);
  const [settings, setSettings] = useState<StudioSettings>(loadSettings);
  const [activeSlot, setActiveSlot] = useState<SlotId | null>(null);
  const [loadingSlot, setLoadingSlot] = useState<SlotId | null>(null);
  const [pickerSlot, setPickerSlot] = useState<SlotId | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkBatchId, setBulkBatchId] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [compare, setCompare] = useState(false);
  const [improving, setImproving] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLElement>(null);

  const spec = TOOLS[tool];
  const toolInputs = inputs[tool];
  const prompt = prompts[tool];
  const missing = missingFor(tool, toolInputs, prompt);
  const model = MODELS[settings.modelType];

  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    setActiveSlot(null);
    setLastError(null);
  }, [tool]);

  useEffect(() => {
    if (!run) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run?.id]);

  const updateSettings = (patch: Partial<StudioSettings>) => setSettings((s) => normalizeSettings({ ...s, ...patch }));

  const imageById = useMemo(() => new Map(gallery.images.map((i) => [i.id, i])), [gallery.images]);
  const urlOf = (g: Generation) => (g.galleryId ? imageById.get(g.galleryId)?.url : g.fallbackUrl);
  // Miniatura liviana para tiras y grillas; la imagen completa solo para verla en grande
  const thumbOf = (g: Generation) =>
    g.galleryId ? imageById.get(g.galleryId)?.thumbUrl ?? urlOf(g) : g.fallbackUrl;

  const slotSpec = (t: ToolId, slotId: SlotId) => TOOLS[t].slots.find((s) => s.id === slotId);

  // --- Imágenes de entrada ---------------------------------------------------

  const addFiles = (t: ToolId, slotId: SlotId, files: File[], source: InputSource) => {
    const slot = slotSpec(t, slotId);
    const valid = imageFilesFrom(files);
    if (!slot || !valid.length) return;

    const incoming = valid.map((f) => makeInput(f, source));
    const currentCount = inputs[t][slotId]?.length ?? 0;
    if (slot.max > 1 && currentCount + incoming.length > slot.max) {
      toast({ message: `${slot.label}: up to ${slot.max} images.` });
    }

    setInputs((prev) => {
      const current = prev[t][slotId] ?? [];
      const next = slot.max === 1 ? incoming.slice(-1) : [...current, ...incoming].slice(0, slot.max);
      const keep = new Set(next.map((i) => i.id));
      [...current, ...incoming].forEach((i) => {
        if (!keep.has(i.id)) releaseInput(i);
      });
      return { ...prev, [t]: { ...prev[t], [slotId]: next } };
    });
    setActiveSlot(slotId);
  };

  const addUrl = async (t: ToolId, slotId: SlotId, url: string, source: InputSource) => {
    setLoadingSlot(slotId);
    try {
      const file = await fileFromUrl(url, slotId);
      addFiles(t, slotId, [file], source);
      return true;
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Couldn't load the image.", tone: 'error' });
      return false;
    } finally {
      setLoadingSlot(null);
    }
  };

  const removeInput = (t: ToolId, slotId: SlotId, id: string) =>
    setInputs((prev) => {
      const current = prev[t][slotId] ?? [];
      const target = current.find((i) => i.id === id);
      if (target) releaseInput(target);
      return { ...prev, [t]: { ...prev[t], [slotId]: current.filter((i) => i.id !== id) } };
    });

  const clearSlot = (t: ToolId, slotId: SlotId) =>
    setInputs((prev) => {
      (prev[t][slotId] ?? []).forEach(releaseInput);
      return { ...prev, [t]: { ...prev[t], [slotId]: [] } };
    });

  // Imagen mandada desde la galería o el visor ("Use in…")
  useEffect(() => {
    if (!request) return;
    const req = request;
    onRequestHandled();
    addUrl(req.tool, req.slot, req.url, 'gallery').then((ok) => {
      if (!ok) return;
      toast({ message: `Image ready in ${TOOLS[req.tool].name}.`, tone: 'success' });
      if (req.tool === 'edit') setTimeout(() => promptRef.current?.focus(), 60);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  // --- Generación ------------------------------------------------------------

  const persist = async (
    dataUrl: string,
    meta: Pick<Generation, 'tool' | 'prompt' | 'batchId' | 'baseUrl'>,
    folderId: string
  ): Promise<Generation> => {
    const base: Generation = { ...meta, id: uid(), createdAt: Date.now() };
    try {
      const saved = await gallery.save(dataUrl, meta.prompt, folderId, { tool: meta.tool, model: getModelId(settings.modelType) });
      return { ...base, galleryId: saved.id };
    } catch (err: any) {
      toast({
        message:
          err?.name === 'QuotaExceededError'
            ? 'Your browser is out of storage. Download and delete old images.'
            : "The image was generated but couldn't be saved to the gallery. Download it.",
        tone: 'error',
      });
      return { ...base, fallbackUrl: dataUrl };
    }
  };

  // Pide la imagen y deja registrado el uso, también si falla o se cancela
  const timedRequest = async (args: Parameters<typeof requestImage>[0], t: ToolId) => {
    const started = performance.now();
    const base = { tool: t, model: getModelId(args.settings.modelType), imageSize: args.settings.imageSize, aspectRatio: args.ratio };
    try {
      const result = await requestImage(args);
      logUsage({ ...base, status: 'success', images: 1, usage: result.usage, durationMs: performance.now() - started });
      return result;
    } catch (err) {
      logUsage({ ...base, status: isCancelled(err) ? 'cancelled' : 'error', images: 0, durationMs: performance.now() - started });
      throw err;
    }
  };

  const generate = async () => {
    if (run) return;
    const t = tool;
    const toolSpec = TOOLS[t];
    const inputsNow = inputs[t];
    const promptNow = prompts[t];

    const need = missingFor(t, inputsNow, promptNow);
    if (need.length) {
      toast({ message: `Missing ${joinList(need)}.`, tone: 'error' });
      return;
    }
    const apiKey = getApiKey();
    if (!apiKey) {
      toast({ message: 'No API key found. Add one in Settings.', tone: 'error' });
      return;
    }

    const s = settings;
    const controller = new AbortController();
    const runId = uid();
    const batchId = uid();
    const label = promptNow.trim() || toolSpec.name;
    setLastError(null);
    setCompare(false);
    if (window.innerWidth < 1024) {
      setTimeout(() => canvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }

    if (t === 'bulk') {
      const bases = inputsNow['bulk-base'] ?? [];
      const reference = inputsNow['bulk-ref']?.[0];
      setBulkBatchId(batchId);
      setRun({ id: runId, tool: t, batchId, startedAt: Date.now(), total: bases.length, done: 0, failed: 0, controller });

      let ok = 0;
      for (let i = 0; i < bases.length; i++) {
        if (controller.signal.aborted) break;
        const item = bases[i];
        try {
          const [parts, format] = await Promise.all([
            buildBulkParts(item, reference, promptNow),
            resolveFormat(s.aspectRatio, s.modelType, item.file),
          ]);
          const { dataUrl } = await timedRequest({ apiKey, parts, settings: s, ratio: format.ratio, dims: format.dims, signal: controller.signal }, t);
          const gen = await persist(dataUrl, { tool: t, prompt: label, batchId, baseUrl: URL.createObjectURL(item.file) }, toolSpec.folderId);
          ok++;
          setGenerations((prev) => [gen, ...prev]);
          setRun((r) => (r?.id === runId ? { ...r, done: r.done + 1 } : r));
        } catch (err) {
          if (isCancelled(err) || controller.signal.aborted) break;
          setGenerations((prev) => [
            { id: uid(), tool: t, prompt: label, batchId, createdAt: Date.now(), error: friendlyError(err, s.modelType), sourceName: item.file.name },
            ...prev,
          ]);
          setRun((r) => (r?.id === runId ? { ...r, failed: r.failed + 1 } : r));
        }
        // Pausa corta entre pedidos para no chocar con el límite de uso
        if (i < bases.length - 1 && !controller.signal.aborted) await wait(1500);
      }

      if (!controller.signal.aborted) {
        const all = ok === bases.length;
        toast({
          message: all ? `Batch done: ${ok} ${ok === 1 ? 'image' : 'images'}.` : `Batch finished: ${ok} of ${bases.length} succeeded.`,
          tone: all ? 'success' : 'error',
        });
      }
      setRun((r) => (r?.id === runId ? null : r));
      return;
    }

    const count = s.count;
    setRun({ id: runId, tool: t, batchId, startedAt: Date.now(), total: count, done: 0, failed: 0, controller });

    try {
      const baseSpec = baseSlotOf(t);
      const baseImg = baseSpec ? inputsNow[baseSpec.id]?.[0] : undefined;
      const [parts, format] = await Promise.all([
        buildParts(t, inputsNow, promptNow, s.useBasePrompt),
        resolveFormat(s.aspectRatio, s.modelType, baseImg?.file),
      ]);
      // En Create las imágenes son referencias, así que no hay antes/después
      const baseUrl = baseImg && t !== 'create' ? URL.createObjectURL(baseImg.file) : undefined;
      const errors: unknown[] = [];
      let shown = false;

      // Las variantes salen en paralelo, apenas escalonadas
      await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          try {
            if (i > 0) await wait(400 * i);
            const { dataUrl } = await timedRequest({ apiKey, parts, settings: s, ratio: format.ratio, dims: format.dims, signal: controller.signal }, t);
            if (controller.signal.aborted) return;
            const gen = await persist(dataUrl, { tool: t, prompt: label, batchId, baseUrl }, toolSpec.folderId);
            setGenerations((prev) => [gen, ...prev]);
            if (!shown) {
              shown = true;
              setSelectedId(gen.id);
            }
            setRun((r) => (r?.id === runId ? { ...r, done: r.done + 1 } : r));
          } catch (err) {
            if (isCancelled(err) || controller.signal.aborted) return;
            errors.push(err);
            setRun((r) => (r?.id === runId ? { ...r, failed: r.failed + 1 } : r));
          }
        })
      );

      if (!controller.signal.aborted && errors.length) {
        const msg = friendlyError(errors[0], s.modelType);
        if (errors.length === count) setLastError(msg);
        toast({ message: errors.length === count ? msg : `${count - errors.length} of ${count} succeeded. ${msg}`, tone: 'error' });
      }
    } catch (err) {
      if (!isCancelled(err)) {
        const msg = friendlyError(err, s.modelType);
        setLastError(msg);
        toast({ message: msg, tone: 'error' });
      }
    } finally {
      setRun((r) => (r?.id === runId ? null : r));
    }
  };

  const cancel = () => {
    if (!run) return;
    run.controller.abort();
    setRun(null);
    toast({ message: 'Cancelled. Anything Google was already processing may still be billed.' });
  };

  const improve = async () => {
    const t = tool;
    const original = prompts[t];
    const apiKey = getApiKey();
    if (!original.trim() || !apiKey) return;
    setImproving(true);
    try {
      const { text: better, usage } = await improvePrompt(apiKey, original);
      logUsage({ tool: 'improve', model: TEXT_MODEL, status: 'success', images: 0, usage });
      setPrompts((p) => ({ ...p, [t]: better }));
      toast({
        message: 'Prompt improved.',
        tone: 'success',
        action: { label: 'Undo', onClick: () => setPrompts((p) => ({ ...p, [t]: original })) },
      });
    } catch (err) {
      toast({ message: friendlyError(err), tone: 'error' });
    } finally {
      setImproving(false);
    }
  };

  const useResultAs = async (g: Generation, t: ToolId, slot: SlotId) => {
    const url = urlOf(g);
    if (!url) return;
    onToolChange(t);
    const ok = await addUrl(t, slot, url, 'result');
    if (!ok) return;
    toast({ message: `Image ready in ${TOOLS[t].name}.`, tone: 'success' });
    if (t === 'edit') setTimeout(() => promptRef.current?.focus(), 60);
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Pegar y atajos --------------------------------------------------------

  const pasteTarget = (): SlotId | null => {
    if (activeSlot && spec.slots.some((s) => s.id === activeSlot)) return activeSlot;
    const open =
      spec.slots.find((s) => s.required && !toolInputs[s.id]?.length) ??
      spec.slots.find((s) => (toolInputs[s.id]?.length ?? 0) < s.max);
    return open?.id ?? null;
  };

  useEffect(() => {
    if (!visible) return;
    const dialogOpen = () => !!document.querySelector('[role="dialog"]');

    const onPaste = (e: ClipboardEvent) => {
      if (dialogOpen()) return;
      const target = pasteTarget();
      if (!target) return;
      const files = imageFilesFrom(e.clipboardData?.files);
      if (files.length) {
        e.preventDefault();
        addFiles(tool, target, files, 'paste');
        toast({ message: `Image pasted into “${slotSpec(tool, target)?.label}”.`, tone: 'success' });
        return;
      }
      const text = e.clipboardData?.getData('text')?.trim() ?? '';
      const inField = (e.target as HTMLElement | null)?.closest?.('input, textarea');
      if (!inField && /^https?:\/\/\S+$/i.test(text)) {
        e.preventDefault();
        addUrl(tool, target, text, 'link');
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !dialogOpen()) {
        e.preventDefault();
        generate();
      }
    };

    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  });

  // --- Datos para la vista ---------------------------------------------------

  const visibleGens = generations.filter((g) => g.error || urlOf(g));
  const sessionThumbs = visibleGens.filter((g) => !g.error);
  const selected = sessionThumbs.find((g) => g.id === selectedId) ?? null;
  const selectedUrl = selected ? urlOf(selected) : undefined;
  const runHere = run && run.tool === tool ? run : null;
  const elapsed = run ? Math.max(0, Math.round((now - run.startedAt) / 1000)) : 0;
  const bulkItems = bulkBatchId ? visibleGens.filter((g) => g.batchId === bulkBatchId).reverse() : [];
  const hasCanvasContent = tool === 'bulk' ? bulkItems.length > 0 || !!runHere : !!selected || !!runHere;
  const bulkCount = toolInputs['bulk-base']?.length ?? 0;
  const promptEdited = !!spec.defaultPrompt && prompt !== spec.defaultPrompt;

  const generateLabel =
    tool === 'bulk'
      ? bulkCount
        ? `Process ${bulkCount} ${bulkCount === 1 ? 'photo' : 'photos'}`
        : 'Process photos'
      : settings.count > 1
        ? `Generate ${settings.count} images`
        : 'Generate';

  const hasImages = spec.slots.some((s) => toolInputs[s.id]?.length);
  const steps = [
    ...spec.slots.filter((s) => s.required).map((s) => ({ label: `Add ${s.label.toLowerCase()}`, done: !!toolInputs[s.id]?.length })),
    tool === 'create'
      ? { label: 'Write a prompt (add images if you want)', done: !!prompt.trim() || hasImages }
      : spec.promptRequired
        ? { label: 'Write the instructions', done: !!prompt.trim() }
        : { label: 'Adjust the prompt if you want', done: true },
    { label: 'Hit Generate', done: false },
  ];

  const renderEmpty = () => (
    <div className="max-w-xs text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-raised grid place-items-center text-faint">
        <Sparkles className="w-6 h-6" />
      </div>
      <p className="mt-5 text-[15px] text-ink">Your result will appear here</p>
      <ul className="mt-5 inline-flex flex-col gap-2.5 text-left">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-[14px]">
            {s.done ? <Check className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-faint" />}
            <span className={s.done ? 'text-faint line-through decoration-white/20' : 'text-muted'}>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const renderLoading = (r: RunState) => (
    <div className="w-full max-w-md aspect-square rounded-3xl bg-raised relative overflow-hidden grid place-items-center">
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.05] to-transparent animate-pulse" />
      <div className="relative text-center px-6">
        <Loader2 className="w-7 h-7 mx-auto animate-spin text-muted" />
        <p className="mt-4 text-[15px]">Generating{r.total > 1 ? ` ${r.total} images` : ''}…</p>
        <p className="mt-1 text-[13px] text-faint tabular-nums">
          {elapsed}s · {MODELS[settings.modelType].label} usually takes 15–60s
        </p>
        <Button className="mt-5" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );

  const renderBulk = () => (
    <div className="w-full">
      {runHere && (
        <div className="rounded-2xl bg-raised p-4">
          <div className="flex items-center justify-between text-[13px]">
            <span>
              Processing {Math.min(runHere.done + runHere.failed + 1, runHere.total)} of {runHere.total}
            </span>
            <span className="text-faint tabular-nums">{elapsed}s</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-500"
              style={{ width: `${((runHere.done + runHere.failed) / Math.max(1, runHere.total)) * 100}%` }}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {bulkItems.map((g) =>
          g.error ? (
            <div key={g.id} className="aspect-square rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3 flex flex-col justify-end">
              <AlertCircle className="w-4 h-4 text-red-400 mb-2" />
              <p className="text-[12px] text-red-200/80 leading-snug line-clamp-5">{g.error}</p>
              {g.sourceName && <p className="mt-1 text-[11px] text-faint truncate">{g.sourceName}</p>}
            </div>
          ) : (
            <button
              key={g.id}
              onClick={() =>
                g.galleryId && onOpenImage(g.galleryId, bulkItems.map((b) => b.galleryId).filter(Boolean) as string[])
              }
              className="aspect-square rounded-xl overflow-hidden bg-white/[0.03]"
            >
              <img src={thumbOf(g)} alt={g.prompt} decoding="async" className="w-full h-full object-cover" />
            </button>
          )
        )}
        {runHere &&
          Array.from({ length: Math.max(0, runHere.total - runHere.done - runHere.failed) }).map((_, i) => (
            <div key={`pending-${i}`} className="aspect-square rounded-xl bg-raised animate-pulse" />
          ))}
      </div>

      {!runHere && bulkItems.some((g) => g.galleryId) && (
        <div className="mt-5 flex justify-center">
          <Button onClick={() => gallery.exportZip(bulkItems.map((g) => g.galleryId).filter(Boolean) as string[])}>
            <Download className="w-4 h-4" />
            Download batch (.zip)
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100dvh-4rem)]">
      {/* Panel de controles */}
      <aside className="lg:w-[400px] xl:w-[420px] shrink-0 flex flex-col lg:h-[calc(100dvh-4rem)] lg:border-r-2 border-line bg-canvas">
        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar">
          <div className="px-4 lg:px-6 pt-4 lg:pt-6 pb-6 space-y-6">
            <div role="tablist" aria-label="Tools" className="lg:hidden grid grid-cols-5 gap-0.5 p-0.5 rounded-[10px] bg-fill">
              {TOOL_ORDER.map((id) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={id === tool}
                  onClick={() => onToolChange(id)}
                  className={cn(
                    'h-8 min-w-0 px-0.5 rounded-[8px] text-[12px] sm:text-[13px] font-semibold truncate transition-all',
                    id === tool ? 'bg-[#636366] text-white shadow-[0_3px_8px_rgba(0,0,0,0.25)]' : 'text-ink/80 hover:text-ink'
                  )}
                >
                  {TOOLS[id].name}
                </button>
              ))}
            </div>

            <header>
              <h1 className="text-[32px] font-bold tracking-tight leading-tight">{spec.name}</h1>
              <p className="mt-2 text-[14px] text-muted leading-relaxed">{spec.description}</p>
            </header>

            <div className="space-y-3">
              {spec.slots.map((slot) => (
                <ImageSlot
                  key={`${tool}-${slot.id}`}
                  spec={slot}
                  images={toolInputs[slot.id] ?? []}
                  active={activeSlot === slot.id}
                  loading={loadingSlot === slot.id}
                  pasteHint={isMac ? '⌘V' : 'Ctrl+V'}
                  onActivate={() => setActiveSlot(slot.id)}
                  onAddFiles={(files) => addFiles(tool, slot.id, files, 'upload')}
                  onAddUrl={(url, source) => addUrl(tool, slot.id, url, source)}
                  onRemove={(id) => removeInput(tool, slot.id, id)}
                  onClear={() => clearSlot(tool, slot.id)}
                  onPickFromGallery={() => setPickerSlot(slot.id)}
                />
              ))}
            </div>

            <div>
              <Label htmlFor="studio-prompt">{spec.promptLabel}</Label>
              <div className="rounded-2xl bg-fill-soft ring-1 ring-transparent focus-within:ring-white/25 transition">
                <textarea
                  id="studio-prompt"
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompts((p) => ({ ...p, [tool]: e.target.value }))}
                  placeholder={spec.promptPlaceholder}
                  rows={spec.defaultPrompt ? 8 : 5}
                  className="block w-full resize-y min-h-[84px] bg-transparent px-3.5 pt-3 pb-1 text-[14px] leading-relaxed text-ink placeholder:text-faint outline-none"
                />
                <div className="flex items-center justify-between gap-2 px-2 pb-2">
                  <span className="px-1.5 text-[12px] text-faint tabular-nums">
                    {prompt.trim() ? `${prompt.trim().split(/\s+/).length} words` : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    {promptEdited && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPrompts((p) => ({ ...p, [tool]: spec.defaultPrompt ?? '' }))}
                        title="Restore the original prompt"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={improve}
                      loading={improving}
                      disabled={!prompt.trim()}
                      title="Rewrites your prompt so the model follows it better"
                    >
                      {!improving && <Wand2 className="w-3.5 h-3.5" />}
                      Improve prompt
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {tool === 'product' && (
              <div className="rounded-2xl bg-fill-soft px-4 py-3.5 space-y-3">
                <Toggle
                  checked={settings.useBasePrompt}
                  onChange={(v) => updateSettings({ useBasePrompt: v })}
                  label="Base prompt"
                  hint="Adds fixed instructions so the product and logo stay exactly as uploaded."
                />
                {settings.useBasePrompt && (
                  <details className="group">
                    <summary className="list-none flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
                      <ChevronDown className="w-3.5 h-3.5 -rotate-90 group-open:rotate-0 transition-transform" />
                      View base prompt
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-sans text-[12px] leading-relaxed text-faint">
                      {BASE_PRODUCT_PROMPT}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label hint={<span className="font-mono">{model.id}</span>}>Model</Label>
                <ModelPicker value={settings.modelType} onChange={(m) => updateSettings({ modelType: m })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Aspect ratio</Label>
                  <Select
                    aria-label="Aspect ratio"
                    value={settings.aspectRatio}
                    onChange={(e) => updateSettings({ aspectRatio: e.target.value })}
                    options={ratiosFor(settings.modelType).map((r) => ({ value: r, label: ratioLabel(r) }))}
                  />
                </div>
                <div>
                  <Label>Size</Label>
                  <Select
                    aria-label="Size"
                    value={settings.imageSize}
                    onChange={(e) => updateSettings({ imageSize: e.target.value })}
                    options={sizesFor(settings.modelType).map((sz) => ({ value: sz, label: sz }))}
                  />
                </div>
              </div>

              {tool !== 'bulk' && (
                <div>
                  <Label hint="Each one is billed separately">Variations</Label>
                  <Segmented
                    ariaLabel="Variations"
                    value={settings.count}
                    onChange={(v) => updateSettings({ count: v })}
                    options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
                  />
                </div>
              )}

              <div className="rounded-2xl bg-fill-soft">
                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  aria-expanded={showMore}
                  className="w-full flex items-center justify-between px-3.5 h-11 text-[13px] font-medium text-muted hover:text-ink"
                >
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4" />
                    More options
                  </span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', showMore && 'rotate-180')} />
                </button>
                {showMore && (
                  <div className="px-3.5 pt-4 pb-4 border-t border-line">
                    <Toggle
                      checked={settings.useSearch && supportsSearch(settings.modelType)}
                      disabled={!supportsSearch(settings.modelType)}
                      onChange={(v) => updateSettings({ useSearch: v })}
                      label="Google Search grounding"
                      hint={
                        supportsSearch(settings.modelType)
                          ? 'Uses real-world info (brands, places, weather) to build the image.'
                          : `Not available with ${model.label}.`
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-16 lg:bottom-0 z-30 px-4 lg:px-6 py-3 lg:py-4 border-t border-line bg-black/85 lg:bg-black/85 backdrop-blur-xl space-y-2">
          {lastError && !run && (
            <p className="flex gap-2 text-[13px] text-red-300 leading-snug">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {lastError}
            </p>
          )}
          {run ? (
            <Button size="lg" className="w-full" onClick={cancel}>
              <X className="w-4 h-4" />
              Cancel {run.tool !== tool ? `(${TOOLS[run.tool].name})` : ''} · {elapsed}s
            </Button>
          ) : (
            <Button size="lg" variant="primary" className="w-full" onClick={generate} disabled={missing.length > 0}>
              <Sparkles className="w-4 h-4" />
              {generateLabel}
            </Button>
          )}
          <p className={cn('text-[12px] text-faint text-center', !missing.length && 'hidden lg:block')}>
            {missing.length ? `Missing ${joinList(missing)}` : `${isMac ? '⌘' : 'Ctrl'} + Enter to generate`}
          </p>
        </div>
      </aside>

      {/* Resultado */}
      <section
        ref={canvasRef}
        className={cn('flex-1 min-w-0 flex flex-col lg:h-[calc(100dvh-4rem)] scroll-mt-14 lg:bg-[radial-gradient(ellipse_at_50%_45%,rgb(255_255_255/0.06),transparent_60%)]', hasCanvasContent && 'order-first lg:order-none')}
      >
        {run && run.tool !== tool && (
          <div className="mx-4 mt-4 lg:mx-8 lg:mt-6 flex items-center gap-3 rounded-2xl bg-raised px-4 py-2.5 text-[13px]">
            <Loader2 className="w-4 h-4 animate-spin text-muted" />
            <span className="flex-1">
              Generating in {TOOLS[run.tool].name}… <span className="text-faint tabular-nums">{elapsed}s</span>
            </span>
            <button className="text-muted hover:text-ink" onClick={() => onToolChange(run.tool)}>
              View
            </button>
          </div>
        )}

        <div
          className={cn(
            'flex p-4 lg:p-8',
            tool === 'bulk'
              ? 'lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar items-start'
              : cn('items-center justify-center lg:flex-1 lg:min-h-0', hasCanvasContent ? 'h-[62dvh] lg:h-auto' : 'min-h-[44dvh] lg:min-h-0')
          )}
        >
          {tool === 'bulk' ? (
            bulkItems.length || runHere ? renderBulk() : <div className="w-full self-center flex justify-center py-10">{renderEmpty()}</div>
          ) : runHere && runHere.done === 0 ? (
            renderLoading(runHere)
          ) : selected && selectedUrl ? (
            compare && selected.baseUrl ? (
              <CompareSlider before={selected.baseUrl} after={selectedUrl} className="w-full h-full" />
            ) : (
              <img src={selectedUrl} alt={selected.prompt} className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.6)]" />
            )
          ) : (
            renderEmpty()
          )}
        </div>

        {tool !== 'bulk' && selected && selectedUrl && (
          <div className="px-4 lg:px-8 pb-4 space-y-3">
            {runHere && runHere.done > 0 && (
              <p className="flex items-center justify-center gap-2 text-[13px] text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generating {Math.min(runHere.done + runHere.failed + 1, runHere.total)} of {runHere.total}…
              </p>
            )}
            <p className="text-center text-[13px] text-faint line-clamp-1" title={selected.prompt}>
              {selected.prompt}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" onClick={() => downloadUrl(selectedUrl, downloadName(selected.tool, selected.galleryId))}>
                <Download className="w-4 h-4" />
                Download
              </Button>
              <Button onClick={() => useResultAs(selected, 'edit', 'edit-base')}>
                <Pencil className="w-4 h-4" />
                Edit this image
              </Button>
              <Menu
                side="top"
                items={USE_AS.slice(1).map((u) => ({ label: u.label, onClick: () => useResultAs(selected, u.tool, u.slot) }))}
                trigger={(open) => (
                  <Button aria-expanded={open}>
                    Use in…
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                )}
              />
              {selected.baseUrl && (
                <Button onClick={() => setCompare((c) => !c)} aria-pressed={compare}>
                  <SquareSplitHorizontal className="w-4 h-4" />
                  {compare ? 'Show result' : 'Before / after'}
                </Button>
              )}
              {selected.tool === tool && !run && (
                <Button variant="ghost" onClick={generate} disabled={missing.length > 0}>
                  <RefreshCw className="w-4 h-4" />
                  Another version
                </Button>
              )}
            </div>
          </div>
        )}

        {tool !== 'bulk' && sessionThumbs.length > 0 && (
          <div className="border-t border-line px-4 lg:px-8 py-3 flex items-center gap-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar p-1 -m-1">
              {sessionThumbs.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelectedId(g.id);
                    setCompare(false);
                  }}
                  aria-label="Show this result"
                  aria-current={g.id === selectedId}
                  className={cn(
                    'shrink-0 w-14 h-14 rounded-lg overflow-hidden ring-2 ring-offset-2 ring-offset-canvas transition duration-200 hover:scale-105 active:scale-95',
                    g.id === selectedId ? 'ring-white' : 'ring-transparent opacity-60 hover:opacity-100'
                  )}
                >
                  <img src={thumbOf(g)} alt="" decoding="async" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="ml-auto shrink-0" onClick={onOpenGallery}>
              <Images className="w-4 h-4" />
              Gallery
            </Button>
          </div>
        )}
      </section>

      <GalleryPicker
        open={!!pickerSlot}
        onClose={() => setPickerSlot(null)}
        onPick={(img) => {
          const slot = pickerSlot;
          setPickerSlot(null);
          if (slot) addUrl(tool, slot, img.url, 'gallery');
        }}
      />
    </div>
  );
};
