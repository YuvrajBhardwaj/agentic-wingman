const KEY = 'fw_session';

/** Capture a `#session=<token>` from the OAuth callback redirect and persist it. */
export const captureSessionFromUrl = (): void => {
  if (typeof window === 'undefined') return;
  const match = /[#&]session=([^&]+)/.exec(window.location.hash);
  if (match?.[1]) {
    localStorage.setItem(KEY, decodeURIComponent(match[1]));
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
};

export const getToken = (): string | null =>
  typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;

export const setToken = (token: string): void => localStorage.setItem(KEY, token);

export const clearToken = (): void => localStorage.removeItem(KEY);

export const authHeader = (): Record<string, string> => {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
};
