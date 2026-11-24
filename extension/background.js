import {
  getActivities,
  getActiveTimesheets,
  getProjects,
  getRememberedSelection,
  startTimesheet,
  stopAllActive,
  stopTimesheet,
  testConnection,
  updateTimesheet,
} from "./lib/kimai-api.js";
import { getSettings } from "./lib/storage.js";

/**
 * @param {(arg: any) => Promise<any>} handler
 */
function wrap(handler) {
  return async (payload) => {
    try {
      const data = await handler(payload);
      return { ok: true, data };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
      };
    }
  };
}

const handlers = {
  TEST_CONNECTION: wrap(async () => testConnection()),
  GET_SETTINGS: wrap(async () => getSettings()),
  GET_PROJECTS: wrap(async () => getProjects()),
  GET_ACTIVITIES: wrap(async (msg) => getActivities(msg.projectId)),
  GET_ACTIVE: wrap(async () => getActiveTimesheets()),
  GET_REMEMBERED: wrap(async () => getRememberedSelection()),
  START_TIMER: wrap(async (msg) =>
    startTimesheet({
      projectId: msg.projectId,
      activityId: msg.activityId,
      description: msg.description,
      stopExisting: Boolean(msg.stopExisting),
    })
  ),
  STOP_TIMER: wrap(async (msg) => {
    if (msg.id) {
      if (msg.description !== undefined) {
        await updateTimesheet(msg.id, { description: msg.description });
      }
      return stopTimesheet(msg.id);
    }
    return stopAllActive({
      description: msg.description,
    });
  }),
  UPDATE_TIMESHEET: wrap(async (msg) =>
    updateTimesheet(msg.id, { description: msg.description })
  ),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown message type: ${message?.type}` });
    return false;
  }

  handler(message).then(sendResponse);
  return true;
});
