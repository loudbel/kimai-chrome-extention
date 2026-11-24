import { assertConfigured, getSettings, saveSettings } from "./storage.js";

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, query?: Record<string, string|number|undefined|null> }} [options]
 */
async function kimaiFetch(path, options = {}) {
  const settings = await assertConfigured();
  // Prefer https — many Kimai installs redirect http → https and may drop auth
  let base = settings.baseUrl.replace(/\/+$/, "");
  if (base.startsWith("http://")) {
    base = base.replace(/^http:\/\//, "https://");
  }

  const url = new URL(`${base}/${path.replace(/^\/+/, "")}`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${settings.apiKey}`,
  };

  // Legacy fallback headers (ignored by Bearer-only installs)
  if (settings.userName) {
    headers["X-AUTH-USER"] = settings.userName;
    headers["X-AUTH-TOKEN"] = settings.apiKey;
  }

  /** @type {RequestInit} */
  const init = {
    method: options.method || "GET",
    headers,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), init);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.message || data.error)) ||
      (typeof data === "string" && data) ||
      `Kimai HTTP ${response.status}`;
    throw new Error(String(message));
  }

  return data;
}

export async function testConnection() {
  // Lightweight authenticated call (version may redirect / 403 on some installs)
  await kimaiFetch("projects", { query: { visible: 1 } });
  return { ok: true };
}

export async function getProjects() {
  const projects = await kimaiFetch("projects", {
    query: { visible: 1 },
  });
  return Array.isArray(projects) ? projects : [];
}

export async function getActivities(projectId) {
  const activities = await kimaiFetch("activities", {
    query: {
      project: projectId,
      visible: 1,
    },
  });
  return Array.isArray(activities) ? activities : [];
}

export async function getActiveTimesheets() {
  const active = await kimaiFetch("timesheets/active");
  return Array.isArray(active) ? active : [];
}

export async function stopTimesheet(id) {
  return kimaiFetch(`timesheets/${id}/stop`, { method: "PATCH" });
}

/**
 * @param {number} id
 * @param {{ description?: string }} fields
 */
export async function updateTimesheet(id, fields) {
  const body = {};
  if (fields.description !== undefined) {
    body.description = String(fields.description);
  }
  return kimaiFetch(`timesheets/${id}`, {
    method: "PATCH",
    body,
  });
}

/**
 * @param {{ id?: number, description?: string }} [payload]
 */
export async function stopAllActive(payload = {}) {
  const active = await getActiveTimesheets();
  const stopped = [];
  for (const entry of active) {
    if (payload.id && Number(entry.id) !== Number(payload.id)) continue;
    if (
      payload.description !== undefined &&
      String(payload.description) !== String(entry.description || "")
    ) {
      await updateTimesheet(entry.id, { description: payload.description });
    }
    stopped.push(await stopTimesheet(entry.id));
  }
  return stopped;
}

/**
 * @param {{
 *   projectId: number,
 *   activityId: number,
 *   description: string,
 *   stopExisting?: boolean
 * }} payload
 */
export async function startTimesheet(payload) {
  const projectId = Number(payload.projectId);
  const activityId = Number(payload.activityId);
  if (!projectId || !activityId) {
    throw new Error("Project and activity are required.");
  }
  if (!payload.description?.trim()) {
    throw new Error("Description is required.");
  }

  const active = await getActiveTimesheets();
  if (active.length > 0 && !payload.stopExisting) {
    return {
      needsConfirmation: true,
      active,
    };
  }

  if (active.length > 0 && payload.stopExisting) {
    await stopAllActive();
  }

  const created = await kimaiFetch("timesheets", {
    method: "POST",
    body: {
      project: projectId,
      activity: activityId,
      description: payload.description.trim(),
    },
  });

  await saveSettings({
    lastProjectId: projectId,
    lastActivityId: activityId,
  });

  return {
    needsConfirmation: false,
    timesheet: created,
  };
}

export async function getRememberedSelection() {
  const settings = await getSettings();
  return {
    lastProjectId: settings.lastProjectId,
    lastActivityId: settings.lastActivityId,
  };
}
