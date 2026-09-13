import React, { useState } from 'react';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';
import { Logo } from './Icons';
import { Button } from './ui/controls';
import { getApiKey, setApiKey, setUserName } from '../lib/settings';
import { friendlyError, isInvalidKeyError, validateApiKey } from '../lib/generate';

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
      setError('That key looks incomplete.');
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
      setError(isInvalidKeyError(err) ? "That key isn't valid. Make sure you copied all of it." : friendlyError(err));
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
            <h1 className="text-[34px] font-bold tracking-tight leading-tight">Enter your studio</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-white/75">
              Detolab runs on your own Google Gemini API key. It's stored only in this browser.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label htmlFor="login-name" className="text-[13px] font-medium">
                Your name
              </label>
              <span className="text-[12px] text-white/50">Optional</span>
            </div>
            <input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sophie"
              autoComplete="given-name"
              disabled={validating}
              className="input bg-black/30"
            />
          </div>

          <div>
            <label htmlFor="login-key" className="block text-[13px] font-medium mb-2">
              Gemini API key
            </label>
            <div className="relative">
              <input
                id="login-key"
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Paste your key here"
                autoComplete="off"
                spellCheck={false}
                disabled={validating}
                className="input bg-black/30 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
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
            {validating ? 'Validating…' : 'Enter'}
          </Button>

          <details className="group rounded-xl bg-black/20 border border-white/10 px-4 py-3">
            <summary className="list-none flex items-center justify-between text-[13px] font-medium">
              How do I get a key?
              <span className="text-lg leading-none text-white/50 transition-transform group-open:rotate-45">+</span>
            </summary>
            <ol className="mt-3 pl-4 space-y-2 list-decimal text-[13px] leading-relaxed text-white/75">
              <li>
                Go to{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-white underline underline-offset-2"
                >
                  Google AI Studio
                  <ExternalLink className="w-3 h-3" />
                </a>{' '}
                and sign in with your Google account.
              </li>
              <li>
                Click <strong className="font-medium text-white">Create API key</strong> and copy it.
              </li>
              <li>Paste it above and hit Enter.</li>
            </ol>
            <p className="mt-3 text-[12px] leading-relaxed text-white/55">
              To generate images, Google usually requires billing to be enabled on your account.
            </p>
          </details>
        </form>
      </div>
    </div>
  );
};
