import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { Shell, type View } from './components/Shell';
import { Home } from './components/Home';
import { Studio, type StudioRequest } from './components/studio/Studio';
import { GalleryView } from './components/gallery/GalleryView';
import { ImageViewer } from './components/gallery/ImageViewer';
import { AccountView } from './components/AccountView';
import { LoginScreen } from './components/LoginScreen';
import { ApiKeyScreen } from './components/ApiKeyScreen';
import { ToastProvider } from './components/ui/Toast';
import { DialogProvider } from './components/ui/Dialog';
import { GalleryProvider, useGallery } from './lib/galleryContext';
import { AuthProvider, avatarUrl, displayName, useAuth } from './lib/auth';
import { clearLegacyStorage, getApiKey, setKeyScope } from './lib/settings';
import type { SlotId, ToolId } from './lib/tools';

const Workspace: React.FC<{ onKeyRemoved: () => void }> = ({ onKeyRemoved }) => {
  const { user } = useAuth();
  const { images } = useGallery();
  const [view, setView] = useState<View>('home');
  const [tool, setTool] = useState<ToolId>('create');
  const [request, setRequest] = useState<StudioRequest | null>(null);
  const [viewer, setViewer] = useState<{ id: string; ids: string[] } | null>(null);

  const navigate = useCallback((v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  }, []);

  const openTool = (t: ToolId) => {
    setTool(t);
    navigate('studio');
  };

  const openImage = (id: string, ids?: string[]) => setViewer({ id, ids: ids ?? images.map((i) => i.id) });
  const closeViewer = useCallback(() => setViewer(null), []);
  const navigateViewer = useCallback((id: string) => setViewer((v) => (v ? { ...v, id } : v)), []);

  const useAs = (url: string, t: ToolId, slot: SlotId) => {
    setViewer(null);
    setTool(t);
    setRequest({ url, tool: t, slot, nonce: Date.now() });
    navigate('studio');
  };

  return (
    <Shell
      view={view}
      tool={tool}
      onNavigate={navigate}
      onOpenTool={openTool}
      onOpenAccount={() => navigate('account')}
      userName={displayName(user)}
      avatar={avatarUrl(user)}
      galleryCount={images.length}
    >
      {/* Inicio, estudio y galería quedan montados para no perder lo que estabas haciendo */}
      <div hidden={view !== 'home'}>
        <Home userName={displayName(user)} onOpenTool={openTool} onOpenGallery={() => navigate('gallery')} onOpenImage={(id) => openImage(id)} />
      </div>
      <div hidden={view !== 'studio'}>
        <Studio
          visible={view === 'studio'}
          tool={tool}
          onToolChange={setTool}
          request={request}
          onRequestHandled={() => setRequest(null)}
          onOpenGallery={() => navigate('gallery')}
          onOpenImage={openImage}
        />
      </div>
      <div hidden={view !== 'gallery'}>
        <GalleryView onOpenImage={openImage} onGoToStudio={() => navigate('studio')} />
      </div>
      {view === 'account' && <AccountView onKeyRemoved={onKeyRemoved} />}

      <ImageViewer
        imageId={viewer?.id ?? null}
        ids={viewer?.ids ?? []}
        onClose={closeViewer}
        onNavigate={navigateViewer}
        onUseAs={useAs}
      />
    </Shell>
  );
};

/** Después del login: pide la API key (si este navegador no la tiene para esta cuenta). */
const KeyGate: React.FC<{ userId: string; email: string }> = ({ userId, email }) => {
  setKeyScope(userId);
  const { signOut } = useAuth();
  const [hasKey, setHasKey] = useState(() => !!getApiKey());

  useEffect(() => {
    clearLegacyStorage();
  }, []);

  if (!hasKey) return <ApiKeyScreen email={email} onSaved={() => setHasKey(true)} onSignOut={signOut} />;

  return (
    <GalleryProvider>
      <Workspace onKeyRemoved={() => setHasKey(false)} />
    </GalleryProvider>
  );
};

const AuthGate: React.FC = () => {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh grid place-items-center bg-canvas">
        <Loader2 className="w-6 h-6 animate-spin text-faint" />
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  return <KeyGate key={user.id} userId={user.id} email={user.email ?? ''} />;
};

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
