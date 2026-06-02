const SETTINGS_KEY = "dominic-deals-settings";
const SAVED_KEY = "dominic-deals-saved";
const CONSENT_KEY = "dominic-deals-preference-consent";
const MODULES = [
  { key: "hero", label: "Hero" },
  { key: "controls", label: "Search" },
  { key: "stats", label: "Stats" },
  { key: "views", label: "Tabs" }
];
const VIEW_TABS = [
  { key: "deals", label: "Deals" },
  { key: "saved", label: "Saved" },
  { key: "alerts", label: "Alerts" }
];
const SIDE_PANELS = [
  { key: "tracker", label: "Tracker" },
  { key: "account", label: "Account" },
  { key: "alerts", label: "Alerts" },
  { key: "style", label: "Style" }
];
const DEFAULT_SETTINGS = {
  theme: "system",
  accent: "electric",
  motion: true,
  density: "comfortable",
  customColors: {
    accent: "#f7d117",
    accent2: "#12b7ff",
    good: "#00875a",
    danger: "#d92d20",
    wash: "#f7f2df"
  },
  moduleOrder: MODULES.map((item) => item.key),
  viewOrder: VIEW_TABS.map((item) => item.key),
  sideOrder: SIDE_PANELS.map((item) => item.key)
};

const state = {
  category: "all",
  view: "deals",
  sidePanel: "tracker",
  deals: [],
  alerts: [],
  user: null,
  saved: loadSaved(),
  settings: loadSettings(),
  providerStatus: { email: false, sms: false }
};

const elements = {
  sourcePill: document.querySelector("#sourcePill"),
  mainColumn: document.querySelector(".main-column"),
  tabsNav: document.querySelector(".tabs"),
  sideMenu: document.querySelector(".side-menu"),
  sideStack: document.querySelector(".side-panel-stack"),
  themeToggle: document.querySelector("#themeToggle"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  sidePanelButtons: document.querySelectorAll("[data-side-panel]"),
  sidePanels: document.querySelectorAll("[data-side-panel-content]"),
  motionToggle: document.querySelector("#motionToggle"),
  denseToggle: document.querySelector("#denseToggle"),
  searchInput: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  findButton: document.querySelector("#findButton"),
  heroPennyScanButton: document.querySelector("#heroPennyScanButton"),
  heroSubcopy: document.querySelector("#heroSubcopy"),
  categoryButtons: document.querySelector("#categoryButtons"),
  discountSlider: document.querySelector("#discountSlider"),
  discountValue: document.querySelector("#discountValue"),
  maxPriceInput: document.querySelector("#maxPriceInput"),
  openBoxToggle: document.querySelector("#openBoxToggle"),
  sortSelect: document.querySelector("#sortSelect"),
  dealCount: document.querySelector("#dealCount"),
  avgSavings: document.querySelector("#avgSavings"),
  lastUpdated: document.querySelector("#lastUpdated"),
  pennyCount: document.querySelector("#pennyCount"),
  messageBox: document.querySelector("#messageBox"),
  dealList: document.querySelector("#dealList"),
  backgroundCanvas: document.querySelector("#dealBackground"),
  dealToy: document.querySelector("#dealToy"),
  toyChips: document.querySelectorAll("[data-toy-chip]"),
  tabs: document.querySelectorAll(".tab"),
  themeOptions: document.querySelectorAll("[data-theme-option]"),
  accentOptions: document.querySelectorAll("[data-accent-option]"),
  colorInputs: document.querySelectorAll("[data-color-key]"),
  moduleOrderList: document.querySelector("#moduleOrderList"),
  viewOrderList: document.querySelector("#viewOrderList"),
  sideOrderList: document.querySelector("#sideOrderList"),
  cookiePrompt: document.querySelector("#cookiePrompt"),
  acceptCookiesButton: document.querySelector("#acceptCookiesButton"),
  declineCookiesButton: document.querySelector("#declineCookiesButton"),
  authForm: document.querySelector("#authForm"),
  authName: document.querySelector("#authName"),
  authEmail: document.querySelector("#authEmail"),
  authPhone: document.querySelector("#authPhone"),
  authPassword: document.querySelector("#authPassword"),
  registerButton: document.querySelector("#registerButton"),
  loginButton: document.querySelector("#loginButton"),
  logoutButton: document.querySelector("#logoutButton"),
  accountTitle: document.querySelector("#accountTitle"),
  accountSummary: document.querySelector("#accountSummary"),
  accountName: document.querySelector("#accountName"),
  accountEmail: document.querySelector("#accountEmail"),
  accountPhone: document.querySelector("#accountPhone"),
  profilePhoneInput: document.querySelector("#profilePhoneInput"),
  notifyStatus: document.querySelector("#notifyStatus"),
  pennyThresholdInput: document.querySelector("#pennyThresholdInput"),
  pennyPercentInput: document.querySelector("#pennyPercentInput"),
  notifyEmailToggle: document.querySelector("#notifyEmailToggle"),
  notifySmsToggle: document.querySelector("#notifySmsToggle"),
  soldOutToggle: document.querySelector("#soldOutToggle"),
  savePrefsButton: document.querySelector("#savePrefsButton"),
  testNotificationButton: document.querySelector("#testNotificationButton"),
  pennyScanButton: document.querySelector("#pennyScanButton"),
  alertFeed: document.querySelector("#alertFeed"),
  lastScanPill: document.querySelector("#lastScanPill")
};

let backgroundRenderer;
let dealToyController;
let accountSyncTimer = 0;
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const desktopQuery = window.matchMedia("(min-width: 980px)");

document.addEventListener("DOMContentLoaded", () => {
  applySettings();
  applyLayoutSettings();
  renderCustomizationControls();
  updateDeviceMode();
  wireEvents();
  showCookiePromptIfNeeded();
  backgroundRenderer = createDealBackground(elements.backgroundCanvas);
  dealToyController = createDealToy(elements.dealToy, elements.toyChips);
  updateMotion();
  refreshIcons();
  loadStatus();
  loadAccount();
  loadAlerts();
  loadDeals();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
});

function wireEvents() {
  elements.findButton.addEventListener("click", loadDeals);
  elements.refreshButton.addEventListener("click", loadDeals);
  elements.themeToggle.addEventListener("click", cycleTheme);
  elements.settingsButton.addEventListener("click", toggleSettings);
  elements.registerButton.addEventListener("click", registerAccount);
  elements.loginButton.addEventListener("click", loginAccount);
  elements.logoutButton.addEventListener("click", logoutAccount);
  elements.savePrefsButton.addEventListener("click", saveWatchPrefs);
  elements.testNotificationButton.addEventListener("click", testNotification);
  elements.pennyScanButton.addEventListener("click", runPennyScan);
  elements.heroPennyScanButton.addEventListener("click", runPennyScan);
  elements.acceptCookiesButton.addEventListener("click", acceptPreferenceStorage);
  elements.declineCookiesButton.addEventListener("click", declinePreferenceStorage);

  elements.sidePanelButtons.forEach((button) => {
    button.addEventListener("click", () => activateSidePanel(button.dataset.sidePanel));
  });

  elements.themeOptions.forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.theme = button.dataset.themeOption;
      persistSettings();
    });
  });

  elements.accentOptions.forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.accent = button.dataset.accentOption;
      persistSettings();
    });
  });

  elements.colorInputs.forEach((input) => {
    input.addEventListener("input", () => commitCustomColor(input, false));
    input.addEventListener("change", () => commitCustomColor(input, true));
  });

  [elements.moduleOrderList, elements.viewOrderList, elements.sideOrderList].forEach((list) => {
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-order-kind][data-order-key][data-order-move]");
      if (!button) return;
      moveOrderItem(button.dataset.orderKind, button.dataset.orderKey, Number(button.dataset.orderMove));
    });
  });

  elements.motionToggle.addEventListener("change", () => {
    state.settings.motion = elements.motionToggle.checked;
    persistSettings();
  });

  elements.denseToggle.addEventListener("change", () => {
    state.settings.density = elements.denseToggle.checked ? "compact" : "comfortable";
    persistSettings();
  });

  systemThemeQuery.addEventListener("change", () => {
    if (state.settings.theme === "system") applySettings();
  });
  desktopQuery.addEventListener("change", updateDeviceMode);

  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadDeals();
  });

  elements.authPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginAccount();
  });

  elements.discountSlider.addEventListener("input", () => {
    elements.discountValue.textContent = `${elements.discountSlider.value}%`;
  });
  elements.discountSlider.addEventListener("change", loadDeals);
  elements.maxPriceInput.addEventListener("change", loadDeals);
  elements.openBoxToggle.addEventListener("change", loadDeals);
  elements.sortSelect.addEventListener("change", loadDeals);

  elements.categoryButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    document.querySelectorAll("[data-category]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    loadDeals();
  });

  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view;
      elements.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      render();
    });
  });
}

