export type ToastType = 'success' | 'danger' | 'info';

export interface ToastPayload {
  id: string;
  message: string;
  type: ToastType;
}

type ToastListener = (toast: ToastPayload | null) => void;
const listeners = new Set<ToastListener>();

let currentTimeout: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, type: ToastType = 'success', duration = 2200) {
  if (currentTimeout) clearTimeout(currentTimeout);
  const payload: ToastPayload = {
    id: String(Date.now()),
    message,
    type,
  };
  listeners.forEach((l) => l(payload));
  currentTimeout = setTimeout(() => {
    listeners.forEach((l) => l(null));
  }, duration);
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
