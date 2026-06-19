const state = {
  settings: {
    businessName: "thwear",
    whatsappNumber: ""
  },
  products: [],
  groups: [],
  visible: [],
  cart: new Map(),
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

  els.grid.innerHTML = renderFolders(state.visible);

  els.grid.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.add));
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderFolders(groups) {
  return groupFolders(groups).map((folder) => `
    <section class="folder-section">
      <div class="folder-head">
        <div>
          <p class="eyebrow">Pasta</p>
          <h2>${escapeHtml(folder.name)}</h2>
        </div>
        <span>${folder.pieces} peca${folder.pieces === 1 ? "" : "s"} · ${folder.groups.length} modelo${folder.groups.length === 1 ? "" : "s"}</span>
      </div>
      <div class="folder-grid">
        ${folder.groups.map(renderProduct).join("")}
      </div>
    </section>
  `).join("");
}

function renderProduct(product) {
  const cover = product.items[0];
  const price = product.price === null
    ? `<strong class="pending">Consultar preco</strong>`
    : `<strong>${money.format(product.price)}</strong>`;

  const sizes = product.sizes.map((size) => {
    const item = product.items.find((variant) => variant.size === size);
    const selected = state.cart.has(item.id) ? " selected" : "";
    return `
      <button class="size-pill${selected}" type="button" data-add="${item.id}" title="Separar tamanho ${escapeHtml(size)}">
        ${escapeHtml(size)}
      </button>
    `;
  }).join("");
  const colors = product.colors.map((color) => {
    const item = product.items.find((variant) => variant.color === color) || cover;
    const swatch = colorSwatch(color);
    return `
      <button class="color-pill" type="button" data-add="${item.id}" title="Separar cor ${escapeHtml(color)}">
        <span class="swatch" style="${swatch}"></span>
        ${escapeHtml(color)}
      </button>
    `;
  }).join("");

  const message = encodeURIComponent(
    `Oi! Tenho interesse neste item:\n\n${product.title}\nCategoria: ${product.category}\nTamanhos disponiveis: ${product.sizes.join(", ")}\nCores: ${product.colors.join(", ")}\nMarca: ${product.brand}\nLink: ${cover.driveUrl}`
  );

  return `
    <article class="product">
      <div class="image-wrap">
        <img src="${cover.image}" alt="${escapeHtml(product.title)}" loading="lazy" />
        <span class="badge">${product.items.length} peca${product.items.length === 1 ? "" : "s"}</span>
      </div>
      <div class="product-body">
        <h3>${escapeHtml(product.title)}</h3>
        <div class="meta">
          <span class="chip">${escapeHtml(product.category)}</span>
          <span class="chip">${escapeHtml(product.brand)}</span>
        </div>
        <div class="sizes" aria-label="Tamanhos disponiveis">
          ${sizes}
        </div>
        <div class="colors" aria-label="Cores disponiveis">
          ${colors}
        </div>
        <div class="price">
          ${price}
          <span class="chip">${product.sizes.length} tam. · ${product.colors.length} cor${product.colors.length === 1 ? "" : "es"}</span>
        </div>
        <div class="actions">
          <a class="primary" href="${whatsappUrl(message)}" target="_blank" rel="noreferrer">
            <i data-lucide="message-circle"></i>
            WhatsApp
          </a>
          <button class="secondary" type="button" data-add="${cover.id}" title="Separar primeira opcao">
            <i data-lucide="plus"></i>
          </button>
        </div>
      </div>
    </article>
  `;
}

function groupFolders(groups) {
  const folders = new Map();

  for (const group of groups) {
    const key = group.folderName || group.category;
    if (!folders.has(key)) {
      folders.set(key, { name: key, groups: [], pieces: 0 });
    }
    const folder = folders.get(key);
    folder.groups.push(group);
    folder.pieces += group.items.length;
  }

  return [...folders.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
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
        colors: []
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
    return group;
  }).sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { numeric: true }));
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
    ...items.map((item, index) => `${index + 1}. ${item.title} | ${item.category} | Tam. ${item.size} | Cor: ${item.color || "Cor a identificar"} | ${item.brand}\n${item.driveUrl}`)
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
