const state = {
  settings: {
    businessName: "thwear",
    whatsappNumber: ""
  },
  products: [],
  groups: [],
  visible: [],
  cart: new Map(),
  selections: new Map(),
  filters: {
    query: "",
    category: "all",
    size: "all",
    color: "all",
    brand: "all"
  }
};

const MAX_CART_ITEMS = 20;

const els = {
  grid: document.querySelector("#catalogGrid"),
  search: document.querySelector("#searchInput"),
  category: document.querySelector("#categoryFilter"),
  size: document.querySelector("#sizeFilter"),
  color: document.querySelector("#colorFilter"),
  brand: document.querySelector("#brandFilter"),
  total: document.querySelector("#totalProducts"),
  visible: document.querySelector("#visibleProducts"),
  pending: document.querySelector("#pendingPrices"),
  cartButton: document.querySelector("#cartButton"),
  cartCount: document.querySelector("#cartCount"),
  drawer: document.querySelector("#cartDrawer"),
  closeCart: document.querySelector("#closeCart"),
  cartList: document.querySelector("#cartList"),
  whatsappOrder: document.querySelector("#whatsappOrder"),
  scrim: document.querySelector("#scrim")
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

init();

async function init() {
  const [catalogResponse, settingsResponse] = await Promise.all([
    fetch("./data/catalog.json"),
    fetch("./data/settings.json")
  ]);

  const data = await catalogResponse.json();
  state.settings = {
    ...state.settings,
    ...(await settingsResponse.json())
  };
  state.products = data.products.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

  hydrateFilters();
  bindEvents();
  applyFilters();
  renderCart();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function hydrateFilters() {
  fillSelect(els.category, "Todas categorias", unique("category"));
  fillSelect(els.size, "Todos tamanhos", unique("size"));
  fillSelect(els.color, "Todas cores", unique("color"));
  fillSelect(els.brand, "Todas marcas", unique("brand"));
}

function unique(field) {
  return [...new Set(state.products.map((product) => product[field]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true }));
}

function fillSelect(select, label, options) {
  select.innerHTML = [
    `<option value="all">${label}</option>`,
    ...options.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
  ].join("");
}

function bindEvents() {
  els.search.addEventListener("input", (event) => {
    state.filters.query = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  for (const [key, select] of [
    ["category", els.category],
    ["size", els.size],
    ["color", els.color],
    ["brand", els.brand]
  ]) {
    select.addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      applyFilters();
    });
  }

  els.cartButton.addEventListener("click", openCart);
  els.closeCart.addEventListener("click", closeCart);
  els.scrim.addEventListener("click", closeCart);
}

function applyFilters() {
  const filteredProducts = state.products.filter((product) => {
    const queryText = [
      product.title,
      product.category,
      product.brand,
      product.size,
      product.color,
      product.fileName,
      product.folderPath
    ].join(" ").toLowerCase();

    return (
      (!state.filters.query || queryText.includes(state.filters.query)) &&
      (state.filters.category === "all" || product.category === state.filters.category) &&
      (state.filters.size === "all" || product.size === state.filters.size) &&
      (state.filters.color === "all" || product.color === state.filters.color) &&
      (state.filters.brand === "all" || product.brand === state.filters.brand)
    );
  });

  state.groups = groupProducts(filteredProducts);
  state.visible = state.groups;
  renderMetrics();
  renderCatalog();
}

function renderMetrics() {
  els.total.textContent = state.products.length;
  els.visible.textContent = state.groups.length;
  els.pending.textContent = state.products.filter((product) => product.price === null).length;
}

function renderCatalog() {
  if (!state.visible.length) {
    els.grid.innerHTML = `<div class="empty">Nenhum produto encontrado.</div>`;
    return;
  }

  els.grid.innerHTML = state.visible.map(renderProduct).join("");

  els.grid.querySelectorAll("[data-select-size]").forEach((button) => {
    button.addEventListener("click", () => selectVariant(button.dataset.productId, { size: button.dataset.selectSize }));
  });

  els.grid.querySelectorAll("[data-select-color]").forEach((button) => {
    button.addEventListener("click", () => selectVariant(button.dataset.productId, { color: button.dataset.selectColor }));
  });

  els.grid.querySelectorAll("[data-preview]").forEach((button) => {
    button.addEventListener("click", () => selectVariant(button.dataset.productId, {
      size: button.dataset.previewSize,
      color: button.dataset.previewColor,
      itemId: button.dataset.preview
    }));
  });

  els.grid.querySelectorAll("[data-add-selected]").forEach((button) => {
    button.addEventListener("click", () => addSelectedToCart(button.dataset.addSelected));
  });

  els.grid.querySelectorAll("[data-whatsapp-selected]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const product = state.groups.find((item) => item.id === link.dataset.whatsappSelected);
      if (!product) return;
      link.href = whatsappUrl(buildProductMessage(product));
    });
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderProduct(product) {
  const selection = getSelection(product);
  const cover = selection.item;
  const price = product.price === null
    ? `<strong class="pending">Consultar preco</strong>`
    : `<strong>${money.format(product.price)}</strong>`;

  const sizes = product.sizes.map((size) => {
    const selected = selection.size === size ? " selected" : "";
    return `
      <button class="size-pill${selected}" type="button" data-product-id="${escapeHtml(product.id)}" data-select-size="${escapeHtml(size)}" title="Escolher tamanho ${escapeHtml(size)}">
        ${escapeHtml(size)}
      </button>
    `;
  }).join("");
  const colors = product.colors.map((color) => {
    const selected = selection.color === color ? " selected" : "";
    const swatch = colorSwatch(color);
    return `
      <button class="color-pill${selected}" type="button" data-product-id="${escapeHtml(product.id)}" data-select-color="${escapeHtml(color)}" title="Escolher cor ${escapeHtml(color)}">
        <span class="swatch" style="${swatch}"></span>
        ${escapeHtml(color)}
      </button>
    `;
  }).join("");
  const gallery = product.gallery.map((item) => {
    const selected = item.id === cover.id || item.color === selection.color ? " selected" : "";
    const swatch = colorSwatch(item.color || "Cor a identificar");
    return `
      <button class="thumb${selected}" type="button" data-product-id="${escapeHtml(product.id)}" data-preview="${escapeHtml(item.id)}" data-preview-size="${escapeHtml(item.size)}" data-preview-color="${escapeHtml(item.color || "Cor a identificar")}" title="${escapeHtml(item.color || "Cor a identificar")} ${escapeHtml(item.size)}">
        <img src="${item.image}" alt="${escapeHtml(product.title)} ${escapeHtml(item.color || "")}" loading="lazy" />
        <span class="thumb-swatch" style="${swatch}"></span>
      </button>
    `;
  }).join("");
  const selectedSummary = `${selection.size} · ${selection.color || "Cor a identificar"}`;

  return `
    <article class="product" data-product-id="${escapeHtml(product.id)}">
      <div class="image-wrap">
        <img src="${cover.image}" alt="${escapeHtml(product.title)}" loading="lazy" />
        <span class="badge">${product.items.length} peca${product.items.length === 1 ? "" : "s"}</span>
      </div>
      <div class="thumb-row" aria-label="Fotos do produto">
        ${gallery}
      </div>
      <div class="product-body">
        <h3>${escapeHtml(product.title)}</h3>
        <div class="meta">
          <span class="chip folder-chip">${escapeHtml(product.folderName)}</span>
          <span class="chip">${escapeHtml(product.category)}</span>
          <span class="chip">${escapeHtml(product.brand)}</span>
        </div>
        <div class="sizes" aria-label="Tamanhos disponiveis">
          ${sizes}
        </div>
        <div class="colors" aria-label="Cores disponiveis">
          ${colors}
        </div>
        <p class="selection-line">Selecionado: ${escapeHtml(selectedSummary)}</p>
        <div class="price">
          ${price}
          <span class="chip">${product.sizes.length} tam. · ${product.colors.length} cor${product.colors.length === 1 ? "" : "es"}</span>
        </div>
        <div class="actions">
          <a class="primary" href="${whatsappUrl(buildProductMessage(product))}" data-whatsapp-selected="${escapeHtml(product.id)}" target="_blank" rel="noreferrer">
            <i data-lucide="message-circle"></i>
            WhatsApp
          </a>
          <button class="secondary" type="button" data-add-selected="${escapeHtml(product.id)}" title="Adicionar tamanho e cor escolhidos">
            <i data-lucide="plus"></i>
          </button>
        </div>
      </div>
    </article>
  `;
}

function groupProducts(products) {
  const groups = new Map();

  for (const product of products) {
    const folderName = folderLabel(product);
    const key = [
      product.category,
      product.brand,
      folderName
    ].join("|");

    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        title: product.title,
        category: product.category,
        brand: product.brand,
        folderName,
        price: product.price,
        items: [],
        sizes: [],
        colors: [],
        gallery: []
      });
    }

    groups.get(key).items.push(product);
  }

  return [...groups.values()].map((group) => {
    group.items.sort((a, b) => {
      const sizeSort = compareSizes(a.size, b.size);
      if (sizeSort !== 0) return sizeSort;
      return new Date(b.createdTime || 0) - new Date(a.createdTime || 0);
    });
    group.sizes = [...new Set(group.items.map((item) => item.size || "Unico"))].sort(compareSizes);
    group.colors = [...new Set(group.items.map((item) => item.color || "Cor a identificar"))]
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    group.gallery = galleryItems(group.items);
    return group;
  }).sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { numeric: true }));
}

