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

test('the sample dashboard reflects approvals and shows user management only to admins', async t => {
  const app = await startPracticeApp(0, { demo: true });
  t.after(() => app.close());
  const { origin } = app;
  const [owner, staff, approver] = await Promise.all([
    driver(origin), admin(origin), signIn(origin, 'approver@example.test', 'practice-approver'),
  ]);
  const readPage = async (path: string, cookie: string) => (await send(origin, path, 'GET', undefined, cookie)).text();
  const overview = await readPage('/account', owner);
  assert.match(overview, /Next booking/);
  assert.match(overview, /Booking history/);
  assert.match(overview, /id="upcoming-count">2</);
  const past = overview.match(/<tr class="booking" id="BK-0003"[\s\S]*?<\/tr>/)?.[0];
  assert(past);
  assert.match(past, /View receipt/);
  assert.doesNotMatch(past, /Cancel booking/);
  assert.equal((await send(origin, '/api/bookings/BK-0003/cancel', 'POST', undefined, owner)).status, 409);
  assert.doesNotMatch(overview, /class="dashboard-panel-heading"><h2>Team access/);
  const approved = await readPage('/bookings?status=approved', owner);
  assert.match(approved, /data-status="approved"/);
  assert.doesNotMatch(approved, /data-status="pending"/);
  const staffPage = await readPage('/account', staff);
  assert.match(staffPage, /Operations dashboard/);
  assert.match(staffPage, /id="pending-count">3</);
  assert.match(staffPage, /id="users-count">5</);
  assert.match(staffPage, /Maya Chen/);
  assert.match(staffPage, /Team access/);
  const approverPage = await readPage('/account', approver);
  assert.match(approverPage, /Approver dashboard/);
  assert.match(approverPage, /Can approve bookings/);
  assert.doesNotMatch(approverPage, /Manage users|Team access/);
  assert.equal((await send(origin, '/admin', 'GET', undefined, approver)).status, 403);
  const approval = await send(origin, '/bookings/BK-0002/approve?from=overview', 'POST', undefined, approver);
  assert.equal(approval.status, 303);
  assert.equal(approval.headers.get('location'), '/account');
  assert.match(await readPage('/account', staff), /id="pending-count">2</);
  assert.match(await readPage('/account', owner), /id="pending-count">0</);
});

test('only the owner can open an approved receipt and the simulated failure is consumed exactly once', async t => {
  const { origin } = await openApp(t);
  const [owner, staff] = await Promise.all([driver(origin), admin(origin)]);
  const made = await send(origin, '/api/bookings', 'POST', { ...sample, receiptLesson: 'retry-once' }, owner);
  assert.equal(made.status, 201);
  const { id } = await made.json();
  const detail = '/bookings/' + id;
  const receipt = detail + '/receipt';
  const canRead = async (path: string, cookie: string) => send(origin, path, 'GET', undefined, cookie);
  assert.equal((await send(origin, receipt, 'GET')).status, 303);
  assert.equal((await canRead(receipt, owner)).status, 409);
  assert.equal((await canRead(receipt + '/download', owner)).status, 409);
  await send(origin, '/api/bookings/' + id + '/approve', 'POST', undefined, staff);
  assert.equal((await canRead(detail, staff)).status, 200);
  assert.equal((await canRead(receipt, staff)).status, 404);
  assert.equal((await canRead(receipt + '/download', staff)).status, 404);
  const first = await canRead(receipt, owner);
  assert.equal(first.status, 503);
  assert.match(await first.text(), /Receipt temporarily unavailable/);
  const second = await canRead(receipt, owner);
  assert.equal(second.status, 200);
  assert.match(await second.text(), new RegExp('id="receipt-id">' + id + '<'));
  assert.equal((await canRead(receipt, owner)).status, 200);
  const download = await canRead(receipt + '/download', owner);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="receipt-' + id + '.json"');
  assert.deepEqual(await download.json(), {
    bookingId: id, sku: sample.sku, pickupDate: sample.pickupDate, returnDate: sample.returnDate,
    days: 3, totalCents: 32400, currency: 'USD',
  });
  assert.deepEqual((await (await canRead('/api/bookings', owner)).json()).bookings.map((booking: { id: string }) => booking.id), [id]);
  await send(origin, '/api/bookings/' + id + '/cancel', 'POST', undefined, owner);
  assert.equal((await canRead(receipt + '/download', owner)).status, 409);
});

const signupDetails = {
  name: 'New Practice Driver',
  email: 'new-driver@example.test',
  password: 'practice-only-signup',
};

async function startSignup(origin: string, details = signupDetails, previousCookie?: string) {
  const response = await send(origin, '/signup', 'POST', details, previousCookie);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/verify-email');
  const cookie = response.headers.get('set-cookie');
  assert(cookie);
  assert.match(cookie, /^flowstride_signup_\d+=.+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=600$/);
  return cookie.split(';')[0]!;
}

