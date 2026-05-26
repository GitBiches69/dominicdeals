const state = {
  category: "all",
  view: "deals",
  deals: [],
  saved: loadSaved()
};

const elements = {
  sourcePill: document.querySelector("#sourcePill"),
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
  tabs: document.querySelectorAll(".tab")
};

document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  refreshIcons();
  loadDeals();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
});

function wireEvents() {
  elements.findButton.addEventListener("click", loadDeals);
  elements.refreshButton.addEventListener("click", loadDeals);
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

  return `
    <article class="deal-card">
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
    const saved = JSON.parse(localStorage.getItem("dominic-deals-saved") || "[]");
    return new Map(saved.map((deal) => [deal.id, deal]));
  } catch (error) {
    return new Map();
  }
}

function saveSaved() {
  localStorage.setItem("dominic-deals-saved", JSON.stringify([...state.saved.values()]));
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
