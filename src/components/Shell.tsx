import React from 'react';
import { House, Images, Sparkles } from 'lucide-react';
import { Logo } from './Icons';
import { cn } from '../lib/utils';

export type View = 'home' | 'studio' | 'gallery';

const NAV: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'studio', label: 'Studio', icon: Sparkles },
  { id: 'gallery', label: 'Gallery', icon: Images },
];

interface ShellProps {
  view: View;
  onNavigate: (v: View) => void;
  onOpenSettings: () => void;
  userName: string;
  galleryCount: number;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({ view, onNavigate, onOpenSettings, userName, galleryCount, children }) => (
  <div className="min-h-dvh bg-canvas text-ink">
    {/* Barra superior con la navegación en cápsula, como Apple TV */}
    <header className="sticky top-0 z-40 h-14 bg-black/80 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <button onClick={() => onNavigate('home')} className="justify-self-start" aria-label="Go to home">
          <Logo className="w-24 lg:w-28 h-auto" />
        </button>

        <nav aria-label="Main" className="hidden lg:flex items-center gap-1 p-1 rounded-full bg-white/[0.08]">
          {NAV.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              aria-current={view === id ? 'page' : undefined}
              className={cn(
                'h-8 px-4 rounded-full text-[14px] font-semibold transition-colors inline-flex items-center gap-1.5',
                view === id ? 'bg-white text-black' : 'text-ink/80 hover:text-ink hover:bg-white/[0.1]'
              )}
            >
              {label}
              {id === 'gallery' && galleryCount > 0 && (
                <span className={cn('text-[12px] tabular-nums', view === id ? 'text-black/50' : 'text-faint')}>{galleryCount}</span>
              )}
            </button>
          ))}
        </nav>

        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="justify-self-end flex items-center gap-2.5 h-9 p-1 lg:pr-3.5 rounded-full hover:bg-white/[0.08] transition-colors"
        >
          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8e8e93] to-[#48484a] grid place-items-center text-[13px] font-semibold uppercase">
            {userName.trim()[0] ?? 'D'}
          </span>
          <span className="hidden lg:block text-[14px] font-medium max-w-[160px] truncate">{userName || 'Settings'}</span>
        </button>
      </div>
    </header>

    <main className="pb-16 lg:pb-0">{children}</main>

    {/* Barra de pestañas inferior (celular), estilo iOS */}
    <nav
      aria-label="Main"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-3 bg-black/85 backdrop-blur-xl border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)]"
    >
      {NAV.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          aria-current={view === id ? 'page' : undefined}
          className={cn(
            'h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
            view === id ? 'text-white' : 'text-faint'
          )}
        >
          <Icon className="w-[22px] h-[22px]" />
          {label}
        </button>
      ))}
    </nav>
  </div>
);
