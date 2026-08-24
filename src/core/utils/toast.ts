export type ToastType = 'success' | 'danger' | 'info';

export interface ToastPayload {
  id: string;
  message: string;
  type: ToastType;
}

type ToastListener = (toast: ToastPayload | null) => void;
const listeners = new Set<ToastListener>();

let currentTimeout: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, type: ToastType = 'success', _duration = 2000) {
  if (currentTimeout) clearTimeout(currentTimeout);
  const payload: ToastPayload = {
    id: String(Date.now()),
    message,
    type,
  };
  listeners.forEach((l) => l(payload));
  // Every toast auto hides after 2 seconds
  currentTimeout = setTimeout(() => {
    listeners.forEach((l) => l(null));
  }, 2000);
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
