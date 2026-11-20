import { randomBytes } from 'node:crypto';
import type { FixtureContext } from 'flowstride';

function practiceOrigin(baseUrl?: string) {
  const origin = new URL(baseUrl || 'about:blank');
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port) {
    throw new Error('Run this lesson against the local practice app.');
  }
  return origin;
}

const administrator = { email: 'admin@example.test', password: 'practice-admin' };

async function withAccount<T>(
  origin: URL, signal: AbortSignal, account: { email: string; password: string },
  action: (headers: { Cookie: string }) => Promise<T>,
) {
  const session = await fetch(new URL('/api/session', origin), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, redirect: 'error',
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const cookie = session.headers.get('set-cookie')?.split(';', 1)[0];
  if (!session.ok || !cookie) throw new Error('Could not open the practice API session.');
  const headers = { Cookie: cookie };
  try {
    return await action(headers);
  } finally {
    const logout = await fetch(new URL('/logout', origin), { method: 'POST', headers, signal, redirect: 'manual' });
    if (logout.status !== 303) throw new Error('Could not close the practice API session.');
  }
}

function disposableUser(context: FixtureContext, name: string, prefix: string, handoff?: string) {
  const origin = practiceOrigin(context.baseURL);
  const suffix = randomBytes(8).toString('hex');
  const email = prefix + suffix + '@example.test';

  // Register cleanup before the lesson creates anything. Deleting the user also releases their bookings.
  context.defer(signal => withAccount(origin, signal, administrator, async headers => {
    const list = await fetch(new URL('/api/admin/users', origin), { headers, signal, redirect: 'error' });
    if (!list.ok) throw new Error('Could not locate the practice user for cleanup.');
    const { users } = await list.json() as { users: { id: string; email: string }[] };
    const user = users.find(item => item.email === email);
    if (user) {
      const url = new URL('/api/admin/users/' + encodeURIComponent(user.id), origin);
      const deleted = await fetch(url, { method: 'DELETE', headers, signal, redirect: 'error' });
      if (!deleted.ok && deleted.status !== 404) throw new Error('Could not remove the practice user.');
    }
  }), handoff ? { handoff } : undefined);

  return { name: name + ' ' + suffix, email, password: 'practice-private-' + randomBytes(12).toString('hex') };
}

export function preparePracticeUser(context: FixtureContext, handoff?: string) {
  const prefix = handoff && context.attempt === 1 ? 'retry-approver-' : 'approver-';
  return disposableUser(context, 'Practice Approver', prefix, handoff);
}

export function prepareSignupDriver(context: FixtureContext) {
  return disposableUser(context, 'Signup Driver', 'signup-driver-');
}

export async function createPracticeDriver(context: FixtureContext) {
  const user = disposableUser(context, 'Lesson Driver', 'lesson-driver-');
  const origin = practiceOrigin(context.baseURL);
  await withAccount(origin, context.signal, administrator, async headers => {
    const response = await fetch(new URL('/api/admin/users', origin), {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      signal: context.signal, redirect: 'error', body: JSON.stringify(user),
    });
    if (response.status !== 201) throw new Error('Could not create the lesson driver.');
  });
  return user;
}

export async function createReceiptRetryBooking(context: FixtureContext) {
  // Worker scope keeps this booking and its one-shot failure across scenario attempts.
  const driver = await createPracticeDriver(context);
  const origin = practiceOrigin(context.baseURL);
  const request = {
    sku: 'CAR-003', pickupDate: '2030-09-12', returnDate: '2030-09-15', payment: 'success', receiptLesson: 'retry-once',
  };
  const { id } = await withAccount(origin, context.signal, driver, async headers => {
    const response = await fetch(new URL('/api/bookings', origin), {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      signal: context.signal, redirect: 'error', body: JSON.stringify(request),
    });
    if (response.status !== 201) throw new Error('Could not create the receipt lesson booking.');
    return await response.json() as { id: string };
  });
  await withAccount(origin, context.signal, administrator, async headers => {
    const response = await fetch(new URL('/api/bookings/' + id + '/approve', origin), {
      method: 'POST', headers, signal: context.signal, redirect: 'error',
    });
    if (!response.ok) throw new Error('Could not approve the receipt lesson booking.');
  });
  return { ...driver, bookingId: id };
}