function updateDeviceMode() {
  document.documentElement.dataset.device = desktopQuery.matches ? "desktop" : "mobile";
}

function canStorePreferences() {
  return localStorage.getItem(CONSENT_KEY) === "accepted";
}

function showCookiePromptIfNeeded() {
  if (!localStorage.getItem(CONSENT_KEY)) {
    elements.cookiePrompt.classList.remove("hidden");
  }
}

function acceptPreferenceStorage() {
  localStorage.setItem(CONSENT_KEY, "accepted");
  elements.cookiePrompt.classList.add("hidden");
  persistSettings({ syncAccount: true });
  saveSaved();
}

function declinePreferenceStorage() {
  localStorage.setItem(CONSENT_KEY, "declined");
  elements.cookiePrompt.classList.add("hidden");
}

function toggleSettings() {
  activateSidePanel("style");
  elements.settingsButton.setAttribute("aria-expanded", "true");
  document.querySelector(".side-shell")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function activateSidePanel(panel) {
  state.sidePanel = panel || "tracker";
  elements.sidePanelButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.sidePanel === state.sidePanel);
  });
  elements.sidePanels.forEach((section) => {
    section.classList.toggle("active", section.dataset.sidePanelContent === state.sidePanel);
  });
  elements.settingsButton.setAttribute("aria-expanded", String(state.sidePanel === "style"));
}

function cycleTheme() {
  const resolved = resolveTheme(state.settings.theme);
  state.settings.theme = resolved === "dark" ? "light" : "dark";
  persistSettings();
}

function persistSettings(options = {}) {
  const {
    syncAccount = true,
    layout = true,
    controls = true,
    colorInputs = true,
    icons = true
  } = options;
  state.settings = normalizeSettings(state.settings);
  if (canStorePreferences()) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }
  applySettings({ colorInputs, icons });
  if (layout) applyLayoutSettings();
  if (controls) renderCustomizationControls();
  if (syncAccount) scheduleAccountSettingsSync();
}

