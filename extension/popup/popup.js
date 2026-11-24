const projectSelect = document.getElementById("project");
const activitySelect = document.getElementById("activity");
const descriptionEl = document.getElementById("description");
const contextLabel = document.getElementById("context-label");
const startBtn = document.getElementById("start-btn");
const saveBtn = document.getElementById("save-btn");
const stopBtn = document.getElementById("stop-btn");
const refreshBtn = document.getElementById("refresh-btn");
const messageEl = document.getElementById("message");
const optionsLink = document.getElementById("options-link");

/** @type {any | null} */
let activeTimesheet = null;
/** @type {{ title: string, url: string } | null} */
let tabCard = null;

function setMessage(text, type = "") {
  messageEl.textContent = text || "";
  messageEl.className = `message ${type}`.trim();
}

function entityId(value) {
  if (value == null) return null;
  if (typeof value === "object") return Number(value.id);
  return Number(value);
}

function normalizeCardUrl(href) {
  if (!href) return "";
  try {
    const url = new URL(href);
    const match = url.pathname.match(/\/c\/([a-zA-Z0-9]+)/);
    if (!match) return "";
    return `https://trello.com/c/${match[1]}`;
  } catch {
    return "";
  }
}

function buildDescription(title, url) {
  return `${title}\n${url}`;
}

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function detectTrelloTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.url) return null;
    const url = normalizeCardUrl(tab.url);
    if (!url) return null;
    const title = (tab.title || "")
      .replace(/\s*\|\s*Trello.*$/i, "")
      .trim();
    return { title: title || "Trello card", url };
  } catch {
    return null;
  }
}

async function loadActivities(projectId, preferredId) {
  activitySelect.disabled = true;
  activitySelect.innerHTML = `<option value="">Chargement…</option>`;
  const res = await send("GET_ACTIVITIES", { projectId: Number(projectId) });
  if (!res?.ok) {
    activitySelect.innerHTML = `<option value="">Erreur</option>`;
    throw new Error(res?.error || "Échec des activités");
  }

  const activities = res.data || [];
  activitySelect.innerHTML = `<option value="">Choisir une activité</option>`;
  for (const activity of activities) {
    const opt = document.createElement("option");
    opt.value = String(activity.id);
    opt.textContent = activity.name;
    activitySelect.appendChild(opt);
  }

  if (
    preferredId != null &&
    activities.some((a) => Number(a.id) === Number(preferredId))
  ) {
    activitySelect.value = String(preferredId);
  }
  activitySelect.disabled = false;
}

function setRunningMode(running) {
  startBtn.hidden = running;
  saveBtn.hidden = !running;
  stopBtn.hidden = !running;
  projectSelect.disabled = running;
  activitySelect.disabled = running;
}

async function refresh() {
  setMessage("");
  contextLabel.textContent = "Chargement…";
  activeTimesheet = null;
  setRunningMode(false);

  const settingsRes = await send("GET_SETTINGS");
  if (!settingsRes?.ok) {
    contextLabel.textContent = "Erreur";
    setMessage(settingsRes?.error || "Impossible de lire la config.", "err");
    return;
  }

  if (!settingsRes.data?.apiKey) {
    contextLabel.textContent = "Non configuré";
    setMessage("Ouvrez Options et renseignez BASE_URL + API_KEY.", "err");
    return;
  }

  tabCard = await detectTrelloTab();

  const [projectsRes, activeRes, rememberedRes] = await Promise.all([
    send("GET_PROJECTS"),
    send("GET_ACTIVE"),
    send("GET_REMEMBERED"),
  ]);

  if (!projectsRes?.ok) throw new Error(projectsRes?.error || "Échec projets");
  if (!activeRes?.ok) throw new Error(activeRes?.error || "Échec actifs");
  if (!rememberedRes?.ok) {
    throw new Error(rememberedRes?.error || "Échec mémoire");
  }

  const projects = projectsRes.data || [];
  const active = activeRes.data || [];
  const remembered = rememberedRes.data || {};
  activeTimesheet = active[0] || null;

  projectSelect.innerHTML = `<option value="">Choisir un projet</option>`;
  for (const project of projects) {
    const opt = document.createElement("option");
    opt.value = String(project.id);
    opt.textContent = project.name;
    projectSelect.appendChild(opt);
  }

  if (activeTimesheet) {
    const projectId = entityId(activeTimesheet.project);
    const activityId = entityId(activeTimesheet.activity);
    if (
      projectId != null &&
      projects.some((p) => Number(p.id) === Number(projectId))
    ) {
      projectSelect.value = String(projectId);
      await loadActivities(projectId, activityId);
    } else {
      activitySelect.innerHTML = `<option value="">—</option>`;
    }

    descriptionEl.value = activeTimesheet.description || "";
    setRunningMode(true);
    contextLabel.textContent = `Timer en cours (#${activeTimesheet.id})`;
    setMessage("Éditez la description puis enregistrez ou arrêtez.", "ok");
    return;
  }

  const preferredProject = remembered.lastProjectId;
  if (
    preferredProject != null &&
    projects.some((p) => Number(p.id) === Number(preferredProject))
  ) {
    projectSelect.value = String(preferredProject);
    await loadActivities(preferredProject, remembered.lastActivityId);
  } else {
    activitySelect.innerHTML = `<option value="">Choisir un projet d'abord</option>`;
  }

  if (tabCard) {
    descriptionEl.value = buildDescription(tabCard.title, tabCard.url);
    contextLabel.textContent = `Carte Trello : ${tabCard.title}`;
  } else {
    if (!descriptionEl.value.trim()) {
      descriptionEl.value = "";
    }
    contextLabel.textContent =
      "Aucun timer actif — saisissez une description puis démarrez.";
  }
  setRunningMode(false);
  setMessage("Modifiez la description si besoin, puis démarrez.", "");
}

