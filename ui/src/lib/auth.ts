const AUTH_KEY = "bright_api_key";

export function getApiKey(): string | null {
  return sessionStorage.getItem(AUTH_KEY);
}

export function setApiKey(key: string): void {
  sessionStorage.setItem(AUTH_KEY, key);
}

export function clearApiKey(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  return !!getApiKey();
}
