#!/usr/bin/env node

import jpeg from "jpeg-js";

const API = "https://www.googleapis.com/drive/v3/files";
const IMAGE_MIME_PREFIX = "image/";
const IMAGE_COLOR_CONCURRENCY = 8;

const args = parseArgs(process.argv.slice(2));
const token = await getDriveAccessToken();
const rootFolderId = args.root || "1E6XqPMoxn-xq36Kf4wVkYW3JlupTyjIU";
const outputPath = args.out || "data/catalog.json";

const products = [];
await crawlFolder(rootFolderId, []);

const payload = {
  source: {
    provider: "Google Drive",
    rootFolderId,
    rootUrl: `https://drive.google.com/drive/folders/${rootFolderId}`,
    syncedAt: new Date().toISOString(),
    note: "Gerado automaticamente pelo sync do catalogo."
  },
  priceRules: defaultPriceRules(),
  products: products.sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0))
};

await writeJson(outputPath, payload);
console.log(`Synced ${products.length} products to ${outputPath}`);

async function crawlFolder(folderId, path) {
  const children = await listChildren(folderId);
  const images = children.filter((item) => item.mimeType?.startsWith(IMAGE_MIME_PREFIX));
  const imageProducts = await mapLimit(images, IMAGE_COLOR_CONCURRENCY, (item) => buildProduct(item, path));
  products.push(...imageProducts);

  for (const item of children) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      await crawlFolder(item.id, [...path, item.name]);
    }
  }
}

async function listChildren(folderId) {
  const fields = [
    "nextPageToken",
    "files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink)"
  ].join(",");

  let pageToken = "";
  const files = [];

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields,
      pageSize: "1000",
      orderBy: "folder,name_natural",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true"
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(`${API}?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Drive API ${response.status}: ${await response.text()}`);
    }

    const page = await response.json();
    files.push(...(page.files || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);

  return files;
}

async function buildProduct(file, path) {
  const category = inferCategory(path);
  const size = inferSize(path) || "Unico";
  const brand = inferBrand(path) || "A identificar";
  const textColor = inferColor([...path, file.name]);
  const visualColor = textColor ? "" : await inferVisualColor(file.id);
  const color = textColor || visualColor || "Cor a identificar";
  const title = inferTitle(category, brand);

  return {
    id: slug([category, brand, size, color, file.id].join("-")),
    title,
    category,
    brand,
    size,
    color,
    colorSource: textColor ? "texto" : visualColor ? "imagem" : "indefinida",
    price: null,
    status: "available",
    confidence: "path",
    driveFileId: file.id,
    fileName: file.name,
    driveUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    image: `https://drive.google.com/thumbnail?id=${file.id}&sz=w900`,
    folderName: path[0] || category,
    folderPath: path.join(" / "),
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function inferCategory(path) {
  const joined = normalize(path.join(" "));

  if (joined.includes("perfume")) return "Perfume";
  if (joined.includes("camisa social")) return "Camisa social";
  if (joined.includes("camisa feminina") || joined.includes("farm")) return "Camisa feminina";
  if (joined.includes("camisa premium") || joined.includes("camisas premium")) return "Camisa premium";
  if (joined.includes("polo")) return "Camisa polo";
  if (joined.includes("jeans")) return "Calca jeans";
  if (joined.includes("alfaiataria")) return "Calca alfaiataria";
  if (joined.includes("sarja") && joined.includes("calca")) return "Calca sarja";
  if (joined.includes("sueter")) return "Sueter";
  if (joined.includes("regata")) return "Regata";
  if (joined.includes("cueca")) return "Cueca premium";
  if (joined.includes("calca")) return "Calca";
  if (joined.includes("short") || joined.includes("bermuda")) return "Short / Bermuda";
  if (joined.includes("camisa") || joined.includes("premium") || joined.includes("farm")) return "Camiseta / Camisa";

  return path[0] || "Produto";
}

function inferSize(path) {
  const joined = ` ${normalize(path.join(" "))} `;
  const numeric = joined.match(/\b(3[6-9]|4[0-9]|5[0-4])\b/);
  if (numeric) return numeric[1];

  const alpha = joined.match(/\b(PP|P|M|G|GG|XXL|XG)\b/i);
  if (alpha) return alpha[1].toUpperCase();

  return "";
}

function inferBrand(path) {
  const joined = normalize(path.join(" "));
  const brands = ["Farm", "Premium", "Ralph Lauren", "Lacoste", "Tommy", "Nike", "Adidas"];
  return brands.find((brand) => joined.includes(normalize(brand))) || "";
}

function inferColor(parts) {
  const joined = ` ${normalize(parts.join(" "))} `;
  const colors = [
    ["Azul marinho", ["azul marinho", "marinho"]],
    ["Verde militar", ["verde militar", "militar"]],
    ["Off white", ["off white", "off-white"]],
    ["Branco", ["branco", "branca", "white"]],
    ["Preto", ["preto", "preta", "black"]],
    ["Cinza", ["cinza", "chumbo", "grafite", "gray", "grey"]],
    ["Azul", ["azul", "blue"]],
    ["Verde", ["verde", "green"]],
    ["Vermelho", ["vermelho", "vermelha", "red"]],
    ["Vinho", ["vinho", "bordo", "bordô", "burgundy"]],
    ["Rosa", ["rosa", "pink"]],
    ["Roxo", ["roxo", "roxa", "purple"]],
    ["Lilas", ["lilas", "lilás"]],
    ["Amarelo", ["amarelo", "amarela", "yellow"]],
    ["Laranja", ["laranja", "orange"]],
    ["Bege", ["bege", "beige"]],
    ["Nude", ["nude"]],
    ["Marrom", ["marrom", "brown"]],
    ["Caramelo", ["caramelo", "caramel"]],
    ["Dourado", ["dourado", "dourada", "gold"]],
    ["Estampado", ["estampado", "estampada", "floral", "listrado", "listrada", "xadrez"]]
  ];

  for (const [label, aliases] of colors) {
    if (aliases.some((alias) => joined.includes(` ${normalize(alias)} `))) {
      return label;
    }
  }

  return "";
}

async function inferVisualColor(fileId) {
  try {
    const response = await fetch(`https://drive.google.com/thumbnail?id=${fileId}&sz=w64`);
    if (!response.ok || !response.headers.get("content-type")?.includes("jpeg")) return "";

    const bytes = Buffer.from(await response.arrayBuffer());
    const image = jpeg.decode(bytes, { useTArray: true });
    const counts = new Map();
    const x0 = Math.floor(image.width * 0.18);
    const x1 = Math.ceil(image.width * 0.82);
    const y0 = Math.floor(image.height * 0.12);
    const y1 = Math.ceil(image.height * 0.88);

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * image.width + x) * 4;
        const r = image.data[offset];
        const g = image.data[offset + 1];
        const b = image.data[offset + 2];
        const label = classifyColor(r, g, b);
        if (!label) continue;
        counts.set(label, (counts.get(label) || 0) + colorWeight(r, g, b));
      }
    }

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] || "";
  } catch {
    return "";
  }
}

