// Temporary catalog data. Replace name and price here when finalized.
const PRODUCTS = [{ id: 'plop-01', name: 'PLOPSTAND', price: 0, image: 'assets/group-26.png', category: 'coat-stands', collection: 'plop', alt: 'PLOPSTAND coat stand with crossed wooden poles, a circular metal rail, and a round base' }];
const shopView = document.querySelector('#shop-view');
const shopOpenButton = document.querySelector('[data-shop-open]');
const productGrid = document.querySelector('#product-grid');
const detail = document.querySelector('#product-detail');
const pageTitles = { instructions: 'Instructions', about: 'About', cart: 'Cart' };
const cartStorageKey = 'plopdrobe-cart-v1';
let activeCategory = 'all';
let activeCollection = 'all';
let lastRoute = null;
let cartQuantity = readCartQuantity();
const priceLabel = price => `₩${price.toLocaleString('en-US')}`;
function renderProducts() {
  productGrid.replaceChildren();
  const products = PRODUCTS.filter(p => (activeCategory === 'all' || p.category === activeCategory) && (activeCollection === 'all' || p.collection === activeCollection));
  for (const product of products) {
    const card = document.createElement('button');
    card.className = 'product-card'; card.type = 'button';
    const img = document.createElement('img'); img.src = product.image; img.alt = product.alt; img.width = 418; img.height = 555;
    const name = document.createElement('h3'); name.textContent = product.name;
    const price = document.createElement('p'); price.textContent = priceLabel(product.price);
    card.append(img, name, price);
    card.addEventListener('click', () => { location.hash = `product/${product.id}`; });
    productGrid.append(card);
  }
  document.querySelector('#shop-empty').hidden = products.length > 0;
  document.querySelector('#shop-status').textContent = `${products.length} ITEMS`;
  document.querySelectorAll('[data-category]').forEach(b => {
    // Keep reference-sized filter boxes with the narrower Source Sans Pro lettering.
    b.style.setProperty('--label-length', b.textContent.trim().length);
    b.setAttribute('aria-pressed', String(b.dataset.category === activeCategory));
  });
  document.querySelectorAll('[data-collection]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.collection === activeCollection)));
}
function routeShop() {
  const isProduct = location.hash === '#product/plop-01';
  const isSimulation = location.hash === '#simulation';
  const requestedPage = location.hash.slice(1);
  const page = Object.hasOwn(pageTitles, requestedPage) ? requestedPage : null;
  for (const view of document.querySelectorAll('[data-site-page]')) view.hidden = view.dataset.sitePage !== page;
  document.querySelector('#site-footer').hidden = !page;
  document.body.classList.toggle('page-open', !!page);
  document.querySelectorAll('[data-page]').forEach(button => {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelector('#simulation-view').hidden = !isSimulation;
  document.body.classList.toggle('simulation-open', isSimulation);
  document.querySelector('[data-simulation-open]').setAttribute('aria-pressed', String(isSimulation));
  const open = location.hash.startsWith('#shop/') || isProduct || isSimulation;
  document.querySelector('[data-shop-all]').setAttribute('aria-pressed', String(open && !isSimulation));
  detail.hidden = !isProduct;
  document.querySelector('.shop-content').hidden = isProduct || isSimulation;
  document.body.classList.toggle('product-open', isProduct);
  activeCollection = location.hash === '#shop/plop' ? 'plop' : 'all';
  shopView.hidden = !open;
  document.body.classList.toggle('shop-open', open);
  stage.inert = open || !!page;
  stage.setAttribute('aria-hidden', String(open || !!page));
  shopOpenButton.setAttribute('aria-expanded', String(open));
  if (open) { shopOpenButton.setAttribute('aria-current', 'page'); renderProducts(); }
  else shopOpenButton.removeAttribute('aria-current');
  if (isProduct) {
    const product = PRODUCTS[0];
    document.querySelector('#product-title').textContent = product.name;
    document.querySelector('#product-detail-price').textContent = priceLabel(product.price);
    window.scrollTo(0, 0);
  }
  window.dispatchEvent(new CustomEvent('plopdrobe:route', { detail: location.hash }));
  if (isSimulation) { window.scrollTo(0, 0); loadSimulation(); }
  if (page === 'cart') renderCart();
  if (lastRoute !== location.hash) window.scrollTo(0, 0);
  lastRoute = location.hash;
  document.title = page ? `${pageTitles[page]} — Plopdrobe` : isSimulation ? 'Simulation — Plopdrobe' : isProduct ? PRODUCTS[0].name + ' — Plopdrobe' : open ? 'Shop — Plopdrobe' : 'Plopdrobe — A Place for Things to Land';
}
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
  if (location.hash === `#${button.dataset.page}`) { routeShop(); window.scrollTo(0, 0); }
  else location.hash = button.dataset.page;
}));
function openAllItems() {
  activeCategory = 'all';
  if (location.hash === '#shop/all') routeShop(); else location.hash = 'shop/all';
  window.scrollTo(0, 0);
}
shopOpenButton.addEventListener('click', openAllItems);
document.querySelector('[data-shop-all]').addEventListener('click', openAllItems);
document.querySelector('[data-simulation-open]').addEventListener('click', () => {
  if (location.hash === '#simulation') routeShop(); else location.hash = 'simulation';
});
async function loadSimulation() {
  try {
    const module = await import('./simulation.mjs');
    await module.openSimulation();
  } catch (error) {
    console.error('Simulation failed to load:', error);
    document.querySelector('#simulation-view').dataset.ready = 'error';
    document.querySelector('#simulation-message').textContent = 'THE 3D SCENE COULD NOT LOAD. RELOAD THE PAGE TO TRY AGAIN.';
  }
}
document.querySelectorAll('[data-category]').forEach(b => b.addEventListener('click', () => { activeCategory = b.dataset.category; renderProducts(); }));
document.querySelectorAll('[data-home]').forEach(b => b.addEventListener('click', event => {
  event.preventDefault();
  if (location.hash) { history.pushState(null, '', location.pathname + location.search); routeShop(); }
  clear(); window.scrollTo(0, 0);
}));
window.addEventListener('hashchange', routeShop);
window.addEventListener('popstate', routeShop);
function readCartQuantity() {
  try {
    const stored = Number(localStorage.getItem(cartStorageKey));
    return Number.isSafeInteger(stored) && stored >= 0 && stored <= 99 ? stored : 0;
  } catch { return 0; }
}
function renderCart() {
  const product = PRODUCTS[0];
  document.querySelector('#cart-count').textContent = cartQuantity;
  document.querySelector('[data-page="cart"]').setAttribute('aria-label', `Cart, ${cartQuantity} ${cartQuantity === 1 ? 'item' : 'items'}`);
  document.querySelector('#cart-empty').hidden = cartQuantity > 0;
  document.querySelector('#cart-items').hidden = cartQuantity === 0;
  document.querySelector('#cart-product-name').textContent = product.name;
  document.querySelector('#cart-unit-price').textContent = priceLabel(product.price);
  document.querySelector('#cart-quantity').value = Math.max(1, cartQuantity);
  document.querySelector('#cart-increase').disabled = cartQuantity >= 99;
  document.querySelector('#cart-line-total').textContent = priceLabel(product.price * cartQuantity);
  document.querySelector('#cart-subtotal').textContent = priceLabel(product.price * cartQuantity);
}
function setCartQuantity(quantity) {
  cartQuantity = Math.min(99, Math.max(0, Math.trunc(quantity)));
  try { localStorage.setItem(cartStorageKey, String(cartQuantity)); } catch {}
  renderCart();
  document.querySelector('#cart-status').textContent = cartQuantity ? `${cartQuantity} ${cartQuantity === 1 ? 'ITEM' : 'ITEMS'}. SUBTOTAL ${priceLabel(PRODUCTS[0].price * cartQuantity)}.` : 'YOUR CART IS EMPTY.';
}
document.querySelectorAll('[data-add-cart]').forEach(button => button.addEventListener('click', () => {
  if (cartQuantity >= 99) { document.querySelector('.cart-feedback').textContent = 'MAXIMUM QUANTITY REACHED'; return; }
  setCartQuantity(cartQuantity + 1);
  document.querySelector('.cart-feedback').textContent = 'ADDED TO CART';
}));
document.querySelector('#cart-increase').addEventListener('click', () => setCartQuantity(cartQuantity + 1));
document.querySelector('#cart-decrease').addEventListener('click', () => {
  setCartQuantity(cartQuantity - 1);
  if (!cartQuantity) document.querySelector('#cart-empty').focus({ preventScroll: true });
});
document.querySelector('#cart-quantity').addEventListener('change', event => {
  const value = event.target.valueAsNumber;
  setCartQuantity(Number.isFinite(value) ? Math.max(1, value) : cartQuantity);
});
document.querySelector('#cart-remove').addEventListener('click', () => {
  setCartQuantity(0);
  document.querySelector('#cart-empty').focus({ preventScroll: true });
});
window.addEventListener('storage', event => {
  if (event.key === cartStorageKey || event.key === null) { cartQuantity = readCartQuantity(); renderCart(); }
});
renderCart();
routeShop();
const purchaseObserver = new IntersectionObserver(entries => {
  document.body.classList.toggle('show-sticky-purchase', !entries[0].isIntersecting);
});
purchaseObserver.observe(document.querySelector('.detail-hero'));
