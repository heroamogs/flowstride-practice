import fs from 'node:fs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { catalog, categories, deliveryOptions, seedAccounts, type Account } from './catalog.ts';
import { accountPage, adminPage, catalogPage, errorPage, loginPage } from './pages.ts';
import { bookingsPage, carPage } from './booking-pages.ts';
import { canApprove, createBookingStore } from './booking.ts';
import { InputError, field, readForm } from './request.ts';

const publicAssets = new Map([
  ['/styles.css', 'text/css; charset=utf-8'],
  ['/flowstride-logo.png', 'image/png'],
  ['/catalog-hero.jpg', 'image/jpeg'],
]);

function html(res: http.ServerResponse, body: string, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

function redirect(res: http.ServerResponse, location: string) {
  res.writeHead(303, { Location: location }).end();
}

const publicAccount = ({ id, name, email, role }: Account) => ({ id, name, email, role });

export async function startPracticeApp(port = 4355) {
  const bookings = createBookingStore();
  const accounts = seedAccounts();
  const sessions = new Map<string, string>();
  const interruptedRoleSaves = new Set<string>();
  let nextId = 1;
  let origin: string;
  let host: string;
  let cookieName: string;

  const cookie = (sid: string) => cookieName + '=' + sid + '; Path=/; HttpOnly; SameSite=Strict';
  const findEmail = (value: string) => [...accounts.values()].find(user => user.email === value.trim().toLowerCase());

  function createAccount(body: Record<string, unknown>) {
    const name = field(body, 'name').trim();
    const email = field(body, 'email').trim().toLowerCase();
    const password = field(body, 'password');
    if (!name || name.length > 80 || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        password.length < 8 || password.length > 128) {
      throw new InputError(400, 'Enter a name, an email address, and a password of 8 to 128 characters.');
    }
    if (findEmail(email)) throw new InputError(409, 'That email address is already in use.');
    const user: Account = { id: 'user-' + nextId++, name, email, password, role: 'member' };
    accounts.set(user.id, user);
    return user;
  }

  function changeRole(id: string, role: string, browserSubmission: boolean) {
    const user = accounts.get(id);
    if (!user) throw new InputError(404, 'The user could not be found.');
    if (user.role === 'admin' || (role !== 'member' && role !== 'approver')) {
      throw new InputError(400, 'Choose Member or Booking approver for a workspace user.');
    }
    // The handoff example uses a fresh marked address on its first attempt.
    if (browserSubmission && role === 'approver' && /^retry-approver-[0-9a-f]{16}@example\.test$/.test(user.email) &&
        !interruptedRoleSaves.has(id)) {
      interruptedRoleSaves.add(id);
      throw new InputError(503, 'The booking approver role could not be saved. Try again.');
    }
    user.role = role;
    return user;
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const site = req.headers['sec-fetch-site'];
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== origin) ||
        site === 'cross-site' || site === 'same-site') {
      return json(res, 403, { error: 'Use the local practice app address.' });
    }
    const url = new URL(req.url || '/', origin);
    if (url.origin !== origin) return json(res, 403, { error: 'Use the local practice app address.' });
    const route = url.pathname;
    const method = req.method;
    const sid = req.headers.cookie?.split(/;\s*/).find(c => c.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    const accountId = sid ? sessions.get(sid) : undefined;
    const account = accountId ? accounts.get(accountId) : undefined;
    const isApi = route.startsWith('/api/');
    const returnPath = url.searchParams.get('next') || '';
    const next = /^\/cars\/CAR-\d{3}$/.test(returnPath) ? returnPath : '';
    const adminRoute = route === '/admin' || route.startsWith('/admin/') || route.startsWith('/api/admin/');
    try {
      if (method === 'GET' && route === '/health') return json(res, 200, { status: 'ready' });
      const contentType = publicAssets.get(route);
      if (method === 'GET' && contentType) {
        const file = new URL('../public' + route, import.meta.url);
        const body = fs.readFileSync(file);
        return res.writeHead(200, { 'Content-Type': contentType }).end(body);
      }
      if (method === 'GET' && route === '/favicon.ico') return res.writeHead(204).end();
      if (method === 'GET' && (route === '/' || route === '/api/cars')) {
        const category = url.searchParams.get('category') || '';
        const search = (url.searchParams.get('q') || '').trim().slice(0, 80);
        const sort = url.searchParams.get('sort') || '';
        const query = search.toLowerCase();
        const cars = catalog.filter(car => (!category || car.category === category) &&
          (car.name.toLowerCase().includes(query) || car.sku.toLowerCase().includes(query)));
        if (sort === 'price-asc') cars.sort((a, b) => a.finalPriceCents - b.finalPriceCents);
        if (sort === 'price-desc') cars.sort((a, b) => b.finalPriceCents - a.finalPriceCents);
        if (isApi) return json(res, 200, { cars });
        return html(res, catalogPage(cars, categories.includes(category) ? category : '', account, search, sort));
      }
      const quote = /^\/api\/cars\/(CAR-\d{3})\/quote$/.exec(route);
      if (method === 'GET' && quote) {
        const car = catalog.find(item => item.sku === quote[1]);
        if (!car) throw new InputError(404, 'The requested car could not be found.');
        const delivery = url.searchParams.get('delivery') || '';
        if (!Object.hasOwn(deliveryOptions, delivery)) throw new InputError(400, 'Choose a delivery method.');
        const option = deliveryOptions[delivery as keyof typeof deliveryOptions];
        return json(res, 200, { sku: car.sku, method: delivery, ...option, totalCents: car.finalPriceCents + option.deliveryCents });
      }
      if (method === 'GET' && route === '/login') {
        return account ? redirect(res, next || '/account') : html(res, loginPage('', next));
      }
      if (method === 'POST' && (route === '/login' || route === '/api/session')) {
        const body = await readForm(req);
        const user = findEmail(field(body, 'email'));
        if (!user || user.password !== field(body, 'password')) {
          throw new InputError(401, 'Check your email and password.');
        }
        if (sid) sessions.delete(sid);
        const session = randomUUID();
        sessions.set(session, user.id);
        res.setHeader('Set-Cookie', cookie(session));
        if (isApi) return json(res, 200, publicAccount(user));
        return redirect(res, next || '/account');
      }
      if (method === 'POST' && route === '/logout') {
        if (sid) sessions.delete(sid);
        res.setHeader('Set-Cookie', cookie('') + '; Max-Age=0');
        return redirect(res, '/login');
      }
      if (method === 'GET' && (route === '/account' || route === '/api/account')) {
        if (!account) return isApi ? json(res, 401, { error: 'Sign in first.' }) : redirect(res, '/login');
        return isApi ? json(res, 200, publicAccount(account)) : html(res, accountPage(account));
      }

      const carDetail = /^\/cars\/(CAR-\d{3})$/.exec(route);
      if (method === 'GET' && carDetail) {
        const car = catalog.find(item => item.sku === carDetail[1]);
        if (!car) throw new InputError(404, 'That car could not be found.');
        return html(res, carPage(car, account));
      }

      const bookingAction = /^\/(?:api\/)?bookings\/(BK-\d+)\/(approve|cancel)$/.exec(route);
      const bookingDetail = /^\/api\/bookings\/(BK-\d+)$/.exec(route);
      const bookingRoute = route === '/bookings' || route === '/bookings/review' || route === '/api/bookings' ||
        route === '/api/bookings/review' || bookingAction || bookingDetail;
      if (bookingRoute) {
        if (!account) return isApi ? json(res, 401, { error: 'Sign in first.' }) : redirect(res, '/login');
        const review = route.endsWith('/review');
        if (method === 'GET' && bookingDetail) return json(res, 200, bookings.findOwned(account, bookingDetail[1]!));
        if (method === 'GET' && !bookingAction) {
          if (review && !canApprove(account)) throw new InputError(403, 'Booking approval requires an approver or administrator.');
          const records = review ? bookings.all() : bookings.forAccount(account);
          return isApi ? json(res, 200, { bookings: records }) : html(res, bookingsPage(records, account, review));
        }
        if (method === 'POST' && !bookingAction && !bookingDetail && !review) {
          const body = await readForm(req);
          try {
            const booking = bookings.create(account, body);
            return isApi ? json(res, 201, booking) : redirect(res, '/bookings#' + booking.id);
          } catch (error) {
            const car = catalog.find(item => item.sku === field(body, 'sku'));
            if (isApi || !car || !(error instanceof InputError)) throw error;
            return html(res, carPage(car, account, error.message,
              Object.fromEntries(['pickupDate', 'returnDate', 'payment'].map(key => [key, field(body, key)]))), error.status);
          }
        }
        if (method === 'POST' && bookingAction) {
          const action = bookingAction[2] === 'approve' ? 'approve' : 'cancel';
          const booking = bookings.update(account, bookingAction[1]!, action);
          return isApi ? json(res, 200, booking) : redirect(res, action === 'approve' ? '/bookings/review' : '/bookings');
        }
      }

      if (adminRoute) {
        if (!account) return isApi ? json(res, 401, { error: 'Sign in first.' }) : redirect(res, '/login');
        if (account.role !== 'admin') throw new InputError(403, 'An administrator account is required.');
        if (method === 'GET' && route === '/admin') return html(res, adminPage([...accounts.values()], account));
        if (route === '/api/admin/users' && method === 'GET') return json(res, 200, { users: [...accounts.values()].map(publicAccount) });
        if ((route === '/admin/users' || route === '/api/admin/users') && method === 'POST') {
          const created = createAccount(await readForm(req));
          return isApi ? json(res, 201, publicAccount(created)) : redirect(res, '/admin');
        }
        const role = /^\/(?:api\/)?admin\/users\/([a-z0-9-]+)\/role$/.exec(route);
        if (role && method === (isApi ? 'PATCH' : 'POST')) {
          const updated = changeRole(role[1]!, field(await readForm(req), 'role'), !isApi);
          return isApi ? json(res, 200, publicAccount(updated)) : redirect(res, '/admin');
        }
        const member = /^\/api\/admin\/users\/([a-z0-9-]+)$/.exec(route);
        if (member && method === 'DELETE') {
          const user = accounts.get(member[1]!);
          if (user?.role === 'admin') throw new InputError(400, 'The practice administrator cannot be removed.');
          if (!user) throw new InputError(404, 'The user could not be found.');
          accounts.delete(user.id);
          bookings.removeAccount(user.id);
          interruptedRoleSaves.delete(user.id);
          for (const [session, id] of sessions) if (id === user.id) sessions.delete(session);
          return res.writeHead(204).end();
        }
      }
      throw new InputError(404, 'Page not found.');
    } catch (error) {
      const invalidJson = error instanceof SyntaxError;
      const status = error instanceof InputError ? error.status : invalidJson ? 400 : 500;
      const message = error instanceof InputError ? error.message : invalidJson ? 'Invalid JSON.' : 'The practice app could not complete the request.';
      if (!isApi && route === '/login') return html(res, loginPage(message, next), status);
      if (!isApi && account?.role === 'admin' && adminRoute) {
        return html(res, adminPage([...accounts.values()], account, message), status);
      }
      return isApi ? json(res, status, { error: message }) : html(res, errorPage(message, account), status);
    }
  }

  const server = http.createServer({ requestTimeout: 10000 }, (req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) json(res, 400, { error: 'Invalid request.' });
      else res.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a local practice app port.'));
        return;
      }
      server.off('error', reject);
      host = '127.0.0.1:' + address.port;
      origin = 'http://' + host;
      cookieName = 'flowstride_practice_' + address.port;
      resolve();
    });
  });

  let closing: Promise<void> | undefined;
  return {
    origin: origin!,
    close() {
      return closing ??= new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}
