import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, RefreshCw, Store, Unplug } from 'lucide-react';
import { etsyConnectUrl, etsyDisconnect, etsyStatus, type EtsyStatus } from '../../lib/etsy';
import { Button } from '../ui/controls';
import { useDialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4 py-2 border-t border-line first:border-t-0">
    <span className="text-[13px] text-muted">{label}</span>
    <span className="text-[14px] text-ink text-right">{value}</span>
  </div>
);

export const EtsyView: React.FC = () => {
  const toast = useToast();
  const { confirm } = useDialog();
  const [status, setStatus] = useState<EtsyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await etsyStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach Etsy.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Resultado de volver desde Etsy (?etsy=connected o ?etsy=error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('etsy');
    if (!result) return;
    if (result === 'connected') toast({ message: 'Etsy connected.', tone: 'success' });
    else toast({ message: params.get('reason') ?? "Couldn't connect to Etsy.", tone: 'error' });
    params.delete('etsy');
    params.delete('reason');
    params.delete('view');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
  }, [toast]);

  const connect = async () => {
    setBusy(true);
    try {
      window.location.href = await etsyConnectUrl();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Couldn't start the connection.", tone: 'error' });
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    await load();
    setBusy(false);
    toast({ message: 'Connection checked.' });
  };

  const unlink = async () => {
    const ok = await confirm({
      title: 'Disconnect Etsy',
      message: 'Detolab will stop having access to your shop. Your listings on Etsy stay as they are.',
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      setStatus(await etsyDisconnect());
      toast({ message: 'Etsy disconnected.' });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Couldn't disconnect.", tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 lg:px-10 lg:py-10 space-y-6">
      <header>
        <h1 className="text-[34px] font-bold tracking-tight leading-none">Etsy</h1>
        <p className="mt-3 text-[15px] text-muted">Connect your shop so Detolab can prepare listings for you.</p>
      </header>

      {!status && !error && (
        <div className="rounded-2xl bg-raised p-6 flex items-center gap-3 text-[14px] text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking the connection…
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-raised p-6 space-y-4">
          <p className="flex items-center gap-2 text-[14px] text-[#ff9f0a]">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </p>
          <Button onClick={load}>
            <RefreshCw className="w-4 h-4" />
            Try again
          </Button>
        </div>
      )}

      {status?.setupMissing?.length && (
        <div className="rounded-2xl bg-raised p-6 space-y-3">
          <p className="text-[15px] font-semibold">Missing setup in Vercel</p>
          <p className="text-[14px] text-muted">Add these environment variables to the project and deploy again:</p>
          <ul className="space-y-1">
            {status.setupMissing.map((name) => (
              <li key={name} className="font-mono text-[13px] text-ink">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status && !status.setupMissing?.length && !status.connected && (
        <div className="rounded-2xl bg-raised p-6 space-y-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Store className="w-4 h-4" />
            Not connected
          </p>
          <p className="text-[14px] text-muted leading-relaxed">
            You'll go to Etsy once to allow access. Detolab can then read your shop and prepare draft listings. Nothing is
            published without you.
          </p>
          <Button variant="primary" onClick={connect} loading={busy}>
            Connect Etsy
          </Button>
        </div>
      )}

      {status?.connected && (
        <div className="rounded-2xl bg-raised p-6 space-y-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {status.needsReconnect ? (
              <>
                <AlertTriangle className="w-4 h-4 text-[#ff9f0a]" />
                Connect again
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-[#30d158]" />
                Connected
              </>
            )}
          </p>

          <div>
            <Row label="Shop" value={status.shopName ?? '—'} />
            <Row label="Shop ID" value={<span className="font-mono text-[13px]">{status.shopId ?? '—'}</span>} />
            {status.activeListings != null && <Row label="Active listings" value={status.activeListings} />}
          </div>

          {status.needsReconnect && (
            <p className="text-[13px] text-muted">Etsy stopped accepting the permission. Connect again to fix it.</p>
          )}
          {status.shopError && <p className="text-[13px] text-[#ff9f0a]">{status.shopError}</p>}

          <div className="flex flex-wrap gap-2">
            <Button onClick={check} loading={busy}>
              <RefreshCw className="w-4 h-4" />
              Check connection
            </Button>
            {status.needsReconnect && (
              <Button variant="primary" onClick={connect} loading={busy}>
                Connect again
              </Button>
            )}
            <Button variant="ghost" onClick={unlink} disabled={busy}>
              <Unplug className="w-4 h-4" />
              Disconnect
            </Button>
          </div>
        </div>
      )}

      <p className="text-[12px] text-faint leading-relaxed">
        Your Etsy key and tokens stay on the server. They are never sent to the browser.
      </p>
    </div>
  );
};
