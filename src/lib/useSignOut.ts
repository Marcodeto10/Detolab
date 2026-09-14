import { useAuth } from './auth';
import { setApiKey } from './settings';
import { useDialog } from '../components/ui/Dialog';

/** Cerrar sesión con confirmación. Las imágenes quedan en la cuenta; la API key se borra de este navegador. */
export const useSignOut = () => {
  const { signOut } = useAuth();
  const { confirm } = useDialog();

  return async () => {
    const ok = await confirm({
      title: 'Sign out',
      message: 'Your images stay in your account. The API key is removed from this browser.',
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (!ok) return;
    setApiKey(null);
    await signOut();
  };
};