function galleryItems(items) {
  const byColor = new Map();

  for (const item of items) {
    const color = item.color || "Cor a identificar";
    if (!byColor.has(color)) {
      byColor.set(color, item);
    }
  }

  return [...byColor.values()].sort((a, b) => {
    const colorSort = String(a.color || "").localeCompare(String(b.color || ""), "pt-BR", { numeric: true });
    if (colorSort !== 0) return colorSort;
    return compareSizes(a.size, b.size);
  });
}

function getSelection(product) {
  const saved = state.selections.get(product.id) || {};
  let item = saved.itemId ? product.items.find((variant) => variant.id === saved.itemId) : null;

  if (!item) {
    item = findVariant(product, { size: saved.size, color: saved.color });
  }

  if (!item && saved.size) {
    item = product.items.find((variant) => variant.size === saved.size);
  }

  if (!item && saved.color) {
    item = product.items.find((variant) => variant.color === saved.color);
  }

  item ||= product.items[0];

  return {
    size: item.size || "Unico",
    color: item.color || "Cor a identificar",
    item
  };
}

function findVariant(product, { size, color }) {
  return product.items.find((item) => {
    const sizeMatches = !size || item.size === size;
    const colorMatches = !color || (item.color || "Cor a identificar") === color;
    return sizeMatches && colorMatches;
  });
}

