import React from 'react';
import { Frame, House, Images, Layers, Package, Pencil, Sparkles } from 'lucide-react';
import { Logo } from './Icons';
import { TOOLS, TOOL_ORDER, type ToolId } from '../lib/tools';
import { cn } from '../lib/utils';

export type View = 'home' | 'studio' | 'gallery' | 'account';

const NAV: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'studio', label: 'Studio', icon: Sparkles },
  { id: 'gallery', label: 'Gallery', icon: Images },
];

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
      'w-full h-9 px-3 rounded-lg flex items-center gap-3 text-[14px] font-medium transition-colors',
      active ? 'bg-white/[0.1] text-white' : 'text-ink/75 hover:text-ink hover:bg-white/[0.05]'
    )}
  >
    <Icon className="w-[18px] h-[18px] shrink-0" />
    <span className="truncate">{label}</span>
    {!!badge && <span className="ml-auto text-[12px] text-faint tabular-nums">{badge}</span>}
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
  // En el inicio va la barra superior estilo Apple TV; dentro de las secciones, la barra lateral
  const inSection = view !== 'home';

  return (
    <div className="min-h-dvh bg-canvas text-ink lg:flex">
      {inSection && (
        <aside className="hidden lg:flex w-60 shrink-0 h-dvh sticky top-0 flex-col bg-panel border-r border-line">
          <button onClick={() => onNavigate('home')} className="px-5 pt-6 pb-7 text-left" aria-label="Go to home">
            <Logo className="w-28 h-auto" />
          </button>

          <nav aria-label="Main" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 space-y-6">
            <SideItem icon={House} label="Home" onClick={() => onNavigate('home')} />

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

          <button
            onClick={onOpenAccount}
            aria-current={view === 'account' ? 'page' : undefined}
            className={cn(
              'm-3 flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors',
              view === 'account' ? 'bg-white/[0.1]' : 'hover:bg-white/[0.05]'
            )}
          >
            <Avatar src={avatar} name={userName} className="w-8 h-8" />
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-medium truncate">{userName || 'Your account'}</span>
              <span className="block text-[12px] text-faint">Account & usage</span>
            </span>
          </button>
        </aside>
      )}

      <div className="flex-1 min-w-0">
        {/* Barra superior: siempre en celular; en compu solo en el inicio */}
        <header
          className={cn(
            'sticky top-0 z-40 h-14 bg-black/80 backdrop-blur-xl border-b border-white/[0.06]',
            inSection && 'lg:hidden'
          )}
        >
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
              onClick={onOpenAccount}
              aria-label="Account and usage"
              className="justify-self-end flex items-center gap-2.5 h-9 p-1 lg:pr-3.5 rounded-full hover:bg-white/[0.08] transition-colors"
            >
              <Avatar src={avatar} name={userName} className="w-7 h-7" />
              <span className="hidden lg:block text-[14px] font-medium max-w-[160px] truncate">{userName || 'Account'}</span>
            </button>
          </div>
        </header>

        <main className="pb-16 lg:pb-0">{children}</main>
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
};
