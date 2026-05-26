const SETTINGS_KEY = "dominic-deals-settings";
const SAVED_KEY = "dominic-deals-saved";
const DEFAULT_SETTINGS = {
  theme: "system",
  accent: "electric",
  motion: true,
  density: "comfortable"
};

const state = {
  category: "all",
  view: "deals",
  deals: [],
  saved: loadSaved(),
  settings: loadSettings()
};

const elements = {
  sourcePill: document.querySelector("#sourcePill"),
  themeToggle: document.querySelector("#themeToggle"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  motionToggle: document.querySelector("#motionToggle"),
  denseToggle: document.querySelector("#denseToggle"),
  searchInput: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  findButton: document.querySelector("#findButton"),
  categoryButtons: document.querySelector("#categoryButtons"),
  discountSlider: document.querySelector("#discountSlider"),
  discountValue: document.querySelector("#discountValue"),
  maxPriceInput: document.querySelector("#maxPriceInput"),
  openBoxToggle: document.querySelector("#openBoxToggle"),
  sortSelect: document.querySelector("#sortSelect"),
  dealCount: document.querySelector("#dealCount"),
  avgSavings: document.querySelector("#avgSavings"),
  lastUpdated: document.querySelector("#lastUpdated"),
  messageBox: document.querySelector("#messageBox"),
  dealList: document.querySelector("#dealList"),
  backgroundCanvas: document.querySelector("#dealBackground"),
  tabs: document.querySelectorAll(".tab"),
  themeOptions: document.querySelectorAll("[data-theme-option]"),
  accentOptions: document.querySelectorAll("[data-accent-option]")
};

let backgroundRenderer;
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

document.addEventListener("DOMContentLoaded", () => {
  applySettings();
  wireEvents();
  backgroundRenderer = createDealBackground(elements.backgroundCanvas);
  updateMotion();
  refreshIcons();
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

  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadDeals();
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

function toggleSettings() {
  const open = elements.settingsPanel.classList.toggle("hidden") === false;
  elements.settingsButton.setAttribute("aria-expanded", String(open));
}

function cycleTheme() {
  const resolved = resolveTheme(state.settings.theme);
  state.settings.theme = resolved === "dark" ? "light" : "dark";
  persistSettings();
}

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  applySettings();
}

function applySettings() {
  const resolvedTheme = resolveTheme(state.settings.theme);
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.accent = state.settings.accent;
  root.dataset.density = state.settings.density;
  root.dataset.motion = state.settings.motion ? "on" : "off";

  const themeColor = resolvedTheme === "dark" ? "#080b12" : "#f7d117";
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", themeColor);

  elements.themeOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.themeOption === state.settings.theme);
  });
  elements.accentOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.accentOption === state.settings.accent);
  });
  elements.motionToggle.checked = state.settings.motion;
  elements.denseToggle.checked = state.settings.density === "compact";
  elements.themeToggle.innerHTML = `<i data-lucide="${resolvedTheme === "dark" ? "sun" : "moon"}"></i>`;
  updateMotion();
  refreshIcons();
}

function resolveTheme(theme) {
  if (theme === "dark" || theme === "light") return theme;
  return systemThemeQuery.matches ? "dark" : "light";
}

