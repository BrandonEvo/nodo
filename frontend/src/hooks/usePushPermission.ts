import { useState, useEffect, useCallback } from 'react';
import { pushService } from '@/services/push.service';

type PushState = 'unsupported' | 'granted' | 'denied' | 'dismissed' | 'eligible';

export function usePushPermission() {
  const [state, setState] = useState<PushState>('unsupported');
  const [subscribing, setSubscribing] = useState(false);

  const refresh = useCallback(() => {
    if (!pushService.isSupported()) {
      setState('unsupported');
      return;
    }
    const perm = pushService.permissionState();
    if (perm === 'granted') {
      setState('granted');
    } else if (perm === 'denied') {
      setState('denied');
    } else if (pushService.userDismissed()) {
      setState('dismissed');
    } else {
      setState('eligible');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setSubscribing(true);
    try {
      const ok = await pushService.subscribe();
      setState(ok ? 'granted' : 'dismissed');
    } finally {
      setSubscribing(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    pushService.markDismissed();
    setState('dismissed');
  }, []);

  const unsubscribe = useCallback(async () => {
    await pushService.unsubscribe();
    setState('eligible');
  }, []);

  return { state, subscribing, subscribe, dismiss, unsubscribe, refresh };
}
