import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../../frontend/index.html', import.meta.url), 'utf8');
const store = await readFile(new URL('../../frontend/store.html', import.meta.url), 'utf8');
const admin = await readFile(new URL('../../frontend/admin.html', import.meta.url), 'utf8');
const requiredHome = ['المتجر العالمي سوريا', 'province-filter', 'shipping-filter', 'legal-consent', 'الحساب', 'الدردشة', 'promotion-form', '1 دولار', '10 دولارات', 'value="manual" checked', 'value="shamcash" disabled', 'value="icash" disabled'];
const requiredStore = ['product-code', 'product-price', 'product-quantity', 'shipping-policy', 'localStorage'];
const requiredAdmin = ['طلبات الإعلان المروّج', '1 دولار', '10 دولارات', 'الدفع يدوي'];
for (const marker of requiredHome) if (!home.includes(marker)) throw new Error(`Missing home marker: ${marker}`);
for (const marker of requiredStore) if (!store.includes(marker)) throw new Error(`Missing store marker: ${marker}`);
for (const marker of requiredAdmin) if (!admin.includes(marker)) throw new Error(`Missing admin marker: ${marker}`);
console.log('smoke test passed: buyer, filters, consent, store draft, promotion pricing, manual payment, and deferred providers present');
