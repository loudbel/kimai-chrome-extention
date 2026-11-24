(() => {
  const PANEL_ID = "kimai-trello-panel-root";
  const BTN_ATTR = "data-kimai-card-btn";
  const SLOT_ATTR = "data-kimai-avatar-slot";

  /** @type {any[] | null} */
  let lastActive = null;
  let injectScheduled = false;

  function send(type, payload = {}) {
    return chrome.runtime.sendMessage({ type, ...payload });
  }

  function showToast(message, type = "") {
    const existing = document.querySelector(".kimai-trello-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `kimai-trello-toast ${type}`.trim();
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeCardUrl(href) {
    if (!href) return "";
    try {
      const url = new URL(href, "https://trello.com");
      const match = url.pathname.match(/\/c\/([a-zA-Z0-9]+)/);
      if (!match) return url.origin + url.pathname.replace(/\/$/, "");
      return `https://trello.com/c/${match[1]}`;
    } catch {
      return "";
    }
  }

  function getModalCardUrl() {
    return normalizeCardUrl(location.href);
  }

  function getModalCardTitle() {
    const selectors = [
      'textarea[data-testid="card-back-name"]',
      '[data-testid="card-back-title-input"]',
      "#card-back-name",
      ".js-card-detail-title-input",
      'h2[data-testid="card-back-name"]',
      ".window-title h2",
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const value =
        "value" in el && typeof el.value === "string"
          ? el.value
          : el.textContent || "";
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }

    return document.title.replace(/\s*\|.*$/, "").trim() || "Trello card";
  }

  function buildDescription(title, url) {
    return `${title}\n${url}`;
  }

  function descriptionMatchesCard(description, cardUrl) {
    if (!description || !cardUrl) return false;
    return String(description).includes(cardUrl);
  }

  function findCardRoots() {
    const roots = new Set();
    document
      .querySelectorAll(
        '[data-testid="trello-card"], a.list-card[href*="/c/"], [data-testid="list-card"]'
      )
      .forEach((el) => roots.add(el));

    // Fallback: any card name link's closest card container
    document
      .querySelectorAll('a[href*="/c/"][data-testid="card-name"]')
      .forEach((anchor) => {
        const root =
          anchor.closest('[data-testid="trello-card"]') ||
          anchor.closest("a.list-card") ||
          anchor.closest('[data-testid="list-card"]') ||
          anchor.parentElement;
        if (root) roots.add(root);
      });

    return Array.from(roots);
  }

  /**
   * @param {Element} cardRoot
   */
  function resolveCardInfoFromRoot(cardRoot) {
    const anchor =
      cardRoot.matches('a[href*="/c/"]')
        ? cardRoot
        : cardRoot.querySelector('a[href*="/c/"]');
    const href =
      (anchor && (anchor.getAttribute("href") || anchor.href)) || "";
    const url = normalizeCardUrl(href);
    const titleEl =
      cardRoot.querySelector('[data-testid="card-name"]') || anchor;
    const title = (titleEl?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    return { title: title || "Trello card", url };
  }

  /**
   * Prefer inserting just before assigned member avatars.
   * @param {Element} cardRoot
   * @returns {{ host: Element, before: Element | null } | null}
   */
  function findAvatarMount(cardRoot) {
    const firstMember =
      cardRoot.querySelector('[data-testid="card-front-member"]') ||
      cardRoot.querySelector(".member") ||
      cardRoot.querySelector('[data-testid="card-front-members"] > *');

    if (firstMember) {
      const host =
        firstMember.closest('[data-testid="card-front-members"]') ||
        firstMember.parentElement;
      if (host) {
        return { host, before: firstMember };
      }
    }

    const membersHost =
      cardRoot.querySelector('[data-testid="card-front-members"]') ||
      cardRoot.querySelector(".list-card-members");
    if (membersHost) {
      return { host: membersHost, before: membersHost.firstElementChild };
    }

    // No assignee yet: place in badges / footer row if present
    const badges =
      cardRoot.querySelector('[data-testid="card-front-badges"]') ||
      cardRoot.querySelector(".badges") ||
      cardRoot.querySelector(".list-card-details");
    if (badges) {
      return { host: badges, before: null };
    }

    return { host: cardRoot, before: null };
  }

  function scheduleInject() {
    if (injectScheduled) return;
    injectScheduled = true;
    requestAnimationFrame(() => {
      injectScheduled = false;
      injectCardButtons();
      paintRunningState();
    });
  }

  /**
   * @param {Element} cardRoot
   */
  function ensureCardButton(cardRoot) {
    if (!(cardRoot instanceof HTMLElement)) return;
    if (cardRoot.querySelector(`[${BTN_ATTR}]:not([${BTN_ATTR}="modal"])`)) {
      return;
    }

    const info = resolveCardInfoFromRoot(cardRoot);
    if (!info.url) return;

    const mount = findAvatarMount(cardRoot);
    if (!mount) return;

    let slot = mount.host.querySelector(`[${SLOT_ATTR}]`);
    if (!slot) {
      slot = document.createElement("span");
      slot.setAttribute(SLOT_ATTR, "1");
      slot.className = "kimai-avatar-slot";
      if (mount.before && mount.before.parentElement === mount.host) {
        mount.host.insertBefore(slot, mount.before);
      } else {
        mount.host.prepend(slot);
      }
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute(BTN_ATTR, "1");
    btn.setAttribute("data-kimai-card-url", info.url);
    btn.className = "kimai-card-btn";
    btn.title = "Démarrer / arrêter un timer Kimai";
    btn.setAttribute("aria-label", "Kimai timer");
    btn.textContent = "K";

    btn.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const fresh = resolveCardInfoFromRoot(cardRoot);
        openPanel({
          title: fresh.title,
          url: fresh.url || info.url,
        });
      },
      true
    );

    slot.appendChild(btn);
  }

  function injectCardButtons() {
    for (const cardRoot of findCardRoots()) {
      ensureCardButton(cardRoot);
    }

    // Also next to modal title when a card is open
    injectModalTitleButton();
  }

  function injectModalTitleButton() {
    const modalUrl = getModalCardUrl();
    if (!modalUrl) {
      document.querySelector(`[${BTN_ATTR}="modal"]`)?.remove();
      return;
    }

    const titleHost =
      document.querySelector('[data-testid="card-back-name"]')?.parentElement ||
      document.querySelector(".js-card-detail-title-input")?.parentElement ||
      document.querySelector('[data-testid="card-back-title-input"]')
        ?.parentElement ||
      document.querySelector(".window-title");

    if (!titleHost) return;
    if (titleHost.querySelector(`[${BTN_ATTR}="modal"]`)) return;

    titleHost.classList.add("kimai-modal-title-host");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute(BTN_ATTR, "modal");
    btn.setAttribute("data-kimai-card-url", modalUrl);
    btn.className = "kimai-card-btn kimai-card-btn--modal";
    btn.title = "Démarrer / arrêter un timer Kimai";
    btn.setAttribute("aria-label", "Kimai timer");
    btn.textContent = "Kimai";

    btn.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPanel({
          title: getModalCardTitle(),
          url: getModalCardUrl(),
        });
      },
      true
    );

    titleHost.appendChild(btn);
  }

  async function refreshActive() {
    try {
      const res = await send("GET_ACTIVE");
      if (!res?.ok) return;
      lastActive = res.data || [];
      paintRunningState();
    } catch {
      // ignore
    }
  }

  function paintRunningState() {
    const active = lastActive || [];
    document.querySelectorAll(`[${BTN_ATTR}]`).forEach((btn) => {
      const url = btn.getAttribute("data-kimai-card-url") || "";
      const matching = active.some((entry) =>
        descriptionMatchesCard(entry.description, url)
      );
      btn.classList.toggle("is-running", matching);
      if (btn.getAttribute(BTN_ATTR) === "modal") {
        btn.textContent = matching ? "Kimai · en cours" : "Kimai";
      }
    });
  }

  function closePanel() {
    document.getElementById(PANEL_ID)?.remove();
  }

  function setPanelStatus(el, message, type = "") {
    el.textContent = message || "";
    el.className = `kimai-trello-status ${type}`.trim();
  }

  async function loadActivities(projectId, selectEl, preferredId) {
    selectEl.disabled = true;
    selectEl.innerHTML = `<option value="">Chargement…</option>`;
    const res = await send("GET_ACTIVITIES", { projectId: Number(projectId) });
    if (!res?.ok) {
      selectEl.innerHTML = `<option value="">Erreur</option>`;
      throw new Error(res?.error || "Échec des activités");
    }

    const activities = res.data || [];
    selectEl.innerHTML = `<option value="">Choisir une activité</option>`;
    for (const activity of activities) {
      const opt = document.createElement("option");
      opt.value = String(activity.id);
      opt.textContent = activity.name;
      selectEl.appendChild(opt);
    }

    const preferred =
      preferredId != null &&
      activities.some((a) => Number(a.id) === Number(preferredId))
        ? String(preferredId)
        : "";
    selectEl.value = preferred;
    selectEl.disabled = false;
  }

  function entityId(value) {
    if (value == null) return null;
    if (typeof value === "object") return Number(value.id);
    return Number(value);
  }

  /**
   * @param {{ title: string, url: string }} card
   */
  async function openPanel(card) {
    closePanel();

    const title = card.title || "Trello card";
    const cardUrl = card.url || getModalCardUrl();
    const defaultDescription = buildDescription(title, cardUrl);

    const root = document.createElement("div");
    root.id = PANEL_ID;
    root.className = "kimai-trello-panel-root";
    root.innerHTML = `
      <div class="kimai-trello-panel" role="dialog" aria-modal="true" aria-label="Timer Kimai">
        <h2>Timer Kimai</h2>
        <p class="kimai-trello-card-title">${escapeHtml(title)}</p>
        <div class="kimai-trello-field">
          <label for="kimai-project">Projet</label>
          <select id="kimai-project"></select>
        </div>
        <div class="kimai-trello-field">
          <label for="kimai-activity">Activité</label>
          <select id="kimai-activity"></select>
        </div>
        <div class="kimai-trello-field">
          <label for="kimai-description">Description</label>
          <textarea id="kimai-description" rows="4"></textarea>
        </div>
        <div class="kimai-trello-actions">
          <button type="button" class="primary" data-action="start">Démarrer</button>
          <button type="button" class="ghost" data-action="save-desc" hidden>Enregistrer</button>
          <button type="button" class="danger" data-action="stop" hidden>Arrêter</button>
          <button type="button" class="ghost" data-action="close">Fermer</button>
        </div>
        <p class="kimai-trello-status">Chargement…</p>
      </div>
    `;

    document.body.appendChild(root);

    const closeBtn = root.querySelector('[data-action="close"]');
    const panel = root.querySelector(".kimai-trello-panel");
    const projectSelect = root.querySelector("#kimai-project");
    const activitySelect = root.querySelector("#kimai-activity");
    const descriptionEl = root.querySelector("#kimai-description");
    const startBtn = root.querySelector('[data-action="start"]');
    const saveDescBtn = root.querySelector('[data-action="save-desc"]');
    const stopBtn = root.querySelector('[data-action="stop"]');
    const statusEl = root.querySelector(".kimai-trello-status");

    descriptionEl.value = defaultDescription;

    root.addEventListener("click", (event) => {
      if (event.target === root) closePanel();
    });
    closeBtn?.addEventListener("click", closePanel);
    panel?.addEventListener("click", (event) => event.stopPropagation());

    /** @type {any | null} */
    let matchingActive = null;

    try {
      const [projectsRes, activeRes, rememberedRes] = await Promise.all([
        send("GET_PROJECTS"),
        send("GET_ACTIVE"),
        send("GET_REMEMBERED"),
      ]);

      if (!projectsRes?.ok) {
        throw new Error(projectsRes?.error || "Échec projets");
      }
      if (!activeRes?.ok) throw new Error(activeRes?.error || "Échec actifs");
      if (!rememberedRes?.ok) {
        throw new Error(rememberedRes?.error || "Échec mémoire");
      }

      const projects = projectsRes.data || [];
      const active = activeRes.data || [];
      const remembered = rememberedRes.data || {};
      lastActive = active;

      projectSelect.innerHTML = `<option value="">Choisir un projet</option>`;
      for (const project of projects) {
        const opt = document.createElement("option");
        opt.value = String(project.id);
        opt.textContent = project.name;
        projectSelect.appendChild(opt);
      }

      matchingActive = active.find((entry) =>
        descriptionMatchesCard(entry.description, cardUrl)
      );

      const preferredProject = matchingActive
        ? entityId(matchingActive.project)
        : remembered.lastProjectId;
      const preferredActivity = matchingActive
        ? entityId(matchingActive.activity)
        : remembered.lastActivityId;

      if (
        preferredProject != null &&
        projects.some((p) => Number(p.id) === Number(preferredProject))
      ) {
        projectSelect.value = String(preferredProject);
        await loadActivities(
          preferredProject,
          activitySelect,
          preferredActivity
        );
      } else {
        activitySelect.innerHTML = `<option value="">Choisir un projet d'abord</option>`;
      }

      if (matchingActive) {
        descriptionEl.value =
          matchingActive.description || defaultDescription;
        startBtn.hidden = true;
        saveDescBtn.hidden = false;
        stopBtn.hidden = false;
        projectSelect.disabled = true;
        activitySelect.disabled = true;
        setPanelStatus(
          statusEl,
          `Timer en cours (#${matchingActive.id}) — éditez la description puis arrêtez.`,
          "ok"
        );
      } else if (active.length > 0) {
        stopBtn.hidden = false;
        saveDescBtn.hidden = true;
        startBtn.hidden = false;
        setPanelStatus(
          statusEl,
          `Un autre timer tourne (${active.length}). Vérifiez la description avant de démarrer.`,
          ""
        );
      } else {
        stopBtn.hidden = true;
        saveDescBtn.hidden = true;
        startBtn.hidden = false;
        setPanelStatus(
          statusEl,
          "Modifiez la description si besoin, puis démarrez.",
          ""
        );
      }

      paintRunningState();

      projectSelect.addEventListener("change", async () => {
        const projectId = projectSelect.value;
        if (!projectId) {
          activitySelect.innerHTML = `<option value="">Choisir un projet d'abord</option>`;
          return;
        }
        setPanelStatus(statusEl, "Chargement des activités…", "");
        try {
          await loadActivities(projectId, activitySelect, null);
          setPanelStatus(statusEl, "", "");
        } catch (error) {
          setPanelStatus(statusEl, error.message || String(error), "err");
        }
      });

      saveDescBtn.addEventListener("click", async () => {
        if (!matchingActive?.id) return;
        const nextDescription = descriptionEl.value.trim();
        if (!nextDescription) {
          setPanelStatus(statusEl, "La description ne peut pas être vide.", "err");
          return;
        }
        saveDescBtn.disabled = true;
        stopBtn.disabled = true;
        setPanelStatus(statusEl, "Enregistrement…", "");
        try {
          const res = await send("UPDATE_TIMESHEET", {
            id: matchingActive.id,
            description: nextDescription,
          });
          if (!res?.ok) throw new Error(res?.error || "Échec enregistrement");
          matchingActive.description = nextDescription;
          showToast("Description mise à jour", "ok");
          setPanelStatus(statusEl, "Description enregistrée.", "ok");
          await refreshActive();
        } catch (error) {
          setPanelStatus(statusEl, error.message || String(error), "err");
          showToast(error.message || String(error), "err");
        } finally {
          saveDescBtn.disabled = false;
          stopBtn.disabled = false;
        }
      });

      startBtn.addEventListener("click", async () => {
        const projectId = Number(projectSelect.value);
        const activityId = Number(activitySelect.value);
        const description = descriptionEl.value.trim();
        if (!projectId || !activityId) {
          setPanelStatus(
            statusEl,
            "Projet et activité sont obligatoires.",
            "err"
          );
          return;
        }
        if (!description) {
          setPanelStatus(statusEl, "La description est obligatoire.", "err");
          return;
        }

        startBtn.disabled = true;
        stopBtn.disabled = true;
        setPanelStatus(statusEl, "Démarrage…", "");

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
              "Un timer Kimai est déjà en cours. L’arrêter et démarrer celui de cette carte ?"
            );
            if (!ok) {
              setPanelStatus(statusEl, "Démarrage annulé.", "");
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

          matchingActive = res.data?.timesheet || null;
          showToast("Timer Kimai démarré", "ok");
          setPanelStatus(statusEl, "Timer démarré.", "ok");
          startBtn.hidden = true;
          saveDescBtn.hidden = false;
          stopBtn.hidden = false;
          projectSelect.disabled = true;
          activitySelect.disabled = true;
          await refreshActive();
        } catch (error) {
          setPanelStatus(statusEl, error.message || String(error), "err");
          showToast(error.message || String(error), "err");
        } finally {
          startBtn.disabled = false;
          stopBtn.disabled = false;
        }
      });

      stopBtn.addEventListener("click", async () => {
        startBtn.disabled = true;
        saveDescBtn.disabled = true;
        stopBtn.disabled = true;
        setPanelStatus(statusEl, "Arrêt…", "");
        try {
          const description = descriptionEl.value.trim();
          const res = await send("STOP_TIMER", {
            id: matchingActive?.id,
            // Only update description when stopping this card's own timer
            description: matchingActive
              ? description || undefined
              : undefined,
          });
          if (!res?.ok) throw new Error(res?.error || "Échec de l’arrêt");
          showToast("Timer Kimai arrêté", "ok");
          setPanelStatus(statusEl, "Timer arrêté.", "ok");
          matchingActive = null;
          stopBtn.hidden = true;
          saveDescBtn.hidden = true;
          startBtn.hidden = false;
          projectSelect.disabled = false;
          activitySelect.disabled = false;
          descriptionEl.value = defaultDescription;
          await refreshActive();
        } catch (error) {
          setPanelStatus(statusEl, error.message || String(error), "err");
          showToast(error.message || String(error), "err");
        } finally {
          startBtn.disabled = false;
          saveDescBtn.disabled = false;
          stopBtn.disabled = false;
        }
      });
    } catch (error) {
      setPanelStatus(statusEl, error.message || String(error), "err");
      if (/not configured/i.test(error.message || "")) {
        showToast(
          "Configurez Kimai dans les options de l’extension d’abord.",
          "err"
        );
      }
    }
  }

  const observer = new MutationObserver(() => scheduleInject());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("popstate", scheduleInject);
  setInterval(() => {
    scheduleInject();
    refreshActive();
  }, 4000);

  scheduleInject();
  refreshActive();
})();