function classifyColor(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const avg = (r + g + b) / 3;

  if (avg > 232 && delta < 28) return "Branco";
  if (avg < 48) return "Preto";
  if (delta < 22) return "Cinza";

  const hue = rgbHue(r, g, b);
  const saturation = max === 0 ? 0 : delta / max;

  if (saturation < 0.16) {
    if (avg > 178) return "Bege";
    if (avg < 82) return "Preto";
    return "Cinza";
  }

  if (hue < 16 || hue >= 346) return avg < 105 ? "Vinho" : "Vermelho";
  if (hue < 36) return avg < 118 ? "Marrom" : "Laranja";
  if (hue < 58) return saturation < 0.34 ? "Bege" : "Amarelo";
  if (hue < 165) return "Verde";
  if (hue < 250) return "Azul";
  if (hue < 292) return "Roxo";
  if (hue < 330) return avg > 150 ? "Rosa" : "Roxo";
  return "Vinho";
}

function colorWeight(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const avg = (r + g + b) / 3;
  const exposurePenalty = avg > 245 || avg < 18 ? 0.15 : 1;
  return (0.7 + saturation) * exposurePenalty;
}

function rgbHue(r, g, b) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  if (delta === 0) return 0;

  let hue;
  if (max === nr) hue = 60 * (((ng - nb) / delta) % 6);
  else if (max === ng) hue = 60 * ((nb - nr) / delta + 2);
  else hue = 60 * ((nr - ng) / delta + 4);

  return hue < 0 ? hue + 360 : hue;
}

function inferTitle(category, brand) {
  if (brand && brand !== "A identificar" && !category.toLowerCase().includes(brand.toLowerCase())) {
    return `${category} ${brand}`.trim();
  }

  return category;
}

function defaultPriceRules() {
  return [
    { category: "Camiseta / Camisa", price: null },
    { category: "Camisa premium", price: null },
    { category: "Camisa polo", price: null },
    { category: "Camisa social", price: null },
    { category: "Camisa feminina", price: null },
    { category: "Calca jeans", price: null },
    { category: "Calca sarja", price: null },
    { category: "Calca alfaiataria", price: null },
    { category: "Sueter", price: null },
    { category: "Regata", price: null },
    { category: "Cueca premium", price: null },
    { category: "Perfume", price: null }
  ];
}

async function writeJson(path, data) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slug(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") parsed.root = argv[++index];
    if (arg === "--out") parsed.out = argv[++index];
  }

  return parsed;
}

async function getDriveAccessToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return process.env.GOOGLE_ACCESS_TOKEN;
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.error("Missing Google credentials.");
    console.error("Use GOOGLE_ACCESS_TOKEN for local tests or GOOGLE_SERVICE_ACCOUNT_JSON for daily automation.");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const assertion = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(claim))
  ].join(".");

  const { createSign } = await import("node:crypto");
  const signature = createSign("RSA-SHA256")
    .update(assertion)
    .sign(serviceAccount.private_key);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${assertion}.${base64url(signature)}`
    })
  });

  if (!response.ok) {
    throw new Error(`Google OAuth ${response.status}: ${await response.text()}`);
  }

  const token = await response.json();
  return token.access_token;
}

function base64url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
