const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || readEnvFile().PORT || 4177);
const BESTBUY_PRODUCTS_URL = "https://api.bestbuy.com/v1/products";
const BESTBUY_OPEN_BOX_URL = "https://api.bestbuy.com/beta/products/openBox";

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

function getApiKey() {
  return process.env.BESTBUY_API_KEY || readEnvFile().BESTBUY_API_KEY || "";
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
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

  const query = buildProductQuery(params);
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

  let deals = (data.products || []).map(normalizeProductDeal);

  if (params.get("includeOpenBox") === "true") {
    const openBoxDeals = await fetchOpenBoxDeals(params, deals.map((deal) => deal.sku));
    deals = [...deals, ...openBoxDeals];
  }

  return {
    source: "bestbuy",
    keyReady: true,
    generatedAt: new Date().toISOString(),
    total: data.total || deals.length,
    deals: sortDeals(deals, params.get("sort"))
  };
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/status") {
    sendJson(res, 200, { keyReady: Boolean(getApiKey()), source: getApiKey() ? "bestbuy" : "demo" });
    return;
  }

  if (url.pathname === "/api/deals") {
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

  sendStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Dominic Deals is running at http://localhost:${PORT}`);
});
