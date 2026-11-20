import { catalog, type Account, type Car } from './catalog.ts';
import { InputError, field } from './request.ts';

export type BookingStatus = 'pending' | 'approved' | 'cancelled';

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
export const canApprove = (account: Account) => account.role === 'admin' || account.role === 'approver';

function parseDate(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return NaN;
  const time = Date.parse(input + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === input ? time : NaN;
}

export function createBookingStore() {
  const bookings = new Map<string, Booking>();
  let nextId = 1;

  return {
    forAccount(account: Account) {
      return [...bookings.values()].filter(booking => booking.accountId === account.id);
    },
    all() {
      return [...bookings.values()];
    },
    findOwned(account: Account, id: string) {
      const booking = bookings.get(id);
      if (!booking || booking.accountId !== account.id) throw new InputError(404, 'That booking could not be found.');
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
      return booking;
    },
    update(account: Account, id: string, action: 'approve' | 'cancel') {
      const booking = bookings.get(id);
      if (!booking || (action === 'cancel' && booking.accountId !== account.id)) {
        throw new InputError(404, 'That booking could not be found.');
      }
      if (action === 'approve' && !canApprove(account)) throw new InputError(403, 'Booking approval requires an approver or administrator.');
      if (action === 'approve' && booking.status === 'cancelled') throw new InputError(409, 'A cancelled booking cannot be approved.');
      if (booking.status === 'cancelled' || (action === 'approve' && booking.status === 'approved')) return booking;
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
