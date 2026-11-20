import { catalog, type Account, type Car } from './catalog.ts';
import { InputError, field } from './request.ts';

export const bookingStatuses = ['pending', 'approved', 'cancelled'] as const;
export type BookingStatus = typeof bookingStatuses[number];

export interface Booking {
  id: string;
  accountId: string;
  car: Car;
  pickupDate: string;
  returnDate: string;
  days: number;
  totalCents: number;
  status: BookingStatus;
}

export const dailyRateCents = (car: Car) => Math.round(car.finalPriceCents / 10000) * 100;
export const today = () => new Date().toISOString().slice(0, 10);
export const canCancel = (booking: Booking) => booking.status !== 'cancelled' && booking.pickupDate >= today();
export const canApprove = (account: Account) => account.role === 'admin' || account.role === 'approver';

function parseDate(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return NaN;
  const time = Date.parse(input + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === input ? time : NaN;
}

export function createBookingStore() {
  const bookings = new Map<string, Booking>();
  const receiptFailures = new WeakSet<Booking>();
  let nextId = 1;

  function find(id: string, account?: Account) {
    const booking = bookings.get(id);
    if (!booking || (account && booking.accountId !== account.id)) {
      throw new InputError(404, 'That booking could not be found.');
    }
    return booking;
  }

  return {
    forAccount(account: Account) {
      return [...bookings.values()].filter(booking => booking.accountId === account.id);
    },
    all() {
      return [...bookings.values()];
    },
    findOwned(account: Account, id: string) {
      return find(id, account);
    },
    findVisible(account: Account, id: string) {
      return find(id, canApprove(account) ? undefined : account);
    },
    receipt(account: Account, id: string, openPreview: boolean) {
      const booking = find(id, account);
      if (booking.status !== 'approved') throw new InputError(409, 'A receipt is available after booking approval.');
      if (openPreview && receiptFailures.delete(booking)) {
        throw new InputError(503, 'Receipt temporarily unavailable. Open the receipt again to retry.');
      }
      return booking;
    },
    create(account: Account, body: Record<string, unknown>) {
      const car = catalog.find(item => item.sku === field(body, 'sku'));
      if (!car) throw new InputError(404, 'Choose a car from the catalog.');
      const pickupDate = field(body, 'pickupDate');
      const returnDate = field(body, 'returnDate');
      const days = (parseDate(returnDate) - parseDate(pickupDate)) / 86_400_000;
      if (!Number.isInteger(days) || days < 1 || days > 30) {
        throw new InputError(400, 'Choose valid dates for a rental of 1 to 30 days.');
      }
      const payment = field(body, 'payment');
      if (!['success', 'declined'].includes(payment)) {
        throw new InputError(400, 'Choose a simulated payment outcome.');
      }
      const overlaps = [...bookings.values()].some(existing => existing.car.sku === car.sku &&
        existing.status !== 'cancelled' && pickupDate < existing.returnDate && existing.pickupDate < returnDate);
      if (overlaps) throw new InputError(409, 'This car is already booked for those dates.');
      if (payment === 'declined') throw new InputError(402, 'Simulated payment declined. Choose a different test result and try again.');
      const booking: Booking = {
        id: 'BK-' + String(nextId++).padStart(4, '0'), accountId: account.id, car, pickupDate, returnDate,
        days, totalCents: days * dailyRateCents(car), status: 'pending',
      };
      bookings.set(booking.id, booking);
      if (body.receiptLesson === 'retry-once') receiptFailures.add(booking);
      return booking;
    },
    update(account: Account, id: string, action: 'approve' | 'cancel') {
      const booking = find(id, action === 'cancel' ? account : undefined);
      if (action === 'approve' && !canApprove(account)) throw new InputError(403, 'Booking approval requires an approver or administrator.');
      if (action === 'approve' && booking.status === 'cancelled') throw new InputError(409, 'A cancelled booking cannot be approved.');
      if (booking.status === 'cancelled' || (action === 'approve' && booking.status === 'approved')) return booking;
      if (action === 'cancel' && !canCancel(booking)) throw new InputError(409, 'This booking is past its pickup date.');
      booking.status = action === 'approve' ? 'approved' : 'cancelled';
      return booking;
    },
    removeAccount(id: string) {
      for (const booking of bookings.values()) {
        if (booking.accountId === id) bookings.delete(booking.id);
      }
    },
  };
}

export function seedDemoBookings(bookings: ReturnType<typeof createBookingStore>, accounts: Map<string, Account>) {
  const today = new Date();
  const day = (offset: number) =>
    new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const samples = [
    { owner: 'driver', sku: 'CAR-021', offset: 4, days: 3, status: 'approved' },
    { owner: 'driver', sku: 'CAR-045', offset: 12, days: 4, status: 'pending' },
    { owner: 'driver', sku: 'CAR-015', offset: -18, days: 4, status: 'approved' },
    { owner: 'driver', sku: 'CAR-032', offset: -7, days: 2, status: 'cancelled' },
    { owner: 'demo-maya', sku: 'CAR-026', offset: 1, days: 2, status: 'pending' },
    { owner: 'demo-kemi', sku: 'CAR-042', offset: 3, days: 5, status: 'pending' },
    { owner: 'demo-maya', sku: 'CAR-035', offset: -11, days: 3, status: 'approved' },
  ] as const;
  for (const sample of samples) {
    const owner = accounts.get(sample.owner)!;
    const booking = bookings.create(owner, {
      sku: sample.sku, pickupDate: day(sample.offset), returnDate: day(sample.offset + sample.days), payment: 'success',
    });
    booking.status = sample.status;
  }
}

export function receiptData(booking: Booking) {
  return {
    bookingId: booking.id,
    sku: booking.car.sku,
    pickupDate: booking.pickupDate,
    returnDate: booking.returnDate,
    days: booking.days,
    totalCents: booking.totalCents,
    currency: 'USD',
  };
}
