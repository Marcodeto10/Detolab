// Pedidos a la Gemini API: armado del prompt, generación con cancelación real
// y mensajes de error que se entienden.

import { GoogleGenAI } from '@google/genai';
import { TEXT_MODEL, MODELS, getModelId, supportsSearch, ratiosFor, type ModelType } from './models';
import { getImageDimensions, nearestSupportedRatio, conformToOriginal, type Dimensions } from './originalFormat';
import { TOOLS, BASE_PRODUCT_PROMPT, type ToolId, type Inputs } from './tools';
import type { InputImage } from './imageInput';
import type { StudioSettings } from './settings';

const TIMEOUT_MS = 150_000;

type Part = { text: string } | { inlineData: { data: string; mimeType: string } };

export class CancelledError extends Error {
  constructor() {
    super('Cancelado');
    this.name = 'CancelledError';
  }
}

class NoImageError extends Error {
  constructor(public reason: string, public modelText: string) {
    super('NO_IMAGE');
    this.name = 'NoImageError';
  }
}

class TimeoutError extends Error {
  constructor() {
    super('TIMEOUT');
    this.name = 'TimeoutError';
  }
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const imagePart = async (img: InputImage): Promise<Part> => ({
  inlineData: { data: await fileToBase64(img.file), mimeType: img.file.type || 'image/png' },
});

/** Instrucciones fijas de la herramienta + lo que escribió el usuario. */
export const buildPrompt = (toolId: ToolId, prompt: string, strictProduct: boolean): string => {
  const user = prompt.trim();
  let builtIn = TOOLS[toolId].builtInPrompt ?? '';
  if (toolId === 'product' && strictProduct) builtIn = `${BASE_PRODUCT_PROMPT}\n\n${builtIn}`;
  if (builtIn && user) return `${builtIn}\n\nAdditional instructions: ${user}`;
  return builtIn || user || 'Generate an image.';
};

/**
 * Partes del pedido. Solo entran las imágenes de la herramienta activa.
 * Las imágenes van primero y la instrucción al final: el modelo pondera
 * mejor las referencias cuando llegan antes del prompt.
 */
export const buildParts = async (
  toolId: ToolId,
  inputs: Inputs,
  prompt: string,
  strictProduct: boolean
): Promise<Part[]> => {
  const parts: Part[] = [];
  for (const slot of TOOLS[toolId].slots) {
    for (const img of inputs[slot.id] ?? []) {
      parts.push(await imagePart(img));
      parts.push({ text: slot.instruction });
    }
  }
  parts.push({ text: `PROMPT INSTRUCTIONS: ${buildPrompt(toolId, prompt, strictProduct)}` });
  return parts;
};

/** Lote: la referencia (si hay), una foto base y el prompt compartido. */
export const buildBulkParts = async (
  base: InputImage,
  reference: InputImage | undefined,
  prompt: string
): Promise<Part[]> => {
  const [baseSlot, refSlot] = TOOLS.bulk.slots;
  const parts: Part[] = [];
  if (reference) parts.push(await imagePart(reference), { text: refSlot.instruction });
  parts.push(await imagePart(base), { text: baseSlot.instruction });
  parts.push({ text: `PROMPT INSTRUCTIONS: ${prompt.trim() || 'Generate an image.'}` });
  return parts;
};

/** Resuelve "Igual a la foto" al ratio soportado más cercano. */
export const resolveFormat = async (
  aspectRatio: string,
  modelType: ModelType,
  baseFile?: File
): Promise<{ ratio: string; dims: Dimensions | null }> => {
  if (aspectRatio !== 'ORIGINAL') return { ratio: aspectRatio, dims: null };
  if (!baseFile) return { ratio: '1:1', dims: null };
  try {
    const dims = await getImageDimensions(baseFile);
    return { ratio: nearestSupportedRatio(dims, ratiosFor(modelType)), dims };
  } catch {
    return { ratio: '1:1', dims: null };
  }
};

interface RequestImageArgs {
  apiKey: string;
  parts: Part[];
  settings: StudioSettings;
  ratio: string;
  dims: Dimensions | null;
  signal: AbortSignal;
}

/** Pide una imagen. Devuelve un data URL. Se puede cancelar con `signal`. */
export const requestImage = async ({ apiKey, parts, settings, ratio, dims, signal }: RequestImageArgs): Promise<string> => {
  if (signal.aborted) throw new CancelledError();

  const ai = new GoogleGenAI({ apiKey });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), TIMEOUT_MS);
  });
  const cancelled = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new CancelledError()), { once: true });
  });

  try {
    const response: any = await Promise.race([
      ai.models.generateContent({
        model: getModelId(settings.modelType),
        contents: { parts } as any,
        config: {
          imageConfig: { aspectRatio: ratio, imageSize: settings.imageSize },
          tools: settings.useSearch && supportsSearch(settings.modelType) ? [{ googleSearch: {} }] : undefined,
          abortSignal: signal,
        },
      }),
      timeout,
      cancelled,
    ]);

    const candidate = response?.candidates?.[0];
    const imgPart = candidate?.content?.parts?.find((p: any) => p?.inlineData?.data);
    if (!imgPart) {
      const reason = candidate?.finishReason || response?.promptFeedback?.blockReason || '';
      const text = (candidate?.content?.parts ?? [])
        .map((p: any) => p?.text)
        .filter(Boolean)
        .join(' ')
        .trim();
      throw new NoImageError(String(reason), text);
    }

    let url = `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`;
    if (dims) {
      try {
        url = await conformToOriginal(url, dims);
      } catch {
        // si no se puede recortar, devolvemos la imagen tal cual
      }
    }
    return url;
  } catch (err) {
    if (signal.aborted) throw new CancelledError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

/** Google suele devolver el error real dentro de un JSON en el mensaje. */
const apiMessage = (raw: string): string => {
  const start = raw.indexOf('{');
  if (start === -1) return raw;
  try {
    const parsed = JSON.parse(raw.slice(start));
    return parsed?.error?.message || raw;
  } catch {
    return raw;
  }
};

export const isCancelled = (err: unknown) => err instanceof CancelledError;

export const friendlyError = (err: unknown, modelType?: ModelType): string => {
  if (err instanceof TimeoutError) {
    return 'El modelo tardó más de 2 minutos. Probá de nuevo o usá la calidad "Rápido".';
  }
  if (err instanceof NoImageError) {
    if (/SAFETY|PROHIBITED|BLOCK|RECITATION/i.test(err.reason)) {
      return 'El modelo bloqueó el pedido por sus filtros de contenido. Probá reformularlo.';
    }
    return err.modelText
      ? `El modelo no devolvió una imagen. Respondió: “${err.modelText.slice(0, 160)}”`
      : 'El modelo no devolvió una imagen. Probá con instrucciones más concretas.';
  }

  const raw = err instanceof Error ? err.message : String(err ?? '');
  const msg = apiMessage(raw);
  const model = modelType ? MODELS[modelType]?.label : 'ese modelo';

  if (/API key not valid|API_KEY_INVALID/i.test(raw)) return 'La API key no es válida. Cambiala desde Ajustes.';
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(raw)) return 'Llegaste al límite de uso de tu key. Esperá un minuto o revisá tu cuota en Google AI Studio.';
  if (/PERMISSION_DENIED|403/i.test(raw)) return `Tu key no tiene acceso a ${model}. Suele faltar activar la facturación en Google AI Studio. Probá con otra calidad.`;
  if (/NOT_FOUND|404/i.test(raw)) return `${model} no está disponible para tu key. Probá con otra calidad.`;
  if (/UNAVAILABLE|503|500|overloaded|INTERNAL/i.test(raw)) return 'Los servidores de Google están saturados. Probá de nuevo en un rato.';
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return 'No hay conexión. Revisá internet y probá de nuevo.';
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg || 'Algo salió mal. Probá de nuevo.';
};

export const improvePrompt = async (apiKey: string, prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: `You are a prompt engineer for Nano Banana Pro (Gemini 3 Pro Image).
This model plans internally and follows structured, declarative instructions. It does NOT
benefit from piles of adjectives or "cinematic" filler — that degrades adherence.

Rewrite the prompt below so that it:
- States the subject and the intended change as a direct instruction, not a description.
- Specifies camera framing, lens feel, and lighting in concrete terms (only where it matters).
- Names materials, finishes and colours explicitly instead of using vague mood words.
- Says what must stay UNCHANGED from any input image.
- Stays under 150 words. Shorter is better if the intent is already unambiguous.
- Keeps the same language the original prompt is written in.

Do not add stylistic flourishes the user did not ask for.
Return ONLY the rewritten prompt, no preamble, no explanations.

Original Prompt: ${prompt}`,
  });
  const text = response.text?.trim();
  if (!text) throw new Error('No se pudo mejorar el prompt.');
  return text;
};

/** Valida la key con un pedido mínimo de texto. */
export const validateApiKey = async (apiKey: string): Promise<void> => {
  const ai = new GoogleGenAI({ apiKey });
  await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ parts: [{ text: 'hi' }] }],
    config: { maxOutputTokens: 1 },
  });
};
