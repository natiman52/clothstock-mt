/**
 * Browser-only stand-in so `npm run dev` can exercise the POS UI without Tauri.
 * Production terminals always use the Rust SQLite commands.
 */

const KEY = 'clothpos_mock_v2';

function money(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function seedCatalog() {
  return [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      productId: '11111111-1111-4111-8111-111111111111',
      productName: 'Overland Tech Tee',
      styleCode: 'OTT-1001',
      categoryName: 'Tops',
      sku: 'OTT-1001-BLK-M',
      barcode: '2000000000017',
      size: 'M',
      color: 'Black',
      price: '42.00',
      cost: '18.00',
      quantityOnHand: 12,
      isActive: true,
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      productId: '11111111-1111-4111-8111-111111111111',
      productName: 'Overland Tech Tee',
      styleCode: 'OTT-1001',
      categoryName: 'Tops',
      sku: 'OTT-1001-WHT-L',
      barcode: '2000000000024',
      size: 'L',
      color: 'White',
      price: '42.00',
      cost: '18.00',
      quantityOnHand: 8,
      isActive: true,
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      productId: '22222222-2222-4222-8222-222222222222',
      productName: 'Harbor Wool Coat',
      styleCode: 'HWC-2040',
      categoryName: 'Outerwear',
      sku: 'HWC-2040-NAV-S',
      barcode: '2000000000031',
      size: 'S',
      color: 'Navy',
      price: '189.00',
      cost: '90.00',
      quantityOnHand: 3,
      isActive: true,
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      productId: '22222222-2222-4222-8222-222222222222',
      productName: 'Harbor Wool Coat',
      styleCode: 'HWC-2040',
      categoryName: 'Outerwear',
      sku: 'HWC-2040-CAM-M',
      barcode: '2000000000048',
      size: 'M',
      color: 'Camel',
      price: '189.00',
      cost: '90.00',
      quantityOnHand: 0,
      isActive: true,
    },
  ];
}