function selectVariant(productId, changes) {
  const product = state.groups.find((item) => item.id === productId);
  if (!product) return;

  const current = getSelection(product);
  const next = {
    size: changes.size || current.size,
    color: changes.color || current.color,
    itemId: changes.itemId || ""
  };

  let item = next.itemId ? product.items.find((variant) => variant.id === next.itemId) : null;
  item ||= findVariant(product, next);
  item ||= changes.size ? product.items.find((variant) => variant.size === next.size) : null;
  item ||= changes.color ? product.items.find((variant) => (variant.color || "Cor a identificar") === next.color) : null;
  item ||= current.item;

  state.selections.set(productId, {
    size: item.size || "Unico",
    color: item.color || "Cor a identificar",
    itemId: item.id
  });

  renderCatalog();
}

function addSelectedToCart(productId) {
  const product = state.groups.find((item) => item.id === productId);
  if (!product) return;
  addToCart(getSelection(product).item.id);
}

function buildProductMessage(product) {
  const selection = getSelection(product);
  const priceMessage = product.price === null ? "Consultar preco" : money.format(product.price);
  const text = `Oi! Tenho interesse neste item:\n\n${product.title}\nCategoria: ${product.category}\nPreco: ${priceMessage}\nTamanho: ${selection.size}\nCor: ${selection.color}\nMarca: ${product.brand}\nLink: ${selection.item.driveUrl}`;
  return encodeURIComponent(text);
}

