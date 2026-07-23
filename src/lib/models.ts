// Configuración central de modelos.
// Actualizado a los IDs GA (sin sufijo -preview).
// Los IDs con "-preview" quedaron obsoletos cuando los modelos pasaron a GA.

export const TEXT_MODEL = 'gemini-3.6-flash';

export type ModelType = 'pro' | 'flash-v2' | 'flash-lite' | 'legacy';

export interface ModelSpec {
  id: string;
  label: string;
  /** Ratios extendidos (panorámicos / tiras verticales) */
  wideRatios: boolean;
  /** Permite 512px como salida */
  allowsSmall: boolean;
  /** Soporta grounding con Google Search */
  supportsSearch: boolean;
}

export const MODELS: Record<ModelType, ModelSpec> = {
  pro: {
    id: 'gemini-3-pro-image',
    label: 'Pro — Nano Banana Pro',
    wideRatios: false,
    allowsSmall: false,
    supportsSearch: true,
  },
  'flash-v2': {
    id: 'gemini-3.1-flash-image',
    label: 'Nano Banana 2',
    wideRatios: true,
    allowsSmall: true,
    supportsSearch: true,
  },
  'flash-lite': {
    id: 'gemini-3.1-flash-lite-image',
    label: 'Nano Banana 2 Lite — rápido',
    wideRatios: true,
    allowsSmall: true,
    supportsSearch: false,
  },
  legacy: {
    id: 'gemini-2.5-flash-image',
    label: 'Nano Banana 1 (legacy)',
    wideRatios: false,
    allowsSmall: false,
    supportsSearch: false,
  },
};

export const MODEL_ORDER: ModelType[] = ['pro', 'flash-v2', 'flash-lite', 'legacy'];

export const getModelId = (t: ModelType) => (MODELS[t] ?? MODELS.pro).id;

export const supportsSearch = (t: ModelType) => (MODELS[t] ?? MODELS.pro).supportsSearch;

export const ratiosFor = (t: ModelType): string[] => {
  const base = ['ORIGINAL', '1:1', '3:4', '4:3', '9:16', '16:9'];
  return MODELS[t]?.wideRatios ? [...base, '1:4', '1:8', '4:1', '8:1'] : base;
};

export const sizesFor = (t: ModelType): string[] =>
  MODELS[t]?.allowsSmall ? ['512px', '1K', '2K', '4K'] : ['1K', '2K', '4K'];