function applySettings(options = {}) {
  const { colorInputs = true, icons = true } = options;
  state.settings = normalizeSettings(state.settings);
  const resolvedTheme = resolveTheme(state.settings.theme);
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.accent = state.settings.accent;
  root.dataset.density = state.settings.density;
  root.dataset.motion = state.settings.motion ? "on" : "off";

  root.style.removeProperty("--accent");
  root.style.removeProperty("--accent-2");
  root.style.removeProperty("--good");
  root.style.removeProperty("--danger");
  root.style.removeProperty("--wash");

  if (state.settings.accent === "custom") {
    root.style.setProperty("--accent", state.settings.customColors.accent);
    root.style.setProperty("--accent-2", state.settings.customColors.accent2);
    root.style.setProperty("--good", state.settings.customColors.good);
    root.style.setProperty("--danger", state.settings.customColors.danger);
    root.style.setProperty("--wash", state.settings.customColors.wash);
  }

  const themeColor = resolvedTheme === "dark" ? "#080b12" : "#f7d117";
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", themeColor);

  elements.themeOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.themeOption === state.settings.theme);
  });
  elements.accentOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.accentOption === state.settings.accent);
  });
  if (colorInputs) {
    elements.colorInputs.forEach((input) => {
      input.value = state.settings.customColors[input.dataset.colorKey] || input.value;
    });
  }
  elements.motionToggle.checked = state.settings.motion;
  elements.denseToggle.checked = state.settings.density === "compact";
  elements.themeToggle.innerHTML = `<i data-lucide="${resolvedTheme === "dark" ? "sun" : "moon"}"></i>`;
  updateMotion();
  if (icons) refreshIcons();
}

function resolveTheme(theme) {
  if (theme === "dark" || theme === "light") return theme;
  return systemThemeQuery.matches ? "dark" : "light";
}

function normalizeSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  next.customColors = { ...DEFAULT_SETTINGS.customColors, ...(settings?.customColors || {}) };
  next.moduleOrder = normalizeOrder(next.moduleOrder, MODULES);
  next.viewOrder = normalizeOrder(next.viewOrder, VIEW_TABS);
  next.sideOrder = normalizeOrder(next.sideOrder, SIDE_PANELS);
  if (!["system", "light", "dark"].includes(next.theme)) next.theme = DEFAULT_SETTINGS.theme;
  if (!["electric", "pulse", "signal", "midnight", "citrus", "mono", "custom"].includes(next.accent)) {
    next.accent = DEFAULT_SETTINGS.accent;
  }
  next.motion = Boolean(next.motion);
  next.density = next.density === "compact" ? "compact" : "comfortable";
  return next;
}

function normalizeOrder(order, reference) {
  const valid = reference.map((item) => item.key);
  const incoming = Array.isArray(order) ? order.filter((key) => valid.includes(key)) : [];
  return [...incoming, ...valid.filter((key) => !incoming.includes(key))];
}

function applyLayoutSettings() {
  const messageAnchor = elements.messageBox;
  state.settings.moduleOrder.forEach((key) => {
    const module = document.querySelector(`[data-module="${key}"]`);
    if (module) elements.mainColumn.insertBefore(module, messageAnchor);
  });

  state.settings.viewOrder.forEach((key) => {
    const tab = elements.tabsNav.querySelector(`[data-view="${key}"]`);
    if (tab) elements.tabsNav.appendChild(tab);
  });

  state.settings.sideOrder.forEach((key) => {
    const button = elements.sideMenu.querySelector(`[data-side-panel="${key}"]`);
    const panel = elements.sideStack.querySelector(`[data-side-panel-content="${key}"]`);
    if (button) elements.sideMenu.appendChild(button);
    if (panel) elements.sideStack.appendChild(panel);
  });
}

function renderCustomizationControls() {
  renderOrderList(elements.moduleOrderList, "moduleOrder", state.settings.moduleOrder, MODULES);
  renderOrderList(elements.viewOrderList, "viewOrder", state.settings.viewOrder, VIEW_TABS);
  renderOrderList(elements.sideOrderList, "sideOrder", state.settings.sideOrder, SIDE_PANELS);
}

function renderOrderList(container, kind, order, reference) {
  const labels = Object.fromEntries(reference.map((item) => [item.key, item.label]));
  container.innerHTML = order.map((key, index) => `
    <div class="order-row">
      <span>${escapeHtml(labels[key] || key)}</span>
      <div>
        <button class="mini-icon" data-order-kind="${kind}" data-order-key="${key}" data-order-move="-1" type="button" aria-label="Move ${escapeAttribute(labels[key] || key)} up" ${index === 0 ? "disabled" : ""}>
          <i data-lucide="chevron-up"></i>
        </button>
        <button class="mini-icon" data-order-kind="${kind}" data-order-key="${key}" data-order-move="1" type="button" aria-label="Move ${escapeAttribute(labels[key] || key)} down" ${index === order.length - 1 ? "disabled" : ""}>
          <i data-lucide="chevron-down"></i>
        </button>
      </div>
    </div>
  `).join("");
  refreshIcons();
}

function moveOrderItem(kind, key, direction) {
  const order = [...state.settings[kind]];
  const index = order.indexOf(key);
  const nextIndex = index + direction;
  if (index === -1 || nextIndex < 0 || nextIndex >= order.length) return;
  [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
  state.settings[kind] = order;
  persistSettings();
}

function commitCustomColor(input, syncAccount) {
  if (!input?.dataset.colorKey) return;
  state.settings.accent = "custom";
  state.settings.customColors[input.dataset.colorKey] = input.value;
  state.settings = normalizeSettings(state.settings);
  if (canStorePreferences()) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }
  applyColorPreview();
  elements.accentOptions.forEach((button) => button.classList.toggle("active", false));
  if (syncAccount) scheduleAccountSettingsSync();
}

function applyColorPreview() {
  const root = document.documentElement;
  root.dataset.accent = state.settings.accent;
  root.style.removeProperty("--accent");
  root.style.removeProperty("--accent-2");
  root.style.removeProperty("--good");
  root.style.removeProperty("--danger");
  root.style.removeProperty("--wash");
  root.style.setProperty("--accent", state.settings.customColors.accent);
  root.style.setProperty("--accent-2", state.settings.customColors.accent2);
  root.style.setProperty("--good", state.settings.customColors.good);
  root.style.setProperty("--danger", state.settings.customColors.danger);
  root.style.setProperty("--wash", state.settings.customColors.wash);
}