projectSelect.addEventListener("change", async () => {
  const projectId = projectSelect.value;
  if (!projectId) {
    activitySelect.innerHTML = `<option value="">Choisir un projet d'abord</option>`;
    return;
  }
  setMessage("Chargement des activités…", "");
  try {
    await loadActivities(projectId, null);
    setMessage("", "");
  } catch (error) {
    setMessage(error.message || String(error), "err");
  }
});

startBtn.addEventListener("click", async () => {
  const projectId = Number(projectSelect.value);
  const activityId = Number(activitySelect.value);
  const description = descriptionEl.value.trim();

  if (!projectId || !activityId) {
    setMessage("Projet et activité sont obligatoires.", "err");
    return;
  }
  if (!description) {
    setMessage("La description est obligatoire.", "err");
    return;
  }

  startBtn.disabled = true;
  stopBtn.disabled = true;
  setMessage("Démarrage…", "");

  try {
    let res = await send("START_TIMER", {
      projectId,
      activityId,
      description,
      stopExisting: false,
    });
    if (!res?.ok) throw new Error(res?.error || "Échec du démarrage");

    if (res.data?.needsConfirmation) {
      const ok = window.confirm(
        "Un timer Kimai est déjà en cours. L’arrêter et démarrer celui-ci ?"
      );
      if (!ok) {
        setMessage("Démarrage annulé.", "");
        return;
      }
      res = await send("START_TIMER", {
        projectId,
        activityId,
        description,
        stopExisting: true,
      });
      if (!res?.ok) throw new Error(res?.error || "Échec du démarrage");
      if (res.data?.needsConfirmation) {
        throw new Error("Impossible d’arrêter le timer précédent.");
      }
    }

    setMessage("Timer démarré.", "ok");
    await refresh();
  } catch (error) {
    setMessage(error.message || String(error), "err");
  } finally {
    startBtn.disabled = false;
    stopBtn.disabled = false;
  }
});

saveBtn.addEventListener("click", async () => {
  if (!activeTimesheet?.id) return;
  const description = descriptionEl.value.trim();
  if (!description) {
    setMessage("La description ne peut pas être vide.", "err");
    return;
  }

  saveBtn.disabled = true;
  stopBtn.disabled = true;
  setMessage("Enregistrement…", "");
  try {
    const res = await send("UPDATE_TIMESHEET", {
      id: activeTimesheet.id,
      description,
    });
    if (!res?.ok) throw new Error(res?.error || "Échec enregistrement");
    activeTimesheet.description = description;
    setMessage("Description enregistrée.", "ok");
  } catch (error) {
    setMessage(error.message || String(error), "err");
  } finally {
    saveBtn.disabled = false;
    stopBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  saveBtn.disabled = true;
  stopBtn.disabled = true;
  setMessage("Arrêt…", "");
  try {
    const description = descriptionEl.value.trim();
    const res = await send("STOP_TIMER", {
      id: activeTimesheet?.id,
      description: activeTimesheet ? description || undefined : undefined,
    });
    if (!res?.ok) throw new Error(res?.error || "Échec de l’arrêt");
    setMessage("Timer arrêté.", "ok");
    await refresh();
  } catch (error) {
    setMessage(error.message || String(error), "err");
  } finally {
    startBtn.disabled = false;
    saveBtn.disabled = false;
    stopBtn.disabled = false;
  }
});

refreshBtn.addEventListener("click", () => {
  refresh().catch((error) => setMessage(error.message || String(error), "err"));
});

optionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh().catch((error) => {
  contextLabel.textContent = "Erreur";
  setMessage(error.message || String(error), "err");
});
