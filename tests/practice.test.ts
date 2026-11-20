import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { startPracticeApp } from '../app/server.ts';

async function openApp(t: TestContext) {
  const app = await startPracticeApp(0);
  t.after(() => app.close());
  return app;
}

async function send(origin: string, path: string, method: string, body?: object, cookie?: string) {
  return fetch(origin + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
}

async function signIn(origin: string, email: string, password: string) {
  const response = await send(origin, '/api/session', 'POST', { email, password });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert(cookie);
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  return cookie.split(';')[0]!;
}

const driver = (origin: string) => signIn(origin, 'driver@example.test', 'practice-driver');
const admin = (origin: string) => signIn(origin, 'admin@example.test', 'practice-admin');
const sample = { sku: 'CAR-001', pickupDate: '2030-06-12', returnDate: '2030-06-15', payment: 'success' };

test('seeded catalog, category, search, sorting, pricing and static assets work', async t => {
  const { origin } = await openApp(t);
  const health = await fetch(origin + '/health');
  assert.deepEqual(await health.json(), { status: 'ready' });
  const { cars } = await (await fetch(origin + '/api/cars')).json();
  assert.equal(cars.length, 50);
  assert.equal(new Set(cars.map((car: { sku: string }) => car.sku)).size, 50);
  const { cars: results } = await (await fetch(origin + '/api/cars?category=Hatchback&sort=price-asc')).json();
  assert.equal(results.length, 10);
  assert.equal(results[0].finalPriceCents, 1080000);
  assert(results.every((car: { finalPriceCents: number }, i: number) => !i || results[i - 1].finalPriceCents <= car.finalPriceCents));
  const { cars: found } = await (await fetch(origin + '/api/cars?q=car-001')).json();
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'Kite 001');
  const quote = await (await fetch(origin + '/api/cars/CAR-001/quote?delivery=local')).json();
  assert.equal(quote.totalCents, 1092500);
  assert.match(await (await fetch(origin + '/?q=unknown')).text(), /No matching cars/);
  assert.match((await fetch(origin + '/catalog-hero.jpg')).headers.get('content-type') || '', /image\/jpeg/);
  assert.equal((await fetch(origin + '/api/cars', { headers: { Origin: 'https://example.test' } })).status, 403);
});

test('a declined payment, invalid dates and unauthenticated requests leave the store empty', async t => {
  const { origin } = await openApp(t);
  assert.equal((await send(origin, '/api/bookings', 'POST', sample)).status, 401);
  const cookie = await driver(origin);
  assert.equal((await send(origin, '/api/bookings', 'POST', { ...sample, payment: 'declined' }, cookie)).status, 402);
  assert.equal((await send(origin, '/api/bookings', 'POST', { ...sample, pickupDate: '2030-02-30' }, cookie)).status, 400);
  assert.equal((await send(origin, '/api/bookings', 'POST', { ...sample, returnDate: '2030-07-30' }, cookie)).status, 400);
  assert.deepEqual(await (await send(origin, '/api/bookings', 'GET', undefined, cookie)).json(), { bookings: [] });
});

test('overlapping bookings are rejected and cancellation releases the dates', async t => {
  const { origin } = await openApp(t);
  const cookie = await driver(origin);
  const pair = await Promise.all([send(origin, '/api/bookings', 'POST', sample, cookie), send(origin, '/api/bookings', 'POST', sample, cookie)]);
  assert.deepEqual(pair.map(response => response.status).sort(), [201, 409]);
  const accepted = await pair.find(response => response.status === 201)!.json();
  assert.equal(accepted.totalCents, 32400);
  assert.equal(accepted.days, 3);
  const cancel = await send(origin, '/api/bookings/' + accepted.id + '/cancel', 'POST', undefined, cookie);
  assert.equal((await cancel.json()).status, 'cancelled');
  assert.equal((await send(origin, '/api/bookings', 'POST', sample, cookie)).status, 201);
});

test('booking approvers can approve records while only owners can read and cancel their bookings', async t => {
  const { origin } = await openApp(t);
  const customer = await driver(origin);
  const administrator = await admin(origin);
  const response = await send(origin, '/api/admin/users', 'POST', {
    name: 'Sample Approver', email: 'approver@example.test', password: 'practice-approver',
  }, administrator);
  assert.equal(response.status, 201);
  const user = await response.json();
  assert.equal(user.role, 'member');
  assert(!Object.hasOwn(user, 'password'));
  const approver = await signIn(origin, user.email, 'practice-approver');
  const saved = await (await send(origin, '/api/bookings', 'POST', sample, customer)).json();
  const bookingUrl = '/api/bookings/' + saved.id;
  assert.equal((await send(origin, bookingUrl + '/approve', 'POST', undefined, approver)).status, 403);
  assert.equal((await send(origin, '/api/bookings/review', 'GET', undefined, approver)).status, 403);
  const role = await send(origin, '/api/admin/users/' + user.id + '/role', 'PATCH', { role: 'approver' }, administrator);
  assert.equal((await role.json()).role, 'approver');
  assert.equal((await send(origin, '/api/bookings/review', 'GET', undefined, approver)).status, 200);
  assert.equal((await send(origin, bookingUrl, 'GET', undefined, approver)).status, 404);
  assert.equal((await send(origin, bookingUrl + '/cancel', 'POST', undefined, approver)).status, 404);
  for (let attempt = 0; attempt < 2; attempt++) {
    const approve = await send(origin, bookingUrl + '/approve', 'POST', undefined, approver);
    assert.equal((await approve.json()).status, 'approved');
  }
  const own = await send(origin, bookingUrl, 'GET', undefined, customer);
  assert.equal((await own.json()).status, 'approved');
});

test('created accounts, sessions and bookings are isolated across app instances', async t => {
  const first = await openApp(t);
  const adminCookie = await admin(first.origin);
  const owner = await driver(first.origin);
  const user = await (await send(first.origin, '/api/admin/users', 'POST', {
    name: 'Temporary Driver', email: 'temp@example.test', password: 'practice-temporary',
  }, adminCookie)).json();
  assert.equal(user.id, 'user-1');
  assert.equal((await send(first.origin, '/api/bookings', 'POST', sample, owner)).status, 201);
  const second = await openApp(t);
  assert.notEqual(first.origin, second.origin);
  assert.equal((await send(second.origin, '/api/account', 'GET', undefined, owner)).status, 401);
  const fresh = await driver(second.origin);
  assert.deepEqual(await (await send(second.origin, '/api/bookings', 'GET', undefined, fresh)).json(), { bookings: [] });
  assert.equal((await send(second.origin, '/api/session', 'POST', { email: user.email, password: 'practice-temporary' })).status, 401);
});

test('sign-in returns to a selected car and validates the return location', async t => {
  const { origin } = await openApp(t);
  const names = { email: 'driver@example.test', password: 'practice-driver' };
  for (const [next, expected] of [['/cars/CAR-001', '/cars/CAR-001'], ['//example.test', '/account']]) {
    const response = await send(origin, '/login?next=' + encodeURIComponent(next!), 'POST', names);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), expected);
  }
});
