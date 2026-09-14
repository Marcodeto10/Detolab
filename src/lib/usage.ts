// Registro de uso: una fila por pedido a Gemini, guardada en la cuenta del usuario.

import { supabase } from './supabase';
import type { TokenUsage } from './generate';

export type UsageStatus = 'success' | 'error' | 'cancelled';

export interface UsageEventInput {
  tool: string;
  model: string;
  imageSize?: string;
  aspectRatio?: string;
  status: UsageStatus;
  images: number;
  usage?: TokenUsage;
  durationMs?: number;
}

export interface UsageRow {
  id: number;
  tool: string;
  model: string;
  image_size: string | null;
  aspect_ratio: string | null;
  status: UsageStatus;
  images: number;
  prompt_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number | null;
  created_at: string;
}

/** Registra un pedido. No frena la generación: si falla, solo avisa en la consola. */
export const logUsage = (e: UsageEventInput) => {
  supabase
    .from('usage_events')
    .insert({
      tool: e.tool,
      model: e.model,
      image_size: e.imageSize ?? null,
      aspect_ratio: e.aspectRatio ?? null,
      status: e.status,
      images: e.images,
      prompt_tokens: e.usage?.promptTokens ?? null,
      output_tokens: e.usage?.outputTokens ?? null,
      total_tokens: e.usage?.totalTokens ?? null,
      duration_ms: e.durationMs != null ? Math.round(e.durationMs) : null,
    })
    .then(({ error }) => {
      if (error) console.warn('Could not log usage:', error.message);
    });
};

/** Uso del usuario desde una fecha (o todo). */
export const fetchUsage = async (since?: Date): Promise<UsageRow[]> => {
  let query = supabase.from('usage_events').select('*').order('created_at', { ascending: false }).limit(10000);
  if (since) query = query.gte('created_at', since.toISOString());
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UsageRow[];
};