function updateMotion() {
  if (dealToyController) {
    dealToyController.setEnabled(state.settings.motion);
  }
  if (!backgroundRenderer) return;
  if (state.settings.motion) {
    backgroundRenderer.start();
  } else {
    backgroundRenderer.stop();
  }
}

function createDealToy(toy, chips) {
  if (!toy || !chips?.length) {
    return { setEnabled() {} };
  }

  const popLabels = ["$0.01", "$4.97", "90% off", "carted", "sku ping"];
  const margin = 8;
  const physics = {
    bounce: 0.78,
    friction: 0.986,
    angularFriction: 0.982,
    maxSpeed: 18,
    stopSpeed: 0.06
  };
  const chipData = [...chips].map((chip) => ({
    chip,
    xPct: Number(chip.dataset.x || 0),
    yPct: Number(chip.dataset.y || 0),
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    vx: 0,
    vy: 0,
    spin: 0,
    angularVelocity: 0,
    rotate: Number(chip.dataset.rotate || 0),
    offsetX: 0,
    offsetY: 0,
    lastMoveAt: 0
  }));
  let enabled = true;
  let dragging = null;
  let bounds = { width: 0, height: 0 };
  let layoutReady = false;
  let animationFrame = 0;

  syncBounds();
  chipData.forEach((data) => data.chip.addEventListener("pointerdown", (event) => startChipDrag(event, data)));

  toy.addEventListener("pointermove", handlePointerMove);
  toy.addEventListener("pointerleave", () => {
    if (!dragging) resetToyTilt();
  });
  toy.addEventListener("pointerdown", (event) => {
    if (!enabled || event.target.closest("[data-toy-chip]")) return;
    const point = getToyPoint(event);
    kickNearestChip(point);
    spawnToyPop(point.x, point.y);
  });
  document.addEventListener("pointermove", handleDragMove);
  document.addEventListener("pointerup", finishChipDrag);
  window.addEventListener("resize", () => {
    syncBounds();
    renderAllChips();
  });

  function setEnabled(value) {
    enabled = Boolean(value);
    toy.classList.toggle("toy-paused", !enabled);
    if (!enabled) {
      stopPhysics();
      if (dragging) {
        dragging.chip.classList.remove("dragging");
        dragging = null;
      }
      resetToyTilt();
      chipData.forEach((data) => {
        data.vx = 0;
        data.vy = 0;
        data.angularVelocity = 0;
      });
    } else {
      syncBounds();
      renderAllChips();
    }
  }

  function handlePointerMove(event) {
    if (!enabled) return;
    const point = getToyPoint(event);
    tiltToy(point);
    if (!dragging) nudgeChipsFromPointer(point);
  }

  function startChipDrag(event, data) {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    syncBounds();
    const point = getToyPoint(event);
    data.offsetX = point.x - data.x;
    data.offsetY = point.y - data.y;
    data.vx = 0;
    data.vy = 0;
    data.lastMoveAt = performance.now();
    dragging = data;
    data.chip.classList.add("dragging");
    data.chip.setPointerCapture?.(event.pointerId);
  }

  function handleDragMove(event) {
    if (!enabled || !dragging) return;
    const now = performance.now();
    const point = getToyPoint(event);
    const nextX = clamp(point.x - dragging.offsetX, margin, maxX(dragging));
    const nextY = clamp(point.y - dragging.offsetY, margin, maxY(dragging));
    const elapsed = Math.max(12, now - dragging.lastMoveAt);
    const speedScale = 16.67 / elapsed;
    dragging.vx = clamp((nextX - dragging.x) * speedScale, -physics.maxSpeed, physics.maxSpeed);
    dragging.vy = clamp((nextY - dragging.y) * speedScale, -physics.maxSpeed, physics.maxSpeed);
    dragging.angularVelocity = clamp(dragging.vx * 0.08, -6, 6);
    dragging.x = nextX;
    dragging.y = nextY;
    dragging.lastMoveAt = now;
    applyChipPosition(dragging);
    resolveCollisions();
    renderAllChips();
    startPhysics();
  }

  function finishChipDrag(event) {
    if (!dragging) return;
    const finished = dragging;
    finished.chip.classList.remove("dragging");
    dragging = null;
    const point = getToyPoint(event);
    limitVelocity(finished);
    spawnToyPop(point.x, point.y);
    startPhysics();
  }

  function nudgeChipsFromPointer(point) {
    let moved = false;
    chipData.forEach((data) => {
      const centerX = data.x + data.w / 2;
      const centerY = data.y + data.h / 2;
      const dx = centerX - point.x;
      const dy = centerY - point.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = Math.max(0, 1 - distance / 120);
      if (!force) return;
      data.vx += (dx / distance) * force * 0.35;
      data.vy += (dy / distance) * force * 0.28;
      data.angularVelocity += (dx >= 0 ? 1 : -1) * force * 0.18;
      limitVelocity(data);
      moved = true;
    });
    if (moved) startPhysics();
  }

  function kickNearestChip(point) {
    const nearest = chipData
      .map((data) => {
        const dx = data.x + data.w / 2 - point.x;
        const dy = data.y + data.h / 2 - point.y;
        return { data, distance: Math.hypot(dx, dy), dx, dy };
      })
      .sort((a, b) => a.distance - b.distance)[0];

    if (!nearest) return;
    const distance = Math.max(1, nearest.distance);
    nearest.data.vx += (nearest.dx / distance) * 7;
    nearest.data.vy += (nearest.dy / distance) * 5.5;
    nearest.data.angularVelocity += (nearest.dx >= 0 ? 1 : -1) * 2.4;
    limitVelocity(nearest.data);
    startPhysics();
  }

  function tiltToy(point) {
    const xTilt = ((point.x / bounds.width) - 0.5) * 5;
    const yTilt = ((point.y / bounds.height) - 0.5) * -5;
    toy.style.setProperty("--tilt-x", `${xTilt.toFixed(2)}deg`);
    toy.style.setProperty("--tilt-y", `${yTilt.toFixed(2)}deg`);
  }

  function resetToyTilt() {
    toy.style.setProperty("--tilt-x", "0deg");
    toy.style.setProperty("--tilt-y", "0deg");
  }

  function startPhysics() {
    if (!enabled || animationFrame) return;
    animationFrame = requestAnimationFrame(stepPhysics);
  }

  function stopPhysics() {
    if (!animationFrame) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function stepPhysics() {
    animationFrame = 0;
    let moving = Boolean(dragging);

    chipData.forEach((data) => {
      if (data === dragging) return;
      data.x += data.vx;
      data.y += data.vy;
      data.spin += data.angularVelocity;
      data.vx *= physics.friction;
      data.vy *= physics.friction;
      data.angularVelocity *= physics.angularFriction;
      bounceOffWalls(data);
      if (Math.hypot(data.vx, data.vy) > physics.stopSpeed || Math.abs(data.angularVelocity) > physics.stopSpeed) {
        moving = true;
      } else {
        data.vx = 0;
        data.vy = 0;
        data.angularVelocity = 0;
      }
    });

    resolveCollisions();
    renderAllChips();
    if (moving && enabled) startPhysics();
  }

  function bounceOffWalls(data) {
    const right = maxX(data);
    const bottom = maxY(data);

    if (data.x < margin) {
      data.x = margin;
      data.vx = Math.abs(data.vx) * physics.bounce;
      data.angularVelocity += data.vx * 0.05;
    } else if (data.x > right) {
      data.x = right;
      data.vx = -Math.abs(data.vx) * physics.bounce;
      data.angularVelocity += data.vx * 0.05;
    }

    if (data.y < margin) {
      data.y = margin;
      data.vy = Math.abs(data.vy) * physics.bounce;
      data.angularVelocity -= data.vy * 0.04;
    } else if (data.y > bottom) {
      data.y = bottom;
      data.vy = -Math.abs(data.vy) * physics.bounce;
      data.angularVelocity -= data.vy * 0.04;
    }
  }

  function resolveCollisions() {
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < chipData.length; i += 1) {
        for (let j = i + 1; j < chipData.length; j += 1) {
          collideChips(chipData[i], chipData[j]);
        }
      }
    }
  }

  function collideChips(a, b) {
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;
    let dx = bx - ax;
    let dy = by - ay;
    let distance = Math.hypot(dx, dy);

    if (!distance) {
      distance = 1;
      dx = 1;
      dy = 0;
    }

    const radiusA = Math.max(a.w, a.h) * 0.54;
    const radiusB = Math.max(b.w, b.h) * 0.54;
    const minDistance = radiusA + radiusB;
    if (distance >= minDistance) return;

    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = minDistance - distance;
    const aPinned = a === dragging;
    const bPinned = b === dragging;

    if (aPinned && !bPinned) {
      b.x += nx * overlap;
      b.y += ny * overlap;
    } else if (bPinned && !aPinned) {
      a.x -= nx * overlap;
      a.y -= ny * overlap;
    } else {
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;
    }

    keepInBox(a);
    keepInBox(b);

    if (aPinned || bPinned) {
      const shoved = aPinned ? b : a;
      const direction = aPinned ? 1 : -1;
      const speed = Math.max(0.9, Math.hypot(a.vx - b.vx, a.vy - b.vy) * 0.55);
      shoved.vx += nx * speed * direction;
      shoved.vy += ny * speed * direction;
      shoved.angularVelocity += direction * speed * 0.12;
      limitVelocity(shoved);
      return;
    }

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const velocityAlongNormal = rvx * nx + rvy * ny;
    if (velocityAlongNormal > 0) return;

    const impulse = (-(1 + physics.bounce) * velocityAlongNormal) / 2;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
    a.angularVelocity -= impulse * 0.05;
    b.angularVelocity += impulse * 0.05;
    limitVelocity(a);
    limitVelocity(b);
  }

  function syncBounds() {
    const rect = toy.getBoundingClientRect();
    bounds = {
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height)
    };

    chipData.forEach((data) => {
      data.w = data.chip.offsetWidth || 76;
      data.h = data.chip.offsetHeight || 32;
      if (!layoutReady) {
        data.x = (data.xPct / 100) * bounds.width;
        data.y = (data.yPct / 100) * bounds.height;
      } else {
        data.x = (data.xPct / 100) * bounds.width;
        data.y = (data.yPct / 100) * bounds.height;
      }
      keepInBox(data);
      applyChipPosition(data);
    });
    layoutReady = true;
    resolveCollisions();
    renderAllChips();
  }

  function renderAllChips() {
    chipData.forEach(applyChipPosition);
  }

  function applyChipPosition(data) {
    keepInBox(data);
    if (Math.abs(data.spin) > 720) data.spin %= 360;
    data.xPct = (data.x / bounds.width) * 100;
    data.yPct = (data.y / bounds.height) * 100;
    data.chip.style.setProperty("--x", data.xPct.toFixed(2));
    data.chip.style.setProperty("--y", data.yPct.toFixed(2));
    data.chip.style.setProperty("--spin", `${data.spin.toFixed(2)}deg`);
    data.chip.style.setProperty("--tx", "0px");
    data.chip.style.setProperty("--ty", "0px");
    data.chip.style.setProperty("--rotate", `${data.rotate}deg`);
  }

  function keepInBox(data) {
    data.x = clamp(data.x, margin, maxX(data));
    data.y = clamp(data.y, margin, maxY(data));
  }

  function limitVelocity(data) {
    data.vx = clamp(data.vx, -physics.maxSpeed, physics.maxSpeed);
    data.vy = clamp(data.vy, -physics.maxSpeed, physics.maxSpeed);
    data.angularVelocity = clamp(data.angularVelocity, -8, 8);
  }

  function maxX(data) {
    return Math.max(margin, bounds.width - data.w - margin);
  }

  function maxY(data) {
    return Math.max(margin, bounds.height - data.h - margin);
  }

  function spawnToyPop(x, y) {
    if (!enabled) return;
    const pop = document.createElement("span");
    pop.className = "toy-pop";
    pop.textContent = popLabels[Math.floor(Math.random() * popLabels.length)];
    pop.style.setProperty("--pop-x", `${clamp(x, 14, toy.clientWidth - 14)}px`);
    pop.style.setProperty("--pop-y", `${clamp(y, 14, toy.clientHeight - 14)}px`);
    toy.appendChild(pop);
    pop.addEventListener("animationend", () => pop.remove(), { once: true });
  }

  function getToyPoint(event) {
    const rect = toy.getBoundingClientRect();
    return {
      rect,
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height)
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return { setEnabled };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request failed with ${response.status}`);
  }
  return data;
}

async function loadStatus() {
  try {
    const status = await api("/api/status");
    state.providerStatus = status.notifications || { email: false, sms: false };
    setSource(status.source, status.keyReady);
    renderProviderStatus();
  } catch (error) {
    renderProviderStatus();
  }
}

async function loadAccount() {
  try {
    const data = await api("/api/me");
    state.user = data.user;
    if (state.user?.uiSettings && canStorePreferences()) {
      state.settings = normalizeSettings(state.user.uiSettings);
      persistSettings({ syncAccount: false });
    }
  } catch (error) {
    state.user = null;
  }
  renderAccount();
}

async function registerAccount() {
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: elements.authName.value,
        email: elements.authEmail.value,
        phone: elements.authPhone.value,
        password: elements.authPassword.value
      })
    });
    state.user = data.user;
    elements.authPassword.value = "";
    showMessage("Account created. Penny Watch can now save notification settings.");
    scheduleAccountSettingsSync();
    activateSidePanel("tracker");
    renderAccount();
  } catch (error) {
    showMessage(error.message);
  }
}

async function loginAccount() {
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: elements.authEmail.value,
        password: elements.authPassword.value
      })
    });
    state.user = data.user;
    if (state.user?.uiSettings && canStorePreferences()) {
      state.settings = normalizeSettings(state.user.uiSettings);
      persistSettings({ syncAccount: false });
    } else {
      scheduleAccountSettingsSync();
    }
    elements.authPassword.value = "";
    showMessage("Signed in.");
    activateSidePanel("tracker");
    renderAccount();
  } catch (error) {
    showMessage(error.message);
  }
}

async function logoutAccount() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    // Logging out should clear local UI even if the server session is gone.
  }
  state.user = null;
  renderAccount();
  showMessage("Signed out.");
}

function renderAccount() {
  const signedIn = Boolean(state.user);
  elements.authForm.classList.toggle("hidden", signedIn);
  elements.accountSummary.classList.toggle("hidden", !signedIn);
  elements.logoutButton.classList.toggle("hidden", !signedIn);
  elements.accountTitle.textContent = signedIn ? "Signed in" : "Sign in";

  if (!signedIn) {
    elements.heroSubcopy.textContent = "Create an account, add your phone, and scan for absurd markdowns.";
    return;
  }

  elements.accountName.textContent = state.user.name || "Dominic Deals";
  elements.accountEmail.textContent = state.user.email;
  elements.accountPhone.textContent = state.user.phone || "No phone saved";
  elements.profilePhoneInput.value = state.user.phone || "";
  elements.pennyThresholdInput.value = state.user.pennyThreshold ?? 5;
  elements.pennyPercentInput.value = state.user.pennyPercent ?? 80;
  elements.notifyEmailToggle.checked = Boolean(state.user.notifyEmail);
  elements.notifySmsToggle.checked = Boolean(state.user.notifySms);
  elements.soldOutToggle.checked = Boolean(state.user.alertWhenSoldOut);
  elements.heroSubcopy.textContent = `${state.user.email} is watching for ${currency(state.user.pennyThreshold)} / ${state.user.pennyPercent}% drops.`;
}

function renderProviderStatus() {
  const providers = [];
  if (state.providerStatus.email) providers.push("Email");
  if (state.providerStatus.sms) providers.push("SMS");
  elements.notifyStatus.textContent = providers.length ? providers.join(" + ") : "Local";
}

function scheduleAccountSettingsSync() {
  if (!state.user || !canStorePreferences()) return;
  clearTimeout(accountSyncTimer);
  accountSyncTimer = setTimeout(syncSettingsToAccount, 650);
}

async function syncSettingsToAccount() {
  if (!state.user || !canStorePreferences()) return;
  try {
    const data = await api("/api/me", {
      method: "PUT",
      body: JSON.stringify({ uiSettings: normalizeSettings(state.settings) })
    });
    state.user = data.user;
  } catch (error) {
    // Preference sync should never interrupt deal browsing.
  }
}

async function saveWatchPrefs() {
  if (!state.user) {
    showMessage("Create an account first so your phone and alert preferences can be saved.");
    return;
  }

  try {
    const data = await api("/api/me", {
      method: "PUT",
      body: JSON.stringify({
        name: state.user.name,
        phone: elements.profilePhoneInput.value,
        notifyEmail: elements.notifyEmailToggle.checked,
        notifySms: elements.notifySmsToggle.checked,
        alertWhenSoldOut: elements.soldOutToggle.checked,
        pennyThreshold: elements.pennyThresholdInput.value,
        pennyPercent: elements.pennyPercentInput.value
      })
    });
    state.user = data.user;
    renderAccount();
    showMessage("Penny Watch settings saved.");
  } catch (error) {
    showMessage(error.message);
  }
}

async function testNotification() {
  if (!state.user) {
    showMessage("Sign in first, then send a test.");
    return;
  }

  await saveWatchPrefs();
  try {
    const data = await api("/api/test-notification", { method: "POST" });
    showMessage(formatProviderResults(data.results, "Test notification"));
  } catch (error) {
    showMessage(error.message);
  }
}

async function runPennyScan() {
  if (!state.user) {
    showMessage("Create an account first so penny alerts have somewhere to go.");
    return;
  }

  await saveWatchPrefs();
  showMessage("Scanning penny candidates...");

  try {
    const data = await api("/api/penny-scan", { method: "POST" });
    state.alerts = data.alerts || [];
    elements.pennyCount.textContent = numberFormat(data.newAlerts?.length || 0);
    elements.lastUpdated.textContent = formatTime(data.generatedAt || new Date());
    renderAlertFeed(data.scanState);
    activateSidePanel("alerts");
    if (data.newAlerts?.length) {
      showMessage(`${data.newAlerts.length} new penny alert${data.newAlerts.length === 1 ? "" : "s"} found. ${formatProviderResults(data.notificationResults || [], "Notifications")}`);
    } else {
      showMessage(`Scanned ${data.scanned || 0} penny candidates. No new alerts yet.`);
    }
    if (state.view === "alerts") render();
  } catch (error) {
    showMessage(error.message);
  }
}

async function loadAlerts() {
  try {
    const data = await api("/api/alerts");
    state.alerts = data.alerts || [];
    elements.pennyCount.textContent = numberFormat(state.alerts.length);
    renderAlertFeed(data.scanState);
  } catch (error) {
    state.alerts = [];
    renderAlertFeed();
  }
}

async function loadDeals() {
  renderSkeletons();
  showMessage("");

  const params = new URLSearchParams({
    q: elements.searchInput.value.trim(),
    category: state.category,
    minDiscount: elements.discountSlider.value,
    maxPrice: elements.maxPriceInput.value,
    includeOpenBox: elements.openBoxToggle.checked ? "true" : "false",
    sort: elements.sortSelect.value,
    limit: "40"
  });

  try {
    const response = await fetch(`/api/deals?${params}`);
    const data = await response.json();
    state.deals = data.deals || [];

    setSource(data.source, data.keyReady);
    if (!response.ok && data.message) showMessage(data.message);
    if (data.source === "demo") {
      showMessage("Demo data is showing until the Best Buy API key is added.");
    }

    elements.lastUpdated.textContent = formatTime(data.generatedAt || new Date());
  } catch (error) {
    showMessage("Could not load deals from the local server.");
    state.deals = [];
    elements.lastUpdated.textContent = "--";
  }

  render();
}

function setSource(source, keyReady) {
  elements.sourcePill.classList.toggle("live", keyReady);
  elements.sourcePill.classList.toggle("demo", !keyReady);
  elements.sourcePill.textContent = keyReady && source === "bestbuy" ? "Live API" : "Demo";
}

function render() {
  if (state.view === "alerts") {
    updateStats(state.alerts);
    renderAlertsMain();
    return;
  }

  const list = state.view === "saved" ? [...state.saved.values()] : state.deals;
  updateStats(list);

  if (!list.length) {
    elements.dealList.innerHTML = `<div class="empty-state">${state.view === "saved" ? "No saved deals yet." : "No deals matched those filters."}</div>`;
    return;
  }

  elements.dealList.innerHTML = list.map(renderDeal).join("");
  elements.dealList.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", () => toggleSaved(button.dataset.save));
  });
  elements.dealList.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => copySku(button.dataset.copy));
  });
  refreshIcons();
}

function renderDeal(deal) {
  const saved = state.saved.has(deal.id);
  const image = deal.image || "/icon.svg";
  const rating = deal.rating ? `${deal.rating.toFixed(1)} (${numberFormat(deal.reviewCount)})` : "No rating";
  const description = deal.description || [deal.brand, deal.model].filter(Boolean).join(" ");
  const openUrl = deal.url || `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(deal.sku)}`;
  const hotClass = Number(deal.percentSavings || 0) >= 40 ? "hot" : "";
  const pennyClass = Number(deal.salePrice || 0) <= 5 || Number(deal.percentSavings || 0) >= 80 ? "penny" : "";

  return `
    <article class="deal-card ${hotClass} ${pennyClass}">
      <div class="product-image">
        <img src="${escapeAttribute(image)}" alt="${escapeAttribute(deal.title)}" loading="lazy">
        <button class="save-button ${saved ? "saved" : ""}" data-save="${escapeAttribute(deal.id)}" type="button" aria-label="${saved ? "Remove saved deal" : "Save deal"}">
          <i data-lucide="heart"></i>
        </button>
      </div>
      <div class="deal-body">
        <div class="deal-meta">
          <span class="badge">${Math.round(deal.percentSavings)}% off</span>
          <span class="condition">${escapeHtml(deal.condition || "New")}${deal.online === false ? " · Sold out" : ""}</span>
        </div>
        <h2 class="deal-title">${escapeHtml(deal.title)}</h2>
        <p class="description">${escapeHtml(description)}</p>
        <div class="price-row">
          <span class="sale-price">${currency(deal.salePrice)}</span>
          <span class="regular-price">${currency(deal.regularPrice)}</span>
        </div>
        <div class="rating-row">
          <i data-lucide="star"></i>
          <span>${escapeHtml(rating)}</span>
        </div>
        <div class="actions">
          <a class="deal-action" href="${escapeAttribute(openUrl)}" target="_blank" rel="noreferrer">Open</a>
          <button class="deal-action secondary" data-copy="${escapeAttribute(deal.sku)}" type="button" aria-label="Copy SKU">
            <i data-lucide="copy"></i>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderAlertsMain() {
  if (!state.alerts.length) {
    elements.dealList.innerHTML = `<div class="empty-state">No penny alerts yet. Run Scan + Notify to start the feed.</div>`;
    return;
  }

  elements.dealList.innerHTML = state.alerts.map(renderAlertCard).join("");
}

