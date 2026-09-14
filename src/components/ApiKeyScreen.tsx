import React, { useState } from 'react';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/controls';
import { AuthBackdrop } from './LoginScreen';
import { setApiKey } from '../lib/settings';
import { friendlyError, isInvalidKeyError, validateApiKey } from '../lib/generate';

interface ApiKeyScreenProps {
  email: string;
  onSaved: () => void;
  onSignOut: () => void;
}

export const ApiKeyScreen: React.FC<ApiKeyScreenProps> = ({ email, onSaved, onSignOut }) => {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onSaved();
    } catch (err) {
      setError(isInvalidKeyError(err) ? "That key isn't valid. Make sure you copied all of it." : friendlyError(err));
    } finally {
      setValidating(false);
    }
  };

  return (
    <AuthBackdrop>
      <form onSubmit={submit} className="glass-card p-6 sm:p-8 space-y-5 shadow-2xl">
        <div>
          <h1 className="text-[34px] font-bold tracking-tight leading-tight">Add your Gemini API key</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-white/75">
            Detolab uses your own Google Gemini key. It's stored only in this browser, never in your account.
          </p>
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
              autoFocus
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
          {validating ? 'Validating…' : 'Continue'}
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
            <li>Paste it above and hit Continue.</li>
          </ol>
          <p className="mt-3 text-[12px] leading-relaxed text-white/55">
            To generate images, Google usually requires billing to be enabled on your account.
          </p>
        </details>

        <p className="text-[12px] text-white/55 text-center">
          Signed in as {email} ·{' '}
          <button type="button" onClick={onSignOut} className="underline underline-offset-2 hover:text-white">
            Not you? Sign out
          </button>
        </p>
      </form>
    </AuthBackdrop>
  );
};
