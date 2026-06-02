const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const SCAN_STATE_FILE = path.join(DATA_DIR, "scan-state.json");
const PORT = Number(process.env.PORT || readEnvFile().PORT || 4177);
const BESTBUY_PRODUCTS_URL = "https://api.bestbuy.com/v1/products";
const BESTBUY_OPEN_BOX_URL = "https://api.bestbuy.com/beta/products/openBox";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_BODY_BYTES = 1024 * 1024;

const sessions = new Map();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const CATEGORY_PRESETS = {
  all: null,
  laptops: "abcat0502000",
  tvs: "abcat0101000",
  headphones: null,
  gaming: null,
  cameras: "abcat0400000",
  appliances: "abcat0900000"
};

const DEFAULT_USER_PREFS = {
  notifyEmail: true,
  notifySms: false,
  pennyThreshold: 5,
  pennyPercent: 80,
  alertWhenSoldOut: true
};

ensureDataFiles();

function readEnvFile() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return {};

  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return env;
      const index = trimmed.indexOf("=");
      if (index === -1) return env;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = value;
      return env;
    }, {});
}

function envValue(key) {
  return process.env[key] || readEnvFile()[key] || "";
}

function getApiKey() {
  return envValue("BESTBUY_API_KEY");
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) writeJsonFile(USERS_FILE, { users: [] });
  if (!fs.existsSync(ALERTS_FILE)) writeJsonFile(ALERTS_FILE, { alerts: [] });
  if (!fs.existsSync(SCAN_STATE_FILE)) writeJsonFile(SCAN_STATE_FILE, { seen: {}, lastScanAt: null });
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJsonFile(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(body));
}

function sendStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const safePath = path
    .normalize(decodeURIComponent(pathname))
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  });
}

function sanitizeSearchTerm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function buildProductQuery(params) {
  const category = params.get("category") || "all";
  const minDiscount = clampNumber(params.get("minDiscount"), 15, 0, 90);
  const maxPrice = clampNumber(params.get("maxPrice"), 0, 0, 100000);
  const query = [];

  query.push("sku=*");
  query.push("onSale=true");
  query.push("onlineAvailability=true");
  query.push("salePrice>0");
  query.push("regularPrice>0");
  if (minDiscount > 0) query.push(`percentSavings>=${minDiscount}`);
  if (maxPrice > 0) query.push(`salePrice<=${maxPrice}`);

  const categoryId = CATEGORY_PRESETS[category];
  if (categoryId) query.push(`categoryPath.id=${categoryId}`);

  const searchTerms = [
    ...sanitizeSearchTerm(params.get("q")),
    ...presetSearchTerms(category)
  ];
  for (const term of [...new Set(searchTerms)].slice(0, 5)) {
    query.push(`search=${term}`);
  }

  return query.join("&");
}

function presetSearchTerms(category) {
  if (category === "headphones") return ["headphones"];
  if (category === "gaming") return ["gaming"];
  return [];
}

async function fetchBestBuyDeals(params) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      source: "demo",
      keyReady: false,
      generatedAt: new Date().toISOString(),
      deals: getDemoDeals(params)
    };
  }

  const pageSize = clampNumber(params.get("limit"), 40, 8, 80);
  const sort = params.get("sort") || "percentSavings.dsc";
  const query = buildProductQuery(params);
  let deals = (await bestBuyProductRequest(query, pageSize, sort)).map(normalizeProductDeal);

  if (params.get("includeOpenBox") === "true") {
    const openBoxDeals = await fetchOpenBoxDeals(params, deals.map((deal) => deal.sku));
    deals = [...deals, ...openBoxDeals];
  }

  return {
    source: "bestbuy",
    keyReady: true,
    generatedAt: new Date().toISOString(),
    total: deals.length,
    deals: sortDeals(deals, params.get("sort"))
  };
}