function updateMotion() {
  if (!backgroundRenderer) return;
  if (state.settings.motion) {
    backgroundRenderer.start();
  } else {
    backgroundRenderer.stop();
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

  return `
    <article class="deal-card ${hotClass}">
      <div class="product-image">
        <img src="${escapeAttribute(image)}" alt="${escapeAttribute(deal.title)}" loading="lazy">
        <button class="save-button ${saved ? "saved" : ""}" data-save="${escapeAttribute(deal.id)}" type="button" aria-label="${saved ? "Remove saved deal" : "Save deal"}">
          <i data-lucide="heart"></i>
        </button>
      </div>
      <div class="deal-body">
        <div class="deal-meta">
          <span class="badge">${Math.round(deal.percentSavings)}% off</span>
          <span class="condition">${escapeHtml(deal.condition || "New")}</span>
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
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...saved };
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
  const tags = [];
  const labels = ["SAVE 32%", "$199", "-18%", "OPEN BOX", "$49", "DROP", "SKU", "$799", "LIVE"];
  const pointer = { x: 0, y: 0, active: false };
  let width = 0;
  let height = 0;
  let raf = 0;
  let running = false;
  let lastTime = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    seedTags();
    draw(performance.now());
  }

  function seedTags() {
    const count = Math.max(18, Math.round((width * height) / 36000));
    tags.length = 0;
    for (let index = 0; index < count; index += 1) {
      tags.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 8 + Math.random() * 24,
        label: labels[index % labels.length],
        size: 0.72 + Math.random() * 0.48,
        lane: index % 4
      });
    }
  }

  function draw(time) {
    const delta = Math.min(32, time - lastTime || 16) / 1000;
    lastTime = time;
    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue("--ink").trim();
    const line = styles.getPropertyValue("--bg-line").trim();
    const accent = styles.getPropertyValue("--accent").trim();
    const accentTwo = styles.getPropertyValue("--accent-2").trim();
    const danger = styles.getPropertyValue("--danger").trim();

    ctx.clearRect(0, 0, width, height);
    drawGrid(line, accentTwo, time);
    drawSweep(accent, time);

    for (const tag of tags) {
      if (running && !reducedMotion) {
        tag.x += tag.speed * delta;
        tag.y += Math.sin(time / 900 + tag.lane) * 0.06;
        if (tag.x > width + 140) {
          tag.x = -160;
          tag.y = Math.random() * height;
        }
      }
      drawTag(tag, ink, tag.lane % 3 === 0 ? danger : tag.lane % 2 === 0 ? accent : accentTwo);
    }

    if (running && !reducedMotion) {
      raf = requestAnimationFrame(draw);
    }
  }

  function drawGrid(line, accentTwo, time) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = line;
    const spacing = 46;
    const drift = (time / 80) % spacing;

    for (let x = -width; x < width * 2; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + drift, 0);
      ctx.lineTo(x + drift + height * 0.42, height);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = accentTwo;
    for (let y = 44; y < height; y += 118) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(time / 1200 + y) * 7);
      ctx.lineTo(width, y + Math.cos(time / 1200 + y) * 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSweep(accent, time) {
    ctx.save();
    const sweepX = pointer.active ? pointer.x : ((time / 32) % (width + 260)) - 130;
    const sweepY = pointer.active ? pointer.y : height * 0.28;
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sweepX - 260, sweepY - 180);
    ctx.lineTo(sweepX + 260, sweepY + 180);
    ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(sweepX - 240, sweepY - 170);
    ctx.lineTo(sweepX + 240, sweepY + 170);
    ctx.stroke();
    ctx.restore();
  }

  function drawTag(tag, textColor, strokeColor) {
    const dx = tag.x - pointer.x;
    const dy = tag.y - pointer.y;
    const distance = Math.hypot(dx, dy);
    const pull = pointer.active ? Math.max(0, 1 - distance / 220) : 0;
    const x = tag.x + dx * pull * 0.05;
    const y = tag.y + dy * pull * 0.05;
    const scale = tag.size + pull * 0.18;
    const w = 84 * scale;
    const h = 28 * scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.2 + pull * 0.18;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(10 * scale, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(10 * scale, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.28 + pull * 0.34;
    ctx.fillStyle = textColor;
    ctx.font = `${Math.max(9, 10 * scale)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(tag.label, 16 * scale, h / 2 + 0.5);
    ctx.restore();
  }

  function setPointer(event) {
    const touch = event.touches?.[0];
    pointer.x = touch ? touch.clientX : event.clientX;
    pointer.y = touch ? touch.clientY : event.clientY;
    pointer.active = true;
  }

  function clearPointer() {
    pointer.active = false;
  }

  function start() {
    if (running) return;
    running = true;
    canvas.hidden = false;
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", setPointer);
    window.addEventListener("pointerleave", clearPointer);
    window.addEventListener("touchmove", setPointer, { passive: true });
    window.addEventListener("touchend", clearPointer);
    if (!reducedMotion) raf = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", setPointer);
    window.removeEventListener("pointerleave", clearPointer);
    window.removeEventListener("touchmove", setPointer);
    window.removeEventListener("touchend", clearPointer);
    resize();
  }

  return { start, stop };
}
