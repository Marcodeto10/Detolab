import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Logo } from './Icons';
import { useAuth } from '../lib/auth';

const LOGIN_BG = 'https://i.pinimg.com/1200x/34/69/9e/34699eca0b59961a9490f5279181afe4.jpg';

/** Fondo de las pantallas de entrada (login y API key). */
export const AuthBackdrop: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="relative min-h-dvh flex items-center justify-center p-5 sm:p-8 text-white bg-canvas bg-cover bg-center"
    style={{ backgroundImage: `url("${LOGIN_BG}")` }}
  >
    <div className="absolute inset-0 bg-black/30" />
    <div className="relative w-full max-w-md space-y-8">
      <Logo className="w-44 h-auto mx-auto" />
      {children}
    </div>
  </div>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </svg>
);

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start Google sign-in.");
      setBusy(false);
    }
  };

  return (
    <AuthBackdrop>
      <div className="glass-card p-6 sm:p-8 space-y-6 shadow-2xl">
        <div>
          <h1 className="text-[34px] font-bold tracking-tight leading-tight">Welcome to Detolab</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-white/75">
            Sign in to keep your images in your account, on any device. You'll add your own Gemini API key next.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-500/15 border border-red-500/25 px-3.5 py-2.5 text-[13px] text-red-100 leading-snug">
            {error}
          </p>
        )}

        <button
          onClick={start}
          disabled={busy}
          className="w-full h-12 rounded-full bg-white text-black text-[15px] font-semibold inline-flex items-center justify-center gap-3 hover:bg-white/90 transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleIcon />}
          Continue with Google
        </button>

        <p className="text-[12px] text-white/55 text-center leading-relaxed">
          We only use your name, email and photo to identify your account.
        </p>
      </div>
    </AuthBackdrop>
  );
};