async function inboxCode(origin: string, cookie: string) {
  const response = await send(origin, '/practice-inbox', 'GET', undefined, cookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const code = (await response.text()).match(/id="verification-code">(\d{6})</)?.[1];
  assert(code);
  return code;
}

test('local signup verifies a private inbox code before a Member can sign in and book', async t => {
  const { origin } = await openApp(t);
  const fields = { ...signupDetails, role: 'admin' };
  const signupCookie = await startSignup(origin, fields);
  const code = await inboxCode(origin, signupCookie);
  const anonymousInbox = await send(origin, '/practice-inbox?email=' + fields.email, 'GET');
  assert.equal(anonymousInbox.status, 303);
  assert.equal(anonymousInbox.headers.get('location'), '/signup');
  assert.equal(await anonymousInbox.text(), '');
  assert.equal((await send(origin, '/verify-email', 'POST', { code })).status, 400);
  assert.equal((await send(origin, '/api/session', 'POST', fields)).status, 401);
  const invalid = await send(origin, '/verify-email', 'POST', { code: '000000' }, signupCookie);
  assert.equal(invalid.status, 400);
  assert.match(await invalid.text(), /That code did not match/);
  const verified = await send(origin, '/verify-email', 'POST', { code }, signupCookie);
  assert.equal(verified.status, 303);
  assert.equal(verified.headers.get('location'), '/login?registered=1');
  assert.match(verified.headers.get('set-cookie') || '', /Max-Age=0$/);
  assert.equal((await send(origin, '/api/account', 'GET', undefined, signupCookie)).status, 401);
  assert.equal((await send(origin, '/verify-email', 'POST', { code }, signupCookie)).status, 400);
  const login = await send(origin, '/login?registered=1', 'GET');
  assert.match(await login.text(), /Account verified\. Sign in to continue\./);

  const member = await signIn(origin, fields.email, fields.password);
  const session = await (await send(origin, '/api/account', 'GET', undefined, member)).json();
  assert.equal(session.role, 'member');
  assert.equal(session.email, fields.email);
  assert(!Object.hasOwn(session, 'password'));
  assert.equal((await send(origin, '/api/admin/users', 'GET', undefined, member)).status, 403);
  const booking = await send(origin, '/api/bookings', 'POST', sample, member);
  assert.equal(booking.status, 201);
  assert.equal((await booking.json()).status, 'pending');
  const bookings = await send(origin, '/bookings', 'GET', undefined, member);
  assert.match(await bookings.text(), />Awaiting approval</);
});

test('signup validates practice credentials and keeps duplicate email confirmation race-safe', async t => {
  const { origin } = await openApp(t);
  const invalid = [
    [{ ...signupDetails, name: '  ' }, 400],
    [{ ...signupDetails, email: 'not-an-email.test' }, 400],
    [{ ...signupDetails, email: 'user@example.com' }, 400],
    [{ ...signupDetails, password: 'short' }, 400],
    [{ ...signupDetails, email: 'DRIVER@EXAMPLE.TEST' }, 409],
  ] as const;
  for (const [details, status] of invalid) {
    const rejected = await send(origin, '/signup', 'POST', details);
    assert.equal(rejected.status, status);
    assert.equal(rejected.headers.get('set-cookie'), null);
    assert(!((await rejected.text()).includes(details.password)));
  }
  const cookies = await Promise.all([
    startSignup(origin), startSignup(origin, { ...signupDetails, email: signupDetails.email.toUpperCase() }),
  ]);
  const codes = await Promise.all(cookies.map(cookie => inboxCode(origin, cookie)));
  const results = await Promise.all(cookies.map((cookie, index) =>
    send(origin, '/verify-email', 'POST', { code: codes[index] }, cookie)));
  assert.deepEqual(results.map(result => result.status).sort(), [303, 409]);
  const cookie = await admin(origin);
  const { users } = await (await send(origin, '/api/admin/users', 'GET', undefined, cookie)).json();
  assert.equal(users.filter((user: { email: string }) => user.email === signupDetails.email).length, 1);
});

test('verification codes expire after ten minutes and repeated wrong codes require a fresh signup', async t => {
  t.mock.timers.enable({ apis: ['Date'] });
  const { origin } = await openApp(t);
  const expiredCookie = await startSignup(origin);
  const expiredCode = await inboxCode(origin, expiredCookie);
  t.mock.timers.tick(600_000);
  assert.equal((await send(origin, '/practice-inbox', 'GET', undefined, expiredCookie)).status, 303);
  assert.equal((await send(origin, '/verify-email', 'POST', { code: expiredCode }, expiredCookie)).status, 400);

  const signupCookie = await startSignup(origin);
  const code = await inboxCode(origin, signupCookie);
  for (let i = 0; i < 4; i++) {
    assert.equal((await send(origin, '/verify-email', 'POST', { code: '000000' }, signupCookie)).status, 400);
  }
  const finalAttempt = await send(origin, '/verify-email', 'POST', { code: '000000' }, signupCookie);
  assert.match(await finalAttempt.text(), /Too many incorrect codes/);
  assert.equal((await send(origin, '/verify-email', 'POST', { code }, signupCookie)).status, 400);
  const fresh = await startSignup(origin, signupDetails, signupCookie);
  const freshCode = await inboxCode(origin, fresh);
  const success = await send(origin, '/verify-email', 'POST', { code: freshCode }, fresh);
  assert.equal(success.status, 303);
});
