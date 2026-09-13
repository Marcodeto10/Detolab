import React, { useEffect, useState } from 'react';
import { ExternalLink, Eye, EyeOff, LogOut } from 'lucide-react';
import { Modal, useDialog } from './ui/Dialog';
import { Button, Label } from './ui/controls';
import { useToast } from './ui/Toast';
import { getApiKey, setApiKey, setUserName } from '../lib/settings';
import { friendlyError, isInvalidKeyError, validateApiKey } from '../lib/generate';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  onUserNameChange: (name: string) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onClose, userName, onUserNameChange }) => {
  const toast = useToast();
  const { confirm } = useDialog();
  const [name, setName] = useState(userName);
  const [editingKey, setEditingKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(userName);
    setEditingKey(false);
    setNewKey('');
    setError(null);
  }, [open, userName]);

  const currentKey = getApiKey() ?? '';

  const saveName = () => {
    const n = name.trim();
    if (n === userName) return;
    setUserName(n || null);
    onUserNameChange(n);
  };

  const saveKey = async () => {
    const k = newKey.trim();
    if (k.length < 10) {
      setError('That key looks incomplete.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await validateApiKey(k);
      setApiKey(k);
      setEditingKey(false);
      setNewKey('');
      toast({ message: 'API key updated.', tone: 'success' });
    } catch (err) {
      setError(isInvalidKeyError(err) ? "That key isn't valid. Make sure you copied all of it." : friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    const ok = await confirm({
      title: 'Sign out',
      message: 'Your API key will be removed from this browser. Your images stay saved here.',
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (!ok) return;
    setApiKey(null);
    setUserName(null);
    window.location.reload();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        saveName();
        onClose();
      }}
      title="Settings"
    >
      <div className="space-y-6">
        <div>
          <Label htmlFor="settings-name">Your name</Label>
          <input
            id="settings-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            placeholder="What should we call you?"
            className="input"
          />
        </div>

        <div>
          <Label>Gemini API key</Label>
          {!editingKey ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 h-11 px-3.5 rounded-[10px] bg-fill flex items-center font-sans text-[14px] text-muted tracking-wider">
                {currentKey ? `••••••••${currentKey.slice(-4)}` : 'No key'}
              </code>
              <Button onClick={() => setEditingKey(true)}>Change</Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveKey();
              }}
              className="space-y-2"
            >
              <div className="relative">
                <input
                  autoFocus
                  type={showKey ? 'text' : 'password'}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Paste your new key"
                  autoComplete="off"
                  spellCheck={false}
                  className="input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-faint hover:text-ink"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="text-[13px] text-red-300">{error}</p>}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingKey(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  Validate & save
                </Button>
              </div>
            </form>
          )}
          <p className="mt-2 text-[12px] text-faint leading-relaxed">
            Stored only in this browser and sent directly to Google.{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted underline underline-offset-2 hover:text-ink"
            >
              Get a key
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        <div className="pt-5 border-t border-line">
          <Button variant="ghost" className="w-full text-red-300 hover:text-red-200 hover:bg-red-500/10" onClick={logout}>
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </div>
    </Modal>
  );
};
