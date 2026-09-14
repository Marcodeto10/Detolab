import React from 'react';
import { motion } from 'motion/react';
import { Frame, House, Images, Layers, LogOut, Package, Pencil, Sparkles } from 'lucide-react';
import { Logo } from './Icons';
import { TOOLS, TOOL_ORDER, type ToolId } from '../lib/tools';
import { useSignOut } from '../lib/useSignOut';
import { cn } from '../lib/utils';

export type View = 'home' | 'studio' | 'gallery' | 'account';

const NAV: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'studio', label: 'Studio', icon: Sparkles },
  { id: 'gallery', label: 'Gallery', icon: Images },
];

// Resorte corto para los fondos que se deslizan entre botones
const SLIDE = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 } as const;

const TOOL_ICONS: Record<ToolId, React.ElementType> = {
  create: Sparkles,
  edit: Pencil,
  mockup: Frame,
  product: Package,
  bulk: Layers,
};

interface ShellProps {
  view: View;
  tool: ToolId;
  onNavigate: (v: View) => void;
  onOpenTool: (t: ToolId) => void;
  onOpenAccount: () => void;
  userName: string;
  avatar: string;
  galleryCount: number;
  children: React.ReactNode;
}

const Avatar: React.FC<{ src: string; name: string; className?: string }> = ({ src, name, className }) =>
  src ? (
    <img src={src} alt="" referrerPolicy="no-referrer" className={cn('rounded-full object-cover shrink-0', className)} />
  ) : (
    <span
      className={cn(
        'rounded-full shrink-0 bg-gradient-to-br from-[#8e8e93] to-[#48484a] grid place-items-center text-[13px] font-semibold uppercase',
        className
      )}
    >
      {name.trim()[0] ?? 'D'}
    </span>
  );

const SideItem: React.FC<{ icon: React.ElementType; label: string; active?: boolean; badge?: number; onClick: () => void }> = ({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}) => (
  <button
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={cn(
      'group relative w-full h-9 px-3 rounded-lg flex items-center gap-3 text-[14px] font-medium transition-[color,background-color,transform] duration-200 active:scale-[0.98]',
      active ? 'text-white' : 'text-ink/75 hover:text-ink hover:bg-white/[0.05]'
    )}
  >
    {active && <motion.span layoutId="side-active" aria-hidden className="absolute inset-0 rounded-lg bg-white/[0.1]" transition={SLIDE} />}
    <Icon className="relative w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
    <span className="relative truncate">{label}</span>
    {!!badge && <span className="relative ml-auto text-[12px] text-faint tabular-nums">{badge}</span>}
  </button>
);

const SideHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{children}</p>
);

export const Shell: React.FC<ShellProps> = ({
  view,
  tool,
  onNavigate,
  onOpenTool,
  onOpenAccount,
  userName,
  avatar,
  galleryCount,
  children,
}) => {
  const signOut = useSignOut();
  // La barra superior está siempre; dentro de las secciones (compu) se suma la barra lateral
  const inSection = view !== 'home';

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      {/* Una sola barra superior, idéntica en todas las pantallas */}
      <header className="sticky top-0 z-40 h-14 lg:h-16 bg-black/80 backdrop-blur-xl border-b lg:border-b-2 border-line">
        <div className="h-full px-4 lg:px-6 flex items-center justify-between lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <button
            onClick={() => onNavigate('home')}
            className="justify-self-start transition-[opacity,transform] duration-200 hover:opacity-80 active:scale-[0.97]"
            aria-label="Go to home"
          >
            <Logo className="w-28 lg:w-32 h-auto" />
          </button>

          <nav aria-label="Main" className="hidden lg:flex items-center gap-2 p-1.5 rounded-full bg-white/[0.08]">
            {NAV.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                aria-current={view === id ? 'page' : undefined}
                className={cn(
                  'relative h-8 px-6 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 transition-[color,background-color,transform] duration-200 active:scale-[0.96]',
                  view === id ? 'text-black' : 'text-ink/80 hover:text-ink hover:bg-white/[0.1]'
                )}
              >
                {view === id && (
                  <motion.span layoutId="top-nav-pill" aria-hidden className="absolute inset-0 rounded-full bg-white" transition={SLIDE} />
                )}
                <span className="relative">{label}</span>
                {id === 'gallery' && galleryCount > 0 && (
                  <span className={cn('relative text-[12px] tabular-nums', view === id ? 'text-black/50' : 'text-faint')}>{galleryCount}</span>
                )}
              </button>
            ))}
          </nav>

          <button
            onClick={onOpenAccount}
            aria-label="Account and usage"
            aria-current={view === 'account' ? 'page' : undefined}
            className={cn(
              'justify-self-end flex items-center gap-2.5 h-9 p-1 lg:pr-3.5 rounded-full transition-[background-color,transform] duration-200 active:scale-[0.97]',
              view === 'account' ? 'bg-white/[0.1]' : 'hover:bg-white/[0.08]'
            )}
          >
            <Avatar src={avatar} name={userName} className="w-7 h-7" />
            <span className="hidden lg:block text-[14px] font-medium max-w-[160px] truncate">{userName || 'Account'}</span>
          </button>
        </div>
      </header>

      <div className="lg:flex">
        {inSection && (
          <aside className="hidden lg:flex w-60 shrink-0 self-start sticky top-16 h-[calc(100dvh-4rem)] flex-col bg-canvas border-r-2 border-line">
            <nav aria-label="Sections" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pt-6 space-y-6">
              <div>
                <SideHeading>Tools</SideHeading>
                <div className="space-y-0.5">
                  {TOOL_ORDER.map((id) => (
                    <SideItem
                      key={id}
                      icon={TOOL_ICONS[id]}
                      label={TOOLS[id].name}
                      active={view === 'studio' && tool === id}
                      onClick={() => onOpenTool(id)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <SideHeading>Library</SideHeading>
                <SideItem
                  icon={Images}
                  label="Gallery"
                  active={view === 'gallery'}
                  badge={galleryCount}
                  onClick={() => onNavigate('gallery')}
                />
              </div>
            </nav>

            <div className="p-3">
              <SideItem icon={LogOut} label="Sign out" onClick={signOut} />
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0 pb-16 lg:pb-0">{children}</main>
      </div>

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
              'h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-[color,transform] duration-200 active:scale-95',
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
};