function emptyCart() {
  return {
    items: [],
    itemCount: 0,
    subtotal: '0.00',
    discountAmount: '0.00',
    taxAmount: '0.00',
    totalAmount: '0.00',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    settings: {
      apiUrl: 'http://localhost:8001',
      storeId: '',
      storeCode: '',
      storeName: '',
      username: '',
      cashierName: '',
      lastAppliedSeq: 0,
      hasToken: false,
      initialized: false,
    },
    catalog: seedCatalog(),
    cart: [],
    sales: [],
    pending: 0,
    logs: [],
  };
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function snapshot(state) {
  const items = state.cart.map((line) => {
    const variant = state.catalog.find((v) => v.id === line.variantId);
    const qty = line.quantity;
    const unit = Number(line.unitPrice);
    return {
      ...line,
      productName: variant?.productName || line.productName,
      sku: variant?.sku || line.sku,
      barcode: variant?.barcode,
      size: variant?.size || '',
      color: variant?.color || '',
      quantityOnHand: variant?.quantityOnHand ?? 0,
      lineTotal: money(unit * qty - Number(line.discountAmount || 0)),
    };
  });
  const subtotal = items.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  return {
    items,
    itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: money(subtotal),
    discountAmount: '0.00',
    taxAmount: '0.00',
    totalAmount: money(subtotal),
  };
}

export async function mockInvoke(command, args = {}) {
  const state = load();
  switch (command) {
    case 'is_initialized':
      return {
        initialized: Boolean(state.settings.initialized),
        storeName: state.settings.storeName || '',
        username: state.settings.username || '',
      };
    case 'complete_onboarding': {
      const storeCode = String(args.storeCode || '').trim().toUpperCase();
      const username = String(args.username || '').trim();
      const password = String(args.password || '');
      const passwordConfirm = String(args.passwordConfirm || '');
      if (!storeCode) throw new Error('Store code is required.');
      if (!username) throw new Error('Username is required.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      if (password !== passwordConfirm) throw new Error('Password confirmation does not match.');
      state.settings.storeName = storeCode;
      state.settings.storeCode = storeCode;
      state.settings.username = username;
      state.settings.cashierName = username;
      state.settings.hasToken = true;
      state.settings.initialized = true;
      state.logs.push({ action: 'ONBOARDING_COMPLETE', at: new Date().toISOString() });
      save(state);
      return state.settings;
    }
    case 'get_settings':
      return state.settings;
    case 'save_settings':
      state.settings = { ...state.settings, ...args, hasToken: state.settings.hasToken };
      save(state);
      return state.settings;
    case 'login_server':
      if (!args.username || !args.password) {
        throw new Error('Username and password are required.');
      }
      state.settings.username = args.username;
      state.settings.hasToken = true;
      save(state);
      return state.settings;
    case 'logout_server':
      state.settings.hasToken = false;
      save(state);
      return state.settings;
    case 'seed_demo_catalog':
      if (!state.catalog.length) state.catalog = seedCatalog();
      save(state);
      return state.catalog.length;
    case 'lookup_variant': {
      const q = String(args.query || '').trim();
      return (
        state.catalog.find((v) => v.barcode === q || v.sku.toLowerCase() === q.toLowerCase()) || null
      );
    }
    case 'search_catalog': {
      const q = String(args.query || '').trim().toLowerCase();
      if (!q) return state.catalog;
      return state.catalog.filter((v) =>
        [v.sku, v.barcode, v.productName, v.styleCode, v.size, v.color]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    case 'browse_products': {
      const byId = new Map();
      for (const variant of state.catalog) {
        const product = byId.get(variant.productId) || {
          id: variant.productId,
          name: variant.productName,
          styleCode: variant.styleCode,
          categoryName: variant.categoryName,
          variantCount: 0,
          totalStock: 0,
          isActive: true,
        };
        product.variantCount += 1;
        product.totalStock += Number(variant.quantityOnHand || 0);
        byId.set(variant.productId, product);
      }
      const q = String(args.query || '').trim().toLowerCase();
      const rows = [...byId.values()]
        .filter((product) => !q || [product.name, product.styleCode, product.categoryName].join(' ').toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
      const offset = Math.max(0, Number(args.offset) || 0);
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 50));
      return rows.slice(offset, offset + limit);
    }
    case 'browse_variants': {
      const q = String(args.query || '').trim().toLowerCase();
      const rows = state.catalog
        .filter((variant) => !q || [
          variant.sku, variant.barcode, variant.productName, variant.styleCode,
          variant.categoryName, variant.size, variant.color,
        ].join(' ').toLowerCase().includes(q))
        .sort((a, b) => a.productName.localeCompare(b.productName) || a.sku.localeCompare(b.sku));
      const offset = Math.max(0, Number(args.offset) || 0);
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 50));
      return rows.slice(offset, offset + limit);
    }
    case 'browse_categories': {
      const byName = new Map();
      for (const variant of state.catalog) {
        const name = variant.categoryName || 'Uncategorized';
        const category = byName.get(name) || {
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name,
          code: name.toUpperCase().replace(/[^A-Z0-9]+/g, ''),
          description: '',
          productCount: 0,
          isActive: true,
          products: new Set(),
        };
        category.products.add(variant.productId);
        category.productCount = category.products.size;
        byName.set(name, category);
      }
      const q = String(args.query || '').trim().toLowerCase();
      const rows = [...byName.values()]
        .filter((category) => !q || [category.name, category.code].join(' ').toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((category) => ({
          id: category.id,
          name: category.name,
          code: category.code,
          description: category.description,
          productCount: category.productCount,
          isActive: category.isActive,
        }));
      const offset = Math.max(0, Number(args.offset) || 0);
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 50));
      return rows.slice(offset, offset + limit);
    }
    case 'get_cart':
      return snapshot(state);
    case 'cart_add': {
      const variant = state.catalog.find((v) => v.id === args.variantId);
      if (!variant) throw new Error('SKU not found in local catalog.');
      const qty = args.quantity || 1;
      const existing = state.cart.find((l) => l.variantId === args.variantId);
      const next = (existing?.quantity || 0) + qty;
      if (next > variant.quantityOnHand) {
        throw new Error(
          `Out of stock: ${variant.sku} has ${variant.quantityOnHand} on hand, cart would need ${next}.`,
        );
      }
      if (existing) existing.quantity = next;
      else {
        state.cart.push({
          variantId: variant.id,
          productName: variant.productName,
          sku: variant.sku,
          quantity: qty,
          unitPrice: variant.price,
          discountAmount: '0.00',
        });
      }
      save(state);
      return snapshot(state);
    }
    case 'cart_update_qty': {
      const variant = state.catalog.find((v) => v.id === args.variantId);
      if (args.quantity <= 0) {
        state.cart = state.cart.filter((l) => l.variantId !== args.variantId);
      } else {
        if (variant && args.quantity > variant.quantityOnHand) {
          throw new Error(`Out of stock: only ${variant.quantityOnHand} units available for this SKU.`);
        }
        const line = state.cart.find((l) => l.variantId === args.variantId);
        if (!line) throw new Error('That line is not in the cart.');
        line.quantity = args.quantity;
      }
      save(state);
      return snapshot(state);
    }
    case 'cart_remove':
      state.cart = state.cart.filter((l) => l.variantId !== args.variantId);
      save(state);
      return snapshot(state);
    case 'cart_clear':
      state.cart = [];
      save(state);
      return snapshot(state);
    case 'checkout': {
      const cart = snapshot(state);
      if (!cart.items.length) throw new Error('Cart is empty. Scan or add a SKU before checkout.');
      const method = String(args.paymentMethod || 'CASH').toUpperCase();
      const total = Number(cart.totalAmount);
      const tendered = args.amountTendered ? Number(args.amountTendered) : total;
      if ((method === 'CASH' || method === 'MIXED') && tendered + 0.001 < total) {
        throw new Error(`Payment failed: tendered ${money(tendered)} is less than total ${cart.totalAmount}.`);
      }
      for (const line of cart.items) {
        const variant = state.catalog.find((v) => v.id === line.variantId);
        if (!variant || line.quantity > variant.quantityOnHand) {
          throw new Error(`Out of stock at checkout: ${line.sku}.`);
        }
        variant.quantityOnHand -= line.quantity;
      }
      const sale = {
        id: crypto.randomUUID(),
        receiptNumber: `POS-${Date.now()}`,
        soldAt: new Date().toISOString(),
        paymentMethod: method,
        status: 'COMPLETED',
        subtotal: cart.subtotal,
        discountAmount: '0.00',
        taxAmount: '0.00',
        totalAmount: cart.totalAmount,
        amountTendered: money(tendered),
        changeDue: money(Math.max(0, tendered - total)),
        cashierName: state.settings.cashierName,
        customerName: args.customerName || '',
        notes: args.notes || '',
        syncStatus: 'PENDING',
        itemCount: cart.itemCount,
        items: cart.items.map((line, idx) => ({
          id: idx + 1,
          saleId: '',
          variantId: line.variantId,
          sku: line.sku,
          productName: line.productName,
          size: line.size,
          color: line.color,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: '0.00',
          discountAmount: line.discountAmount,
          lineTotal: line.lineTotal,
        })),
      };
      state.sales.unshift(sale);
      state.cart = [];
      state.pending += 1;
      save(state);
      return sale;
    }
    case 'list_sales':
      return state.sales;
    case 'get_sale':
      return state.sales.find((s) => s.id === args.saleId);
    case 'get_sync_status':
      return {
        pendingEvents: state.pending,
        lastAppliedSeq: state.settings.lastAppliedSeq,
        lastError: null,
        lastSyncedAt: null,
        syncing: false,
      };
    case 'sync_now':
      state.pending = 0;
      state.sales = state.sales.map((s) => ({ ...s, syncStatus: 'SYNCED' }));
      save(state);
      return {
        pulled: 0,
        pushed: state.sales.length,
        catalogImported: 0,
        errors: ['Browser preview cannot reach ClothStock. Run `npm run tauri dev` to sync.'],
        lastAppliedSeq: 0,
      };
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
