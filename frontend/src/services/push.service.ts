import api from '@/lib/api';

const STORAGE_KEY = 'nodo_push_dismissed';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export const pushService = {
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  permissionState(): NotificationPermission {
    return Notification.permission;
  },

  userDismissed(): boolean {
    return localStorage.getItem(STORAGE_KEY) === '1';
  },

  markDismissed(): void {
    localStorage.setItem(STORAGE_KEY, '1');
  },

  async getVapidKey(): Promise<string> {
    const res = await api.get<{ vapid_public_key: string }>('/api/push/vapid-public-key');
    return res.data.vapid_public_key;
  },

  async subscribe(): Promise<boolean> {
    if (!this.isSupported()) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      this.markDismissed();
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const vapidKey = await this.getVapidKey();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const json = subscription.toJSON();
    await api.post('/api/push/subscriptions', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
    });

    return true;
  },

  async unsubscribe(): Promise<void> {
    if (!this.isSupported()) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const json = subscription.toJSON();
    await api.delete('/api/push/subscriptions', {
      data: { endpoint: json.endpoint, keys: json.keys },
    });
    await subscription.unsubscribe();
  },
};
