import { setTimeout as delay } from 'node:timers/promises';
import type { Page } from 'playwright';

interface Car {
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  discountPercent: number;
  finalPriceCents: number;
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function expectedDiscount(car: Car) {
  const sequence = Number(car.sku.slice(4));
  if (!/^CAR-\d{3}$/.test(car.sku) || sequence < 1 || sequence > 50) throw new Error('Unexpected API SKU ' + car.sku);
  return (sequence - 1) % 5 === 0 ? 10 : car.category === 'Electric' ? 5 : 0;
}

export async function checkCatalogPrices(page: Page, cars: Car[]) {
  if (!Array.isArray(cars) || cars.length !== 50) throw new Error('Expected 50 cars from the catalog API.');
  const bySku = new Map<string, Car>();
  for (const car of cars) {
    if (bySku.has(car.sku)) throw new Error('Duplicate API SKU ' + car.sku);
    bySku.set(car.sku, car);
  }

  const cards = await page.getByRole('list', { name: 'Cars' }).getByRole('listitem').evaluateAll(items =>
    items.map(item => ({
      sku: item.getAttribute('data-sku'),
      name: item.querySelector('h2')?.textContent?.trim(),
      price: item.querySelector('.price span')?.textContent?.trim(),
      priceCents: item.getAttribute('data-price-cents'),
    })),
  );
  const seen = new Set<string>();
  for (const card of cards) {
    if (!card.sku) throw new Error('A displayed car has no SKU.');
    if (seen.has(card.sku)) throw new Error('Duplicate catalog card ' + card.sku);
    const car = bySku.get(card.sku);
    if (!car) throw new Error('Catalog card has no API record for ' + card.sku);

    const discount = expectedDiscount(car);
    if (!Number.isSafeInteger(car.priceCents) || car.priceCents <= 0) throw new Error('Invalid base price for ' + car.sku);
    const finalPrice = Math.round(car.priceCents * (100 - discount) / 100);
    if (car.discountPercent !== discount || car.finalPriceCents !== finalPrice) throw new Error('API discount mismatch for ' + car.sku);
    if (card.priceCents !== String(finalPrice) || card.price !== dollars.format(finalPrice / 100)) {
      throw new Error('Displayed price mismatch for ' + car.sku + '. Expected ' + dollars.format(finalPrice / 100) + '.');
    }
    if (card.name !== car.name) throw new Error('Displayed name mismatch for ' + car.sku);
    seen.add(card.sku);
  }

  const missing = [...bySku.keys()].filter(sku => !seen.has(sku));
  if (missing.length) throw new Error('Missing catalog cards ' + missing.join(', '));
  return seen.size;
}

interface Quote {
  sku: string;
  method: string;
  nextStep: string;
  deliveryCents: number;
  totalCents: number;
}

const retryable = new Set([429, 502, 503, 504]);
export async function requestQuote(
  url: URL,
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void> = async (ms, signal) => { await delay(ms, undefined, { signal }); },
): Promise<Quote> {
  const signal = AbortSignal.timeout(5000);
  const backoff = [50, 100];
  for (let retry = 0; ; retry++) {
    const response = await fetch(url, { signal, redirect: 'error' });
    if (response.ok) return await response.json() as Quote;
    await response.body?.cancel();

    const milliseconds = backoff[retry];
    if (milliseconds === undefined || !retryable.has(response.status)) {
      throw new Error('Delivery quote returned HTTP ' + response.status + '.');
    }
    await wait(milliseconds, signal);
  }
}

const expectedDelivery = [
  { method: 'pickup', deliveryCents: 0, nextStep: 'collect' },
  { method: 'local', deliveryCents: 12500, nextStep: 'confirm-address' },
  { method: 'regional', deliveryCents: 45000, nextStep: 'track-shipment' },
  { method: 'freight', deliveryCents: 85000, nextStep: 'book-carrier' },
];

export async function checkDeliveryQuotes(page: Page, cars: Car[]) {
  const car = cars.find(item => item.sku === 'CAR-001');
  if (!car) throw new Error('The catalog has no CAR-001 for delivery quotes.');
  for (const expected of expectedDelivery) {
    const url = new URL('/api/cars/' + encodeURIComponent(car.sku) + '/quote', page.url());
    url.searchParams.set('delivery', expected.method);
    const quote = await requestQuote(url);
    const total = car.finalPriceCents + expected.deliveryCents;
    if (quote.sku !== car.sku || quote.method !== expected.method || quote.nextStep !== expected.nextStep ||
        quote.deliveryCents !== expected.deliveryCents || quote.totalCents !== total) {
      throw new Error('Unexpected ' + expected.method + ' quote for ' + car.sku);
    }
  }
  return expectedDelivery.length;
}
