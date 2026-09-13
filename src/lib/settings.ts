// Preferencias del usuario, guardadas en su navegador.

import { MODEL_ORDER, ratiosFor, sizesFor, type ModelType } from './models';

// Mismas claves que la versión anterior, así nadie tiene que volver a loguearse.
export const KEY_STORAGE = 'ai-explorer-manual-key';
export const NAME_STORAGE = 'ai-explorer-user-name';
const SETTINGS_STORAGE = 'detolab-settings';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // modo privado o storage bloqueado: seguimos sin guardar
  }
};

export const getApiKey = () => read(KEY_STORAGE);
export const setApiKey = (key: string | null) => write(KEY_STORAGE, key);
export const getUserName = () => read(NAME_STORAGE) || '';
export const setUserName = (name: string | null) => write(NAME_STORAGE, name);

export interface StudioSettings {
  modelType: ModelType;
  aspectRatio: string;
  imageSize: string;
  /** Cuántas variantes generar por pedido */
  count: number;
  useSearch: boolean;
  /** Product: suma el "base prompt" que bloquea producto y logo (como el original) */
  useBasePrompt: boolean;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  modelType: 'flash-v2',
  aspectRatio: 'ORIGINAL',
  imageSize: '1K',
  count: 1,
  useSearch: false,
  useBasePrompt: true,
};

/** Deja las opciones dentro de lo que soporta el modelo elegido. */
export const normalizeSettings = (s: StudioSettings): StudioSettings => {
  const modelType = MODEL_ORDER.includes(s.modelType) ? s.modelType : DEFAULT_SETTINGS.modelType;
  return {
    ...s,
    modelType,
    aspectRatio: ratiosFor(modelType).includes(s.aspectRatio) ? s.aspectRatio : 'ORIGINAL',
    imageSize: sizesFor(modelType).includes(s.imageSize) ? s.imageSize : sizesFor(modelType)[0],
    count: Math.min(4, Math.max(1, Math.round(s.count) || 1)),
    useBasePrompt: s.useBasePrompt !== false,
  };
};

export const loadSettings = (): StudioSettings => {
  try {
    const saved = JSON.parse(read(SETTINGS_STORAGE) || '{}');
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (s: StudioSettings) => write(SETTINGS_STORAGE, JSON.stringify(s));

export const ratioLabel = (r: string) => (r === 'ORIGINAL' ? 'Original photo' : r);