function renderAlertCard(alert) {
  return `
    <article class="deal-card hot penny alert-result">
      <div class="product-image">
        <img src="${escapeAttribute(alert.image || "/icon.svg")}" alt="${escapeAttribute(alert.title)}" loading="lazy">
      </div>
      <div class="deal-body">
        <div class="deal-meta">
          <span class="badge">${escapeHtml(alert.reason || "Penny hit")}</span>
          <span class="condition">${alert.online ? "Online" : "Sold out / not online"}</span>
        </div>
        <h2 class="deal-title">${escapeHtml(alert.title)}</h2>
        <p class="description">${escapeHtml(formatTime(alert.detectedAt))} · SKU ${escapeHtml(alert.sku)}</p>
        <div class="price-row">
          <span class="sale-price">${currency(alert.salePrice)}</span>
          <span class="regular-price">${currency(alert.regularPrice)}</span>
        </div>
        <div class="actions">
          <a class="deal-action" href="${escapeAttribute(alert.url || "https://www.bestbuy.com/")}" target="_blank" rel="noreferrer">Open</a>
          <button class="deal-action secondary" data-copy="${escapeAttribute(alert.sku)}" type="button" aria-label="Copy SKU">
            <i data-lucide="copy"></i>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderAlertFeed(scanState) {
  if (scanState?.lastScanAt) {
    elements.lastScanPill.textContent = formatTime(scanState.lastScanAt);
  }

  if (!state.alerts.length) {
    elements.alertFeed.innerHTML = `<div class="mini-empty">No alerts yet.</div>`;
    return;
  }

  elements.alertFeed.innerHTML = state.alerts.slice(0, 5).map((alert) => `
    <a class="feed-item" href="${escapeAttribute(alert.url || "https://www.bestbuy.com/")}" target="_blank" rel="noreferrer">
      <strong>${escapeHtml(alert.title)}</strong>
      <span>${currency(alert.salePrice)} · ${Math.round(alert.percentSavings || 0)}% off</span>
    </a>
  `).join("");
}

function renderSkeletons() {
  elements.dealList.innerHTML = Array.from({ length: 5 }, () => `<div class="deal-card skeleton"></div>`).join("");
}

function updateStats(list) {
  const count = list.length;
  const avg = count
    ? Math.round(list.reduce((total, deal) => total + Number(deal.percentSavings || 0), 0) / count)
    : 0;

  elements.dealCount.textContent = numberFormat(count);
  elements.avgSavings.textContent = `${avg}%`;
}

function toggleSaved(id) {
  const deal = state.deals.find((item) => item.id === id) || state.saved.get(id);
  if (!deal) return;

  if (state.saved.has(id)) {
    state.saved.delete(id);
  } else {
    state.saved.set(id, deal);
  }
  saveSaved();
  render();
}

async function copySku(sku) {
  try {
    await navigator.clipboard.writeText(sku);
    showMessage(`Copied SKU ${sku}.`);
  } catch (error) {
    showMessage(`SKU ${sku}`);
  }
}

function formatProviderResults(results, label) {
  if (!results.length) return `${label}: no channels enabled.`;
  const parts = results.map((result) => {
    if (result.skipped) return `${result.channel} not configured`;
    return `${result.channel} ${result.ok ? "sent" : "failed"}`;
  });
  return `${label}: ${parts.join(", ")}.`;
}

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    return new Map(saved.map((deal) => [deal.id, deal]));
  } catch (error) {
    return new Map();
  }
}

function saveSaved() {
  localStorage.setItem(SAVED_KEY, JSON.stringify([...state.saved.values()]));
}

function loadSettings() {
  try {
    if (localStorage.getItem(CONSENT_KEY) !== "accepted") {
      return { ...DEFAULT_SETTINGS };
    }
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return normalizeSettings(saved);
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

function showMessage(message) {
  elements.messageBox.textContent = message;
  elements.messageBox.classList.toggle("hidden", !message);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function currency(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}

function numberFormat(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function createDealBackground(canvas) {
  if (!canvas) {
    return { start() {}, stop() {} };
  }

  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let started = false;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function draw() {
    const styles = getComputedStyle(document.documentElement);
    const line = styles.getPropertyValue("--bg-line").trim();
    const accent = styles.getPropertyValue("--accent").trim();
    const accentTwo = styles.getPropertyValue("--accent-2").trim();
    const danger = styles.getPropertyValue("--danger").trim();

    ctx.clearRect(0, 0, width, height);
    drawFlatBackdrop(line, accent, accentTwo, danger);
  }

  function drawFlatBackdrop(line, accent, accentTwo, danger) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    const spacing = width > 900 ? 108 : 82;
    for (let x = -spacing; x < width + spacing; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height * 0.16, height);
      ctx.stroke();
    }

    drawStaticChip(width * 0.08, height * 0.18, "$0.99", accent, line, 0.13);
    drawStaticChip(width * 0.72, height * 0.12, "penny watch", accentTwo, line, 0.12);
    drawStaticChip(width * 0.18, height * 0.78, "drop", danger, line, 0.1);
    ctx.restore();
  }

  function drawStaticChip(x, y, label, stroke, line, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    roundedRect(x, y, 112, 34, 10);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.strokeStyle = stroke || line;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = stroke || line;
    ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(label.toUpperCase(), x + 13, y + 17);
    ctx.restore();
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function start() {
    canvas.hidden = false;
    resize();
    if (started) return;
    started = true;
    window.addEventListener("resize", resize);
  }

  function stop() {
    canvas.hidden = false;
    resize();
    if (!started) return;
    started = false;
    window.removeEventListener("resize", resize);
  }

  return { start, stop };
}
