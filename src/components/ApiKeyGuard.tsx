import React, { useState, useEffect } from 'react';
import { Key, ExternalLink, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { Logo } from './Icons';
import { GoogleGenAI } from "@google/genai";
import { TEXT_MODEL } from '../lib/models';

interface ApiKeyGuardProps {
  children: React.ReactNode;
}

export const ApiKeyGuard: React.FC<ApiKeyGuardProps> = ({ children }) => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState('');
  const [userName, setUserName] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const checkKey = async () => {
    // BYOK unicamente: no leemos ninguna key de build/env.
    // Cualquier key inyectada en el bundle seria publica.
    const savedKey = localStorage.getItem('ai-explorer-manual-key');

    if (savedKey) {
      setHasKey(true);
    } else {
      setHasKey(false);
    }
  };

  useEffect(() => {
    checkKey();
  }, []);

  const handleForceReload = () => {
    window.location.reload();
  };

  const handleSaveManualKey = async () => {
    const key = manualKey.trim();
    const name = userName.trim();
    
    if (key.length < 10) {
      setError("Please enter a valid API Key.");
      return;
    }

    if (!name) {
      setError("Please enter your name.");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Validate the key by making a small request with the most stable model
      const ai = new GoogleGenAI({ apiKey: key });
      await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [{ parts: [{ text: "hi" }] }],
        config: { maxOutputTokens: 1 }
      });
      
      localStorage.setItem('ai-explorer-manual-key', key);
      localStorage.setItem('ai-explorer-user-name', name);
      setHasKey(true);
    } catch (err: any) {
      console.error("Validation error details:", err);
      
      // Try to extract the specific error message from Google's JSON structure
      let errorMessage = "Connection error or invalid key";
      
      try {
        if (err.message && err.message.includes('{')) {
          const jsonStart = err.message.indexOf('{');
          const jsonStr = err.message.substring(jsonStart);
          const parsed = JSON.parse(jsonStr);
          errorMessage = parsed.error?.message || errorMessage;
        } else {
          errorMessage = err.message || errorMessage;
        }
      } catch (e) {
        errorMessage = err.message || errorMessage;
      }

      setError(`Validation error: ${errorMessage}. Ensure the API Key is correct and 'Generative AI API' is enabled.`);
    } finally {
      setIsValidating(false);
    }
  };

  if (hasKey === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-8">
          <div className="animate-pulse text-white/40 font-sans text-xs tracking-[0.4em] font-bold">Initializing DETOLAB...</div>
        </div>
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div 
        className="min-h-screen text-white flex flex-col items-center justify-center p-8 font-sans relative"
        style={{
          backgroundImage: 'url("https://i.pinimg.com/1200x/34/69/9e/34699eca0b59961a9490f5279181afe4.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-black/30 z-0"></div>
        <div className="max-w-md w-full space-y-12 text-center relative z-10">
          <div className="space-y-6">
            <div className="flex items-center justify-center">
              <Logo className="w-44 h-auto" />
            </div>
          </div>

          <div className="glass-card space-y-6 p-8 shadow-2xl shadow-blue-500/5">
            <div className="space-y-4">
              <p className="text-white/60 text-xs leading-relaxed font-medium">
                Enter your Gemini API Key to begin. Your key is stored locally and never leaves your browser.
              </p>
              
              <div className="space-y-6 text-left">
                <div className="space-y-3">
                  <label className="text-[10px] font-semibold tracking-widest text-white/20 block">Your Name</label>
                  <input 
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Jason"
                    className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-xs outline-none focus:ring-1 focus:ring-white/20 transition-all text-white font-sans"
                    disabled={isValidating}
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-semibold tracking-widest text-white/20 block">Your Gemini API Key</label>
                  <div className="relative">
                    <input 
                      type="password"
                      value={manualKey}
                      onChange={(e) => setManualKey(e.target.value)}
                      placeholder="Paste your key here..."
                      className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-xs outline-none focus:ring-1 focus:ring-white/20 transition-all text-white font-sans"
                      disabled={isValidating}
                    />
                    {isValidating && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSaveManualKey}
                  disabled={isValidating || !manualKey.trim() || !userName.trim()}
                  className="w-full py-4 btn-magic text-[10px]"
                >
                  {isValidating ? "Validating..." : "Verify and Enter"}
                </button>

                <p className="text-[10px] text-white/20 leading-relaxed font-medium text-center">
                  Get your free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-white underline">Google AI Studio</a>.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-red-500 text-[11px] font-semibold tracking-wider text-left leading-tight">{error}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-4">
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 text-[11px] text-white/20 hover:text-white transition-colors font-medium tracking-widest"
            >
              Billing Documentation <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
