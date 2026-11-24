import { getSettings, saveSettings } from "../lib/storage.js";

const form = document.getElementById("options-form");
const statusEl = document.getElementById("status");
const testBtn = document.getElementById("test-btn");

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type || ""}`.trim();
}

async function load() {
  const settings = await getSettings();
  form.baseUrl.value = settings.baseUrl || "";
  form.userName.value = settings.userName || "";
  form.apiKey.value = settings.apiKey || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings({
    baseUrl: form.baseUrl.value.trim(),
    userName: form.userName.value.trim(),
    apiKey: form.apiKey.value.trim(),
  });
  setStatus("Configuration enregistrée.", "ok");
});

testBtn.addEventListener("click", async () => {
  setStatus("Test en cours…", "");
  await saveSettings({
    baseUrl: form.baseUrl.value.trim(),
    userName: form.userName.value.trim(),
    apiKey: form.apiKey.value.trim(),
  });

  const response = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION" });
  if (response?.ok) {
    setStatus("Connexion OK — API Kimai joignable.", "ok");
  } else {
    setStatus(response?.error || "Échec de la connexion.", "err");
  }
});

load().catch((error) => {
  setStatus(error.message || String(error), "err");
});
