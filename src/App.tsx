import React, { useCallback, useState } from 'react';
import { ApiKeyGuard } from './components/ApiKeyGuard';
import { Shell, type View } from './components/Shell';
import { Home } from './components/Home';
import { Studio, type StudioRequest } from './components/studio/Studio';
import { GalleryView } from './components/gallery/GalleryView';
import { ImageViewer } from './components/gallery/ImageViewer';
import { SettingsDialog } from './components/SettingsDialog';
import { ToastProvider } from './components/ui/Toast';
import { DialogProvider } from './components/ui/Dialog';
import { GalleryProvider, useGallery } from './lib/galleryContext';
import { getUserName } from './lib/settings';
import type { SlotId, ToolId } from './lib/tools';

const Workspace: React.FC = () => {
  const { images } = useGallery();
  const [view, setView] = useState<View>('home');
  const [tool, setTool] = useState<ToolId>('create');
  const [request, setRequest] = useState<StudioRequest | null>(null);
  const [viewer, setViewer] = useState<{ id: string; ids: string[] } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userName, setUserName] = useState(getUserName);

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
      onOpenSettings={() => setSettingsOpen(true)}
      userName={userName}
      galleryCount={images.length}
    >
      {/* Las tres vistas quedan montadas para no perder lo que estabas haciendo */}
      <div hidden={view !== 'home'}>
        <Home userName={userName} onOpenTool={openTool} onOpenGallery={() => navigate('gallery')} onOpenImage={(id) => openImage(id)} />
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

      <ImageViewer
        imageId={viewer?.id ?? null}
        ids={viewer?.ids ?? []}
        onClose={closeViewer}
        onNavigate={navigateViewer}
        onUseAs={useAs}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userName={userName}
        onUserNameChange={setUserName}
      />
    </Shell>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <ApiKeyGuard>
          <GalleryProvider>
            <Workspace />
          </GalleryProvider>
        </ApiKeyGuard>
      </DialogProvider>
    </ToastProvider>
  );
}