async function bestBuyProductRequest(query, pageSize, sort = "percentSavings.dsc") {
  const apiKey = getApiKey();
  const show = [
    "sku",
    "name",
    "manufacturer",
    "modelNumber",
    "shortDescription",
    "salePrice",
    "regularPrice",
    "dollarSavings",
    "percentSavings",
    "thumbnailImage",
    "image",
    "url",
    "addToCartUrl",
    "customerReviewAverage",
    "customerReviewCount",
    "onlineAvailability",
    "inStorePickup",
    "onSale"
  ].join(",");

  const url = new URL(`${BESTBUY_PRODUCTS_URL}(${encodeURIComponent(query)})`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("sort", sort);
  url.searchParams.set("show", show);

  const response = await fetch(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Best Buy returned a non-JSON response (${response.status}).`);
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText;
    throw new Error(`Best Buy API error ${response.status}: ${message}`);
  }

  return data.products || [];
}

async function fetchOpenBoxDeals(params, skus) {
  const apiKey = getApiKey();
  const category = params.get("category") || "all";
  const categoryId = CATEGORY_PRESETS[category];
  const minDiscount = clampNumber(params.get("minDiscount"), 15, 0, 90);
  const maxPrice = clampNumber(params.get("maxPrice"), 0, 0, 100000);
  const limitSkus = skus.filter(Boolean).slice(0, 40);

  let url;
  if (categoryId && category !== "all") {
    url = new URL(`${BESTBUY_OPEN_BOX_URL}(categoryId=${categoryId})`);
  } else if (limitSkus.length > 0) {
    url = new URL(`${BESTBUY_OPEN_BOX_URL}(sku%20in(${limitSkus.join(",")}))`);
  } else {
    return [];
  }
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) return [];

  const data = await response.json();
  return (data.results || [])
    .flatMap(normalizeOpenBoxDeal)
    .filter((deal) => deal.percentSavings >= minDiscount)
    .filter((deal) => maxPrice === 0 || deal.salePrice <= maxPrice)
    .slice(0, 40);
}

async function fetchPennyCandidates(options = {}) {
  const apiKey = getApiKey();
  const maxPrice = clampNumber(options.maxPrice, 5, 0.01, 100);
  const minDiscount = clampNumber(options.minDiscount, 80, 0, 99);

  if (!apiKey) {
    return {
      source: "demo",
      keyReady: false,
      generatedAt: new Date().toISOString(),
      deals: getDemoPennyDeals(maxPrice, minDiscount)
    };
  }

  const priceQuery = [
    "sku=*",
    "salePrice>0",
    "regularPrice>0",
    `salePrice<=${maxPrice}`
  ].join("&");
  const discountQuery = [
    "sku=*",
    "salePrice>0",
    "regularPrice>0",
    "salePrice<=25",
    `percentSavings>=${minDiscount}`
  ].join("&");

  const batches = await Promise.allSettled([
    bestBuyProductRequest(priceQuery, 80, "salePrice.asc"),
    bestBuyProductRequest(discountQuery, 80, "percentSavings.dsc")
  ]);

  const products = batches.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const bySku = new Map();
  for (const product of products) {
    const deal = normalizeProductDeal(product);
    if (!bySku.has(deal.sku)) bySku.set(deal.sku, deal);
  }

  return {
    source: "bestbuy",
    keyReady: true,
    generatedAt: new Date().toISOString(),
    deals: [...bySku.values()].sort((a, b) => a.salePrice - b.salePrice || b.percentSavings - a.percentSavings)
  };
}

function normalizeProductDeal(product) {
  const regularPrice = Number(product.regularPrice || 0);
  const salePrice = Number(product.salePrice || 0);
  const dollarSavings = Number(product.dollarSavings || Math.max(0, regularPrice - salePrice));
  const percentSavings = Number(
    product.percentSavings || (regularPrice > 0 ? (dollarSavings / regularPrice) * 100 : 0)
  );

  return {
    id: `new-${product.sku}`,
    sku: String(product.sku),
    title: product.name || "Best Buy product",
    brand: product.manufacturer || "",
    model: product.modelNumber || "",
    description: stripHtml(product.shortDescription || ""),
    salePrice,
    regularPrice,
    dollarSavings,
    percentSavings,
    image: product.thumbnailImage || product.image || "",
    url: product.url || `https://www.bestbuy.com/site/searchpage.jsp?st=${product.sku}`,
    addToCartUrl: product.addToCartUrl || "",
    rating: Number(product.customerReviewAverage || 0),
    reviewCount: Number(product.customerReviewCount || 0),
    pickup: Boolean(product.inStorePickup),
    online: Boolean(product.onlineAvailability),
    condition: "New"
  };
}

function normalizeOpenBoxDeal(result) {
  const title = result?.names?.title || "Open-box Best Buy product";
  const image = result?.images?.standard || "";
  const url = result?.links?.web || `https://www.bestbuy.com/site/searchpage.jsp?st=${result.sku}`;
  const addToCartUrl = result?.links?.addToCart || "";
  const regularPrice = Number(result?.prices?.regular || result?.prices?.current || 0);
  const rating = Number(result?.customerReviews?.averageScore || 0);
  const reviewCount = Number(result?.customerReviews?.count || 0);

  return (result.offers || []).map((offer, index) => {
    const salePrice = Number(offer?.prices?.current || 0);
    const basePrice = Number(offer?.prices?.regular || regularPrice || 0);
    const dollarSavings = Math.max(0, basePrice - salePrice);
    const percentSavings = basePrice > 0 ? (dollarSavings / basePrice) * 100 : 0;

    return {
      id: `open-box-${result.sku}-${index}`,
      sku: String(result.sku),
      title,
      brand: "",
      model: "",
      description: stripHtml(result?.descriptions?.short || ""),
      salePrice,
      regularPrice: basePrice,
      dollarSavings,
      percentSavings,
      image,
      url,
      addToCartUrl,
      rating,
      reviewCount,
      pickup: false,
      online: true,
      condition: `Open Box ${titleCase(offer?.condition || "")}`.trim()
    };
  });
}

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sortDeals(deals, sort) {
  const sorted = [...deals];
  if (sort === "salePrice.asc") {
    return sorted.sort((a, b) => a.salePrice - b.salePrice);
  }
  if (sort === "dollarSavings.dsc") {
    return sorted.sort((a, b) => b.dollarSavings - a.dollarSavings);
  }
  return sorted.sort((a, b) => b.percentSavings - a.percentSavings);
}

function getDemoDeals(params) {
  const category = params.get("category") || "all";
  const q = (params.get("q") || "").toLowerCase();
  const minDiscount = clampNumber(params.get("minDiscount"), 15, 0, 90);
  const maxPrice = clampNumber(params.get("maxPrice"), 0, 0, 100000);
  const includeOpenBox = params.get("includeOpenBox") === "true";

  return sortDeals(
    DEMO_DEALS
      .filter((deal) => category === "all" || deal.tags.includes(category))
      .filter((deal) => !q || deal.title.toLowerCase().includes(q) || deal.description.toLowerCase().includes(q))
      .filter((deal) => deal.percentSavings >= minDiscount)
      .filter((deal) => maxPrice === 0 || deal.salePrice <= maxPrice)
      .filter((deal) => includeOpenBox || !deal.condition.toLowerCase().includes("open box")),
    params.get("sort")
  );
}

function getDemoPennyDeals(maxPrice, minDiscount) {
  return DEMO_PENNY_DEALS
    .filter((deal) => deal.salePrice <= maxPrice || deal.percentSavings >= minDiscount)
    .sort((a, b) => a.salePrice - b.salePrice || b.percentSavings - a.percentSavings);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function getUsersDb() {
  const db = readJsonFile(USERS_FILE, { users: [] });
  db.users = (db.users || []).map((user) => ({
    ...DEFAULT_USER_PREFS,
    ...user,
    phone: user.phone || ""
  }));
  return db;
}

function saveUsersDb(db) {
  writeJsonFile(USERS_FILE, db);
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safe } = user;
  return safe;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  const attempt = hashPassword(password, user.passwordSalt).hash;
  const actual = Buffer.from(user.passwordHash, "hex");
  const expected = Buffer.from(attempt, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function cookieHeaderForSession(req, token) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `dd_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

function clearSessionCookie() {
  return "dd_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

function isSecureRequest(req) {
  return req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted;
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const index = cookie.indexOf("=");
      if (index === -1) return cookies;
      cookies[decodeURIComponent(cookie.slice(0, index))] = decodeURIComponent(cookie.slice(index + 1));
      return cookies;
    }, {});
}

function getCurrentUser(req) {
  const token = parseCookies(req).dd_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = getUsersDb().users.find((item) => item.id === session.userId);
  return user || null;
}

async function handleRegister(req, res) {
  const body = await readJsonBody(req);
  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim().slice(0, 80) || "Dominic Deals User";
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");

  if (!email.includes("@") || password.length < 8) {
    sendJson(res, 400, { message: "Use a valid email and a password with at least 8 characters." });
    return;
  }

  const db = getUsersDb();
  if (db.users.some((user) => normalizeEmail(user.email) === email)) {
    sendJson(res, 409, { message: "That email already has an account. Sign in instead." });
    return;
  }

  const { salt, hash } = hashPassword(password);
  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    phone,
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now,
    updatedAt: now,
    ...DEFAULT_USER_PREFS
  };
  db.users.push(user);
  saveUsersDb(db);

  const token = createSession(user.id);
  sendJson(res, 201, { user: safeUser(user) }, { "set-cookie": cookieHeaderForSession(req, token) });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const user = getUsersDb().users.find((item) => normalizeEmail(item.email) === email);

  if (!user || !verifyPassword(password, user)) {
    sendJson(res, 401, { message: "Email or password is wrong." });
    return;
  }

  const token = createSession(user.id);
  sendJson(res, 200, { user: safeUser(user) }, { "set-cookie": cookieHeaderForSession(req, token) });
}

function handleLogout(req, res) {
  const token = parseCookies(req).dd_session;
  if (token) sessions.delete(token);
  sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookie() });
}

async function handleUpdateMe(req, res) {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    sendJson(res, 401, { message: "Sign in first." });
    return;
  }

  const body = await readJsonBody(req);
  const db = getUsersDb();
  const user = db.users.find((item) => item.id === currentUser.id);
  if (!user) {
    sendJson(res, 404, { message: "Account not found." });
    return;
  }

  user.name = String(body.name ?? user.name).trim().slice(0, 80) || user.name;
  user.phone = normalizePhone(body.phone ?? user.phone);
  user.notifyEmail = Boolean(body.notifyEmail);
  user.notifySms = Boolean(body.notifySms);
  user.alertWhenSoldOut = Boolean(body.alertWhenSoldOut);
  user.pennyThreshold = clampNumber(body.pennyThreshold, user.pennyThreshold, 0.01, 100);
  user.pennyPercent = clampNumber(body.pennyPercent, user.pennyPercent, 1, 99);
  user.updatedAt = new Date().toISOString();
  saveUsersDb(db);

  sendJson(res, 200, { user: safeUser(user) });
}

function getAlertsDb() {
  return readJsonFile(ALERTS_FILE, { alerts: [] });
}

function saveAlertsDb(db) {
  db.alerts = (db.alerts || []).slice(0, 250);
  writeJsonFile(ALERTS_FILE, db);
}

function getScanState() {
  return readJsonFile(SCAN_STATE_FILE, { seen: {}, lastScanAt: null });
}

function saveScanState(state) {
  writeJsonFile(SCAN_STATE_FILE, state);
}

function pennyReason(deal) {
  const sale = Number(deal.salePrice || 0);
  const discount = Math.round(Number(deal.percentSavings || 0));
  if (sale <= 1) return "Penny-price hit";
  if (!deal.online && discount >= 80) return "Huge drop and sold out";
  if (discount >= 90) return "90%+ markdown";
  return "Absurd price drop";
}

function qualifiesForUser(user, deal) {
  const sale = Number(deal.salePrice || 0);
  const discount = Number(deal.percentSavings || 0);
  const priceMatch = sale > 0 && sale <= Number(user.pennyThreshold || DEFAULT_USER_PREFS.pennyThreshold);
  const discountMatch = discount >= Number(user.pennyPercent || DEFAULT_USER_PREFS.pennyPercent) && sale <= 25;
  const availabilityOk = user.alertWhenSoldOut || deal.online;
  return availabilityOk && (priceMatch || discountMatch);
}

async function handlePennyDeals(req, res, url) {
  const maxPrice = clampNumber(url.searchParams.get("maxPrice"), 5, 0.01, 100);
  const minDiscount = clampNumber(url.searchParams.get("minDiscount"), 80, 1, 99);
  const data = await fetchPennyCandidates({ maxPrice, minDiscount });
  sendJson(res, 200, data);
}

async function handlePennyScan(req, res) {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    sendJson(res, 401, { message: "Sign in first so alerts know where to go." });
    return;
  }

  const result = await runPennyScanForUsers();
  sendJson(res, 200, result);
}

async function runPennyScanForUsers() {
  const users = getUsersDb().users;
  if (!users.length) {
    return {
      source: getApiKey() ? "bestbuy" : "demo",
      keyReady: Boolean(getApiKey()),
      generatedAt: new Date().toISOString(),
      scanned: 0,
      newAlerts: [],
      notificationResults: [],
      alerts: getAlertsDb().alerts.slice(0, 25)
    };
  }

  const maxPrice = Math.max(...users.map((user) => Number(user.pennyThreshold || 5)), 5);
  const minDiscount = Math.min(...users.map((user) => Number(user.pennyPercent || 80)), 80);
  const scan = await fetchPennyCandidates({ maxPrice, minDiscount });
  const scanState = getScanState();
  const alertsDb = getAlertsDb();
  const newAlerts = [];
  const notificationResults = [];

  for (const deal of scan.deals) {
    const key = `${deal.sku}:${Number(deal.salePrice || 0).toFixed(2)}:${deal.online ? "online" : "offline"}`;
    if (scanState.seen[key]) continue;

    const matchedUsers = users.filter((user) => qualifiesForUser(user, deal));
    if (!matchedUsers.length) continue;

    scanState.seen[key] = new Date().toISOString();
    const alert = {
      id: crypto.randomUUID(),
      dealId: deal.id,
      sku: deal.sku,
      title: deal.title,
      salePrice: deal.salePrice,
      regularPrice: deal.regularPrice,
      percentSavings: deal.percentSavings,
      online: deal.online,
      url: deal.url,
      image: deal.image,
      reason: pennyReason(deal),
      detectedAt: scanState.seen[key],
      notifiedUserIds: matchedUsers.map((user) => user.id),
      providerResults: []
    };

    for (const user of matchedUsers) {
      const results = await notifyUser(user, alert);
      alert.providerResults.push({ userId: user.id, results });
      notificationResults.push(...results.map((result) => ({ ...result, userId: user.id, sku: alert.sku })));
    }

    alertsDb.alerts.unshift(alert);
    newAlerts.push(alert);
  }

  scanState.lastScanAt = new Date().toISOString();
  saveScanState(scanState);
  saveAlertsDb(alertsDb);

  return {
    source: scan.source,
    keyReady: scan.keyReady,
    generatedAt: scan.generatedAt,
    scanned: scan.deals.length,
    newAlerts,
    notificationResults,
    alerts: alertsDb.alerts.slice(0, 25)
  };
}

async function handleTestNotification(req, res) {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    sendJson(res, 401, { message: "Sign in first." });
    return;
  }

  const alert = {
    id: "test",
    sku: "TEST-SKU",
    title: "Dominic Deals test alert",
    salePrice: 0.99,
    regularPrice: 99.99,
    percentSavings: 99,
    online: false,
    url: "https://www.bestbuy.com/",
    reason: "Test notification",
    detectedAt: new Date().toISOString()
  };
  const results = await notifyUser(currentUser, alert);
  sendJson(res, 200, { results });
}

async function notifyUser(user, alert) {
  const message = buildAlertMessage(alert);
  const results = [];

  if (user.notifyEmail && user.email) {
    results.push(await sendEmail(user.email, `Dominic Deals: ${alert.reason}`, message));
  }

  if (user.notifySms && user.phone) {
    results.push(await sendSms(user.phone, message.slice(0, 480)));
  }

  if (!results.length) {
    results.push({ channel: "none", ok: false, skipped: true, reason: "No notification channels enabled." });
  }

  return results;
}

function buildAlertMessage(alert) {
  return [
    `${alert.reason}: ${alert.title}`,
    `Price: ${formatCurrency(alert.salePrice)} was ${formatCurrency(alert.regularPrice)} (${Math.round(alert.percentSavings)}% off)`,
    `Availability: ${alert.online ? "online" : "sold out / not online"}`,
    `SKU: ${alert.sku}`,
    alert.url
  ].join("\n");
}

async function sendEmail(to, subject, text) {
  const apiKey = envValue("RESEND_API_KEY");
  const from = envValue("NOTIFY_FROM_EMAIL");
  if (!apiKey || !from) {
    return {
      channel: "email",
      ok: false,
      skipped: true,
      reason: "RESEND_API_KEY and NOTIFY_FROM_EMAIL are not configured."
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ from, to, subject, text })
    });
    const body = await response.json().catch(() => ({}));
    return { channel: "email", ok: response.ok, status: response.status, id: body.id, error: body.message || body.error };
  } catch (error) {
    return { channel: "email", ok: false, error: error.message };
  }
}

async function sendSms(to, body) {
  const accountSid = envValue("TWILIO_ACCOUNT_SID");
  const authToken = envValue("TWILIO_AUTH_TOKEN");
  const from = envValue("TWILIO_FROM_NUMBER");
  if (!accountSid || !authToken || !from) {
    return {
      channel: "sms",
      ok: false,
      skipped: true,
      reason: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are not configured."
    };
  }

  try {
    const form = new URLSearchParams({ To: normalizePhone(to), From: from, Body: body });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form
    });
    const data = await response.json().catch(() => ({}));
    return { channel: "sms", ok: response.ok, status: response.status, sid: data.sid, error: data.message };
  } catch (error) {
    return { channel: "sms", ok: false, error: error.message };
  }
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const DEMO_DEALS = [
  {
    id: "demo-laptop-1",
    sku: "DEMO1001",
    title: "Lenovo IdeaPad Slim 5 14 inch Laptop",
    brand: "Lenovo",
    model: "Slim 5",
    description: "Ryzen 7, 16GB memory, 1TB SSD, OLED display",
    salePrice: 579.99,
    regularPrice: 899.99,
    dollarSavings: 320,
    percentSavings: 36,
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=lenovo+laptop",
    addToCartUrl: "",
    rating: 4.6,
    reviewCount: 482,
    pickup: true,
    online: true,
    condition: "New",
    tags: ["all", "laptops"]
  },
  {
    id: "demo-tv-1",
    sku: "DEMO2001",
    title: "TCL 65 inch QLED 4K Smart TV",
    brand: "TCL",
    model: "Q6",
    description: "Dolby Vision, HDR10+, Google TV, 120Hz game accelerator",
    salePrice: 399.99,
    regularPrice: 699.99,
    dollarSavings: 300,
    percentSavings: 43,
    image: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=600&q=80",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=65+inch+qled+tv",
    addToCartUrl: "",
    rating: 4.5,
    reviewCount: 1268,
    pickup: true,
    online: true,
    condition: "New",
    tags: ["all", "tvs"]
  },
  {
    id: "demo-headphones-1",
    sku: "DEMO3001",
    title: "Sony Noise Canceling Wireless Headphones",
    brand: "Sony",
    model: "WH series",
    description: "Adaptive noise canceling, long battery life, multipoint Bluetooth",
    salePrice: 229.99,
    regularPrice: 349.99,
    dollarSavings: 120,
    percentSavings: 34,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=sony+headphones",
    addToCartUrl: "",
    rating: 4.8,
    reviewCount: 8304,
    pickup: true,
    online: true,
    condition: "New",
    tags: ["all", "headphones"]
  },
  {
    id: "demo-gaming-1",
    sku: "DEMO4001",
    title: "Xbox Wireless Controller",
    brand: "Microsoft",
    model: "Carbon Black",
    description: "Textured grips, hybrid D-pad, Bluetooth and USB-C",
    salePrice: 44.99,
    regularPrice: 64.99,
    dollarSavings: 20,
    percentSavings: 31,
    image: "https://images.unsplash.com/photo-1605901309584-818e25960a8f?auto=format&fit=crop&w=600&q=80",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=xbox+controller",
    addToCartUrl: "",
    rating: 4.7,
    reviewCount: 19632,
    pickup: true,
    online: true,
    condition: "New",
    tags: ["all", "gaming"]
  },
  {
    id: "demo-camera-open-box",
    sku: "DEMO5001",
    title: "Canon Mirrorless Camera Kit",
    brand: "Canon",
    model: "EOS",
    description: "24MP sensor, kit lens, 4K video, compact body",
    salePrice: 529.99,
    regularPrice: 799.99,
    dollarSavings: 270,
    percentSavings: 34,
    image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=canon+mirrorless+camera",
    addToCartUrl: "",
    rating: 4.6,
    reviewCount: 714,
    pickup: false,
    online: true,
    condition: "Open Box Excellent",
    tags: ["all", "cameras"]
  },
  {
    id: "demo-appliance-1",
    sku: "DEMO6001",
    title: "Samsung Smart Stainless Steel Dishwasher",
    brand: "Samsung",
    model: "StormWash",
    description: "Quiet operation, adjustable rack, fingerprint-resistant finish",
    salePrice: 549.99,
    regularPrice: 899.99,
    dollarSavings: 350,
    percentSavings: 39,
    image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=samsung+dishwasher",
    addToCartUrl: "",
    rating: 4.4,
    reviewCount: 2317,
    pickup: false,
    online: true,
    condition: "New",
    tags: ["all", "appliances"]
  }
];

const DEMO_PENNY_DEALS = [
  {
    id: "penny-demo-1",
    sku: "PENNY001",
    title: "Insignia 6ft USB-C Cable",
    brand: "Insignia",
    model: "NS-CABLE",
    description: "Demo penny-out item: low price and no online availability.",
    salePrice: 0.99,
    regularPrice: 19.99,
    dollarSavings: 19,
    percentSavings: 95,
    image: "https://images.unsplash.com/photo-1603539444875-76e7684265f6?auto=format&fit=crop&w=600&q=80",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=usb+c+cable",
    rating: 4.4,
    reviewCount: 231,
    pickup: false,
    online: false,
    condition: "New"
  },
  {
    id: "penny-demo-2",
    sku: "PENNY002",
    title: "Open-Box 27 inch Gaming Monitor",
    brand: "Acer",
    model: "Nitro",
    description: "Demo alert for absurd clearance pricing.",
    salePrice: 7.99,
    regularPrice: 249.99,
    dollarSavings: 242,
    percentSavings: 97,
    image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=gaming+monitor",
    rating: 4.6,
    reviewCount: 912,
    pickup: false,
    online: false,
    condition: "Open Box"
  },
  {
    id: "penny-demo-3",
    sku: "PENNY003",
    title: "Smart Plug Two-Pack",
    brand: "Kasa",
    model: "KP2",
    description: "Demo alert for a live online markdown.",
    salePrice: 4.99,
    regularPrice: 39.99,
    dollarSavings: 35,
    percentSavings: 88,
    image: "https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=600&q=80",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=smart+plug",
    rating: 4.5,
    reviewCount: 1204,
    pickup: true,
    online: true,
    condition: "New"
  }
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/api/status" && req.method === "GET") {
      sendJson(res, 200, {
        keyReady: Boolean(getApiKey()),
        source: getApiKey() ? "bestbuy" : "demo",
        notifications: {
          email: Boolean(envValue("RESEND_API_KEY") && envValue("NOTIFY_FROM_EMAIL")),
          sms: Boolean(envValue("TWILIO_ACCOUNT_SID") && envValue("TWILIO_AUTH_TOKEN") && envValue("TWILIO_FROM_NUMBER"))
        }
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && req.method === "POST") {
      await handleRegister(req, res);
      return;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      await handleLogin(req, res);
      return;
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      handleLogout(req, res);
      return;
    }

    if (url.pathname === "/api/me" && req.method === "GET") {
      sendJson(res, 200, { user: safeUser(getCurrentUser(req)) });
      return;
    }

    if (url.pathname === "/api/me" && req.method === "PUT") {
      await handleUpdateMe(req, res);
      return;
    }

    if (url.pathname === "/api/alerts" && req.method === "GET") {
      sendJson(res, 200, { alerts: getAlertsDb().alerts.slice(0, 100), scanState: getScanState() });
      return;
    }

    if (url.pathname === "/api/penny-deals" && req.method === "GET") {
      await handlePennyDeals(req, res, url);
      return;
    }

    if (url.pathname === "/api/penny-scan" && req.method === "POST") {
      await handlePennyScan(req, res);
      return;
    }

    if (url.pathname === "/api/test-notification" && req.method === "POST") {
      await handleTestNotification(req, res);
      return;
    }

    if (url.pathname === "/api/deals" && req.method === "GET") {
      try {
        const data = await fetchBestBuyDeals(url.searchParams);
        sendJson(res, 200, data);
      } catch (error) {
        sendJson(res, 502, {
          source: "error",
          keyReady: Boolean(getApiKey()),
          message: error.message,
          deals: getDemoDeals(url.searchParams)
        });
      }
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { message: "API route not found." });
      return;
    }

    sendStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { message: error.message || "Unexpected server error." });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Dominic Deals is running at http://localhost:${PORT}`);
  startAutoPennyMonitor();
});

function startAutoPennyMonitor() {
  const enabled = String(envValue("AUTO_PENNY_SCAN") || "true").toLowerCase() !== "false";
  if (!enabled) return;

  const minutes = clampNumber(envValue("PENNY_SCAN_MINUTES"), 5, 1, 1440);
  const interval = setInterval(async () => {
    if (!getApiKey()) return;
    if (!getUsersDb().users.length) return;

    try {
      await runPennyScanForUsers();
    } catch (error) {
      console.warn(`Penny monitor scan failed: ${error.message}`);
    }
  }, minutes * 60 * 1000);

  if (typeof interval.unref === "function") interval.unref();
  console.log(`Penny monitor checks every ${minutes} minute(s) when an API key and users exist.`);
}
