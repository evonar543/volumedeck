const form = document.querySelector("#settingsForm");
const statusLine = document.querySelector("#saveStatus");
let rules = [];

function setStatus(message) {
  statusLine.textContent = message;
  window.setTimeout(() => {
    if (statusLine.textContent === message) statusLine.textContent = "";
  }, 2400);
}

function readSettingsFromForm() {
  return {
    boostLimit: Number(form.boostLimit.value),
    newTabBehavior: form.newTabBehavior.value,
    theme: form.theme.value,
    metersEnabled: form.metersEnabled.checked,
    compactMode: form.compactMode.checked,
    autoMuteNewTabs: form.autoMuteNewTabs.checked
  };
}

function populateForm(settings) {
  form.boostLimit.value = settings.boostLimit;
  form.newTabBehavior.value = settings.newTabBehavior;
  form.theme.value = settings.theme;
  form.metersEnabled.checked = Boolean(settings.metersEnabled);
  form.compactMode.checked = Boolean(settings.compactMode);
  form.autoMuteNewTabs.checked = Boolean(settings.autoMuteNewTabs);
}

async function saveRules() {
  await VolumeDeckStorage.saveRules(rules);
  setStatus("Domain rules saved.");
}

function renderRules() {
  const list = document.querySelector("#domainRules");
  list.innerHTML = "";

  rules.forEach((rule) => {
    const node = document.querySelector("#ruleTemplate").content.firstElementChild.cloneNode(true);
    node.querySelector('[data-field="domain"]').value = rule.domain;
    node.querySelector('[data-field="action"]').value = rule.action;
    node.querySelector('[data-field="value"]').value = rule.value;
    node.querySelector('[data-field="enabled"]').checked = Boolean(rule.enabled);

    node.querySelectorAll("[data-field]").forEach((field) => {
      field.addEventListener("change", async () => {
        const key = field.dataset.field;
        rule[key] = key === "value" ? Number(field.value) : key === "enabled" ? field.checked : field.value;
        rule.label = `${rule.enabled ? "Apply" : "Disabled"} ${rule.action} on ${rule.domain}`;
        await saveRules();
      });
    });

    node.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      rules = rules.filter((item) => item.id !== rule.id);
      renderRules();
      await saveRules();
    });

    list.append(node);
  });
}

async function init() {
  const data = await VolumeDeckStorage.ensureDefaults();
  rules = data.rules;
  populateForm(data.settings);
  renderRules();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await VolumeDeckStorage.saveSettings(readSettingsFromForm());
    setStatus("Settings saved.");
  });

  document.querySelector("#addRule").addEventListener("click", async () => {
    rules.unshift({
      id: `rule-${Date.now()}`,
      domain: "example.com",
      action: "set-volume",
      value: 100,
      enabled: true,
      label: "Apply set-volume on example.com"
    });
    renderRules();
    await saveRules();
  });

  document.querySelector("#exportJson").addEventListener("click", async () => {
    document.querySelector("#jsonData").value = JSON.stringify(await VolumeDeckStorage.exportData(), null, 2);
    setStatus("Settings exported.");
  });

  document.querySelector("#importJson").addEventListener("click", async () => {
    try {
      const imported = JSON.parse(document.querySelector("#jsonData").value);
      const nextData = await VolumeDeckStorage.importData(imported);
      rules = nextData.rules;
      populateForm(nextData.settings);
      renderRules();
      setStatus("Settings imported.");
    } catch {
      setStatus("Import failed. Check the JSON format.");
    }
  });

  document.querySelector("#resetAll").addEventListener("click", async () => {
    if (!confirm("Reset all VolumeDeck settings, presets, and rules?")) return;
    const nextData = await VolumeDeckStorage.reset();
    rules = nextData.rules;
    populateForm(nextData.settings);
    renderRules();
    document.querySelector("#jsonData").value = "";
    setStatus("VolumeDeck has been reset.");
  });
}

init();
