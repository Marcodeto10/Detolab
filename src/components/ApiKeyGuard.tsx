import React, { useState } from 'react';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';
import { Logo } from './Icons';
import { Button } from './ui/controls';
import { getApiKey, setApiKey, setUserName } from '../lib/settings';
import { friendlyError, validateApiKey } from '../lib/generate';

const LOGIN_BG = 'https://i.pinimg.com/1200x/34/69/9e/34699eca0b59961a9490f5279181afe4.jpg';

export const ApiKeyGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasKey, setHasKey] = useState(() => !!getApiKey());
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hasKey) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = key.trim();
    if (k.length < 10) {
      setError('Esa key parece incompleta.');
      return;
    }
    setValidating(true);
    setError(null);
    try {
      // BYOK: validamos con un pedido mínimo y la key queda solo en este navegador.
      await validateApiKey(k);
      setApiKey(k);
      if (name.trim()) setUserName(name.trim());
      setHasKey(true);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/API key not valid|API_KEY_INVALID/i.test(raw) ? 'Esa key no es válida. Revisá que la copiaste completa.' : friendlyError(err));
    } finally {
      setValidating(false);
    }
  };

  return (
    <div
      className="relative min-h-dvh flex items-center justify-center p-5 sm:p-8 text-white bg-canvas bg-cover bg-center"
      style={{ backgroundImage: `url("${LOGIN_BG}")` }}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative w-full max-w-md space-y-8">
        <Logo className="w-44 h-auto mx-auto" />

        <form onSubmit={submit} className="glass-card p-6 sm:p-8 space-y-5 shadow-2xl">
          <div>
            <h1 className="font-display text-4xl leading-none">Entrá a tu estudio</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-white/75">
              Detolab funciona con tu propia API key de Google Gemini. Se guarda solo en este navegador.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label htmlFor="login-name" className="text-[13px] font-medium">
                Tu nombre
              </label>
              <span className="text-[12px] text-white/50">Opcional</span>
            </div>
            <input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Sofía"
              autoComplete="given-name"
              disabled={validating}
              className="input bg-black/20 border-white/15"
            />
          </div>

          <div>
            <label htmlFor="login-key" className="block text-[13px] font-medium mb-2">
              API key de Gemini
            </label>
            <div className="relative">
              <input
                id="login-key"
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Pegá tu key acá"
                autoComplete="off"
                spellCheck={false}
                disabled={validating}
                className="input bg-black/20 border-white/15 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Ocultar key' : 'Mostrar key'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/60 hover:text-white"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-500/15 border border-red-500/25 px-3.5 py-2.5 text-[13px] text-red-100 leading-snug">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={validating} disabled={!key.trim()}>
            {validating ? 'Validando…' : 'Entrar'}
          </Button>

          <details className="group rounded-xl bg-black/20 border border-white/10 px-4 py-3">
            <summary className="list-none flex items-center justify-between text-[13px] font-medium">
              ¿Cómo consigo una key?
              <span className="text-lg leading-none text-white/50 transition-transform group-open:rotate-45">+</span>
            </summary>
            <ol className="mt-3 pl-4 space-y-2 list-decimal text-[13px] leading-relaxed text-white/75">
              <li>
                Entrá a{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-white underline underline-offset-2"
                >
                  Google AI Studio
                  <ExternalLink className="w-3 h-3" />
                </a>{' '}
                con tu cuenta de Google.
              </li>
              <li>
                Tocá <strong className="font-medium text-white">Create API key</strong> y copiala.
              </li>
              <li>Pegala acá arriba y tocá Entrar.</li>
            </ol>
            <p className="mt-3 text-[12px] leading-relaxed text-white/55">
              Para generar imágenes, Google suele pedir que actives la facturación en tu cuenta.
            </p>
          </details>
        </form>
      </div>
    </div>
  );
};
