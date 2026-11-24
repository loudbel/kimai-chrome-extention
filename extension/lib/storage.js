const STORAGE_KEYS = {
  baseUrl: "baseUrl",
  userName: "userName",
  apiKey: "apiKey",
  lastProjectId: "lastProjectId",
  lastActivityId: "lastActivityId",
};

const DEFAULTS = {
  baseUrl: "",
  userName: "",
  apiKey: "",
  lastProjectId: null,
  lastActivityId: null,
};

/**
 * @returns {Promise<{
 *   baseUrl: string,
 *   userName: string,
 *   apiKey: string,
 *   lastProjectId: number|null,
 *   lastActivityId: number|null
 * }>}
 */
export async function getSettings() {
  const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    baseUrl: (data.baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, ""),
    userName: data.userName || DEFAULTS.userName,
    apiKey: data.apiKey || DEFAULTS.apiKey,
    lastProjectId:
      data.lastProjectId != null ? Number(data.lastProjectId) : null,
    lastActivityId:
      data.lastActivityId != null ? Number(data.lastActivityId) : null,
  };
}

/**
 * @param {{
 *   baseUrl?: string,
 *   userName?: string,
 *   apiKey?: string,
 *   lastProjectId?: number|null,
 *   lastActivityId?: number|null
 * }} partial
 */
export async function saveSettings(partial) {
  const payload = {};
  if (partial.baseUrl !== undefined) {
    payload.baseUrl = String(partial.baseUrl).replace(/\/+$/, "");
  }
  if (partial.userName !== undefined) {
    payload.userName = String(partial.userName).trim();
  }
  if (partial.apiKey !== undefined) {
    payload.apiKey = String(partial.apiKey).trim();
  }
  if (partial.lastProjectId !== undefined) {
    payload.lastProjectId = partial.lastProjectId;
  }
  if (partial.lastActivityId !== undefined) {
    payload.lastActivityId = partial.lastActivityId;
  }
  await chrome.storage.local.set(payload);
}

export async function assertConfigured() {
  const settings = await getSettings();
  if (!settings.baseUrl || !settings.apiKey) {
    throw new Error(
      "Kimai is not configured. Open the extension options and set BASE_URL and API_KEY."
    );
  }
  return settings;
}
