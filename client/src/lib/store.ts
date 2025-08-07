// Global state store for the application
let globalToken: string | null = null;
let globalStoreId: string | null = null;
let globalWebhookConfig: { appId: string; appSecret: string } | null = null;

export function setToken(token: string) {
  globalToken = token;
  localStorage.setItem("loyverseToken", token);
}

export function getToken(): string | null {
  if (!globalToken) {
    globalToken = localStorage.getItem("loyverseToken");
  }
  return globalToken;
}

export function clearToken() {
  globalToken = null;
  localStorage.removeItem("loyverseToken");
}

export function setStoreId(storeId: string) {
  globalStoreId = storeId;
  localStorage.setItem("loyverseStoreId", storeId);
}

export function getStoreId(): string | null {
  if (!globalStoreId) {
    globalStoreId = localStorage.getItem("loyverseStoreId");
  }
  return globalStoreId;
}

export function clearStoreId() {
  globalStoreId = null;
  localStorage.removeItem("loyverseStoreId");
}

// New functions for webhook configuration
export function setWebhookConfig(appId: string, appSecret: string) {
  globalWebhookConfig = { appId, appSecret };
  localStorage.setItem("webhookConfig", JSON.stringify({ appId, appSecret }));
}

export function getWebhookConfig(): { appId: string; appSecret: string } | null {
  if (!globalWebhookConfig) {
    const stored = localStorage.getItem("webhookConfig");
    if (stored) {
      globalWebhookConfig = JSON.parse(stored);
    }
  }
  return globalWebhookConfig;
}

export function clearWebhookConfig() {
  globalWebhookConfig = null;
  localStorage.removeItem("webhookConfig");
}