function folderLabel(product) {
  return product.folderName || product.folderPath?.split("/")?.[0]?.trim() || product.category || "Produtos";
}

function compareSizes(a, b) {
  const order = ["PP", "P", "M", "G", "GG", "XG", "XXL", "Unico"];
  const aText = String(a);
  const bText = String(b);
  const aNum = Number(aText);
  const bNum = Number(bText);

  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
  if (Number.isFinite(aNum)) return -1;
  if (Number.isFinite(bNum)) return 1;

  const aIndex = order.indexOf(aText);
  const bIndex = order.indexOf(bText);
  if (aIndex !== -1 || bIndex !== -1) {
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  }

  return aText.localeCompare(bText, "pt-BR", { numeric: true });
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  if (!state.cart.has(productId) && state.cart.size >= MAX_CART_ITEMS) {
    openCart();
    return;
  }

  state.cart.set(productId, product);
  renderCart();
  openCart();
}

function renderCart() {
  const items = [...state.cart.values()];
  els.cartCount.textContent = items.length;

  if (!items.length) {
    els.cartList.innerHTML = `<div class="empty">Nenhum item separado.</div>`;
    els.whatsappOrder.href = "https://wa.me/";
    return;
  }

  const limitWarning = items.length >= MAX_CART_ITEMS
    ? `<div class="cart-note">Limite de ${MAX_CART_ITEMS} itens por mensagem.</div>`
    : "";

  els.cartList.innerHTML = `${limitWarning}${items.map((item) => `
    <div class="cart-item">
      <img src="${item.image}" alt="${escapeHtml(item.title)}" />
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.category)} · ${escapeHtml(item.size)} · ${escapeHtml(item.color || "Cor a identificar")} · ${escapeHtml(item.brand)}</p>
      </div>
      <button class="icon-link" type="button" data-remove="${item.id}" title="Remover">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `).join("")}`;

  els.cartList.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state.cart.delete(button.dataset.remove);
      renderCart();
    });
  });

  const message = encodeURIComponent([
    "Oi! Quero consultar estes itens:",
    "",
    ...items.map((item, index) => {
      const price = item.price === null ? "Consultar preco" : money.format(item.price);
      return `${index + 1}. ${item.title} | ${item.category} | ${price} | Tam. ${item.size} | Cor: ${item.color || "Cor a identificar"} | ${item.brand}\n${item.driveUrl}`;
    })
  ].join("\n"));

  els.whatsappOrder.href = whatsappUrl(message);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function colorSwatch(color) {
  const normalized = normalizeText(color);
  const map = {
    amarelo: "#f5c542",
    azul: "#2f6fca",
    "azul marinho": "#182c5a",
    bege: "#d8c5a3",
    branco: "#ffffff",
    caramelo: "#b9783f",
    cinza: "#8b9291",
    "cor a identificar": "#dce2dd",
    dourado: "#d4af37",
    estampado: "linear-gradient(135deg, #1f7a4d, #f5c542, #2f6fca)",
    laranja: "#f08a24",
    lilas: "#b592d6",
    marrom: "#6f4e37",
    nude: "#d7b7a3",
    "off white": "#f8f5ec",
    preto: "#111413",
    rosa: "#e68aaa",
    roxo: "#7446a8",
    verde: "#1f7a4d",
    "verde militar": "#4b5d3b",
    vermelho: "#c0392b",
    vinho: "#7b1e35"
  };

  const value = map[normalized] || "#dce2dd";
  return value.startsWith("linear-gradient")
    ? `background: ${value}`
    : `background: ${value}`;
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function openCart() {
  els.drawer.classList.add("open");
  els.scrim.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  els.drawer.classList.remove("open");
  els.scrim.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
}

function whatsappUrl(encodedMessage = "") {
  const number = String(state.settings.whatsappNumber || "").replace(/\D/g, "");
  const base = number ? `https://wa.me/${number}` : "https://wa.me/";
  return encodedMessage ? `${base}?text=${encodedMessage}` : base;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
