export type ToastType = 'success' | 'danger' | 'error' | 'warning' | 'info';

export interface ToastPayload {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

type ToastListener = (toast: ToastPayload | null) => void;
const listeners = new Set<ToastListener>();

export function showToast(message: string, type: ToastType = 'success', duration = 2500) {
  const payload: ToastPayload = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    message,
    type,
    duration,
  };
  listeners.forEach((l) => l(payload));
}

export function dismissToast() {
  listeners.forEach((l) => l(null));
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

