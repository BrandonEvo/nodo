import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandaloneNow = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true ||
  document.referrer.startsWith('android-app://');

// iPadOS se reporta como MacIntel — se distingue por el touch
const IS_IOS =
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function usePWAInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandaloneNow);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setDeferred(null);
    return outcome === 'accepted';
  }, [deferred]);

  // En iOS no existe beforeinstallprompt — la instalación es manual vía
  // menú Compartir, así que el botón se muestra siempre que no sea standalone.
  const canInstall = !standalone && (deferred !== null || IS_IOS);

  return {
    canInstall,
    isIOS: IS_IOS,
    hasNativePrompt: deferred !== null,
    promptInstall,
  };
}
