import React from 'react';
import { House, Images, Settings, Sparkles } from 'lucide-react';
import { Logo } from './Icons';
import { cn } from '../lib/utils';

export type View = 'home' | 'studio' | 'gallery';

const NAV: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Inicio', icon: House },
  { id: 'studio', label: 'Estudio', icon: Sparkles },
  { id: 'gallery', label: 'Galería', icon: Images },
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
  <div className="studio-grain min-h-dvh bg-canvas text-ink lg:flex">
    {/* Barra lateral (compu) */}
    <aside className="hidden lg:flex w-60 shrink-0 h-dvh sticky top-0 flex-col border-r border-line bg-panel/60">
      <button onClick={() => onNavigate('home')} className="px-6 pt-7 pb-8 text-left" aria-label="Ir al inicio">
        <Logo className="w-28 h-auto" />
      </button>

      <nav className="flex-1 px-3 space-y-1" aria-label="Principal">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            aria-current={view === id ? 'page' : undefined}
            className={cn(
              'w-full flex items-center gap-3 h-10 px-3 rounded-xl text-[14px] font-medium transition-colors',
              view === id ? 'bg-white/[0.08] text-ink' : 'text-muted hover:text-ink hover:bg-white/[0.04]'
            )}
          >
            <Icon className="w-[18px] h-[18px]" />
            {label}
            {id === 'gallery' && galleryCount > 0 && (
              <span className="ml-auto text-[12px] text-faint tabular-nums">{galleryCount}</span>
            )}
          </button>
        ))}
      </nav>

      <button
        onClick={onOpenSettings}
        className="m-3 flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-white/[0.04] transition-colors"
      >
        <span className="w-9 h-9 shrink-0 rounded-full bg-white/10 grid place-items-center text-[14px] font-semibold uppercase">
          {(userName.trim()[0] ?? 'D')}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-medium truncate">{userName || 'Tu estudio'}</span>
          <span className="block text-[12px] text-faint">Ajustes y API key</span>
        </span>
        <Settings className="w-4 h-4 text-faint" />
      </button>
    </aside>

    {/* Barra superior (celular) */}
    <header className="lg:hidden sticky top-0 z-40 h-14 px-4 flex items-center justify-between bg-canvas/85 backdrop-blur-xl border-b border-line">
      <button onClick={() => onNavigate('home')} aria-label="Ir al inicio">
        <Logo className="w-24 h-auto" />
      </button>
      <button onClick={onOpenSettings} aria-label="Ajustes" className="p-2 -mr-2 text-muted hover:text-ink">
        <Settings className="w-5 h-5" />
      </button>
    </header>

    <main className="flex-1 min-w-0 pb-16 lg:pb-0">{children}</main>

    {/* Pestañas inferiores (celular) */}
    <nav
      aria-label="Principal"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-3 bg-canvas/90 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      {NAV.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          aria-current={view === id ? 'page' : undefined}
          className={cn(
            'h-16 flex flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors',
            view === id ? 'text-ink' : 'text-faint'
          )}
        >
          <Icon className="w-5 h-5" />
          {label}
        </button>
      ))}
    </nav>
  </div>
);
