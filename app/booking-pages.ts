import { type Account, type Car } from './catalog.ts';
import { dailyRateCents, type Booking, type BookingStatus } from './booking.ts';
import { escape, layout, usd } from './pages.ts';

const statusLabels: Record<BookingStatus, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved',
  cancelled: 'Cancelled',
};

export function carPage(car: Car, account?: Account, error = '', input: Record<string, string> = {}) {
  const message = error ? `<p class="notice" role="alert">${escape(error)}</p>` : '';
  const checkout = account ? `<form method="post" action="/bookings">
    <input type="hidden" name="sku" value="${car.sku}">
    <div class="date-fields">
      <label>Pickup date <input type="date" name="pickupDate" value="${escape(input.pickupDate || '')}" required></label>
      <label>Return date <input type="date" name="returnDate" value="${escape(input.returnDate || '')}" required></label>
    </div>
    <label>Simulated payment <select name="payment">
      <option value="success">Payment succeeds</option>
      <option value="declined"${input.payment === 'declined' ? ' selected' : ''}>Payment is declined</option>
    </select></label>
    <p class="field-hint">Practice checkout uses fictional payments.</p>
    <button>Place booking</button>
  </form>` : `<p class="field-hint">Sign in with a practice account to choose dates and book this car.</p>
      <a class="button" href="/login?next=${encodeURIComponent('/cars/' + car.sku)}">Sign in to book</a>`;
  return layout(car.name, `<a class="back" href="/">Back to catalog</a>
    <section class="booking-layout">
      <div class="panel car-details">
        <p class="vehicle-type">${car.category} <span>${car.sku}</span></p>
        <h1>${car.name}</h1>
        <p class="rental-price">${usd.format(dailyRateCents(car) / 100)} <small>/ day</small></p>
        <dl><dt>Catalog price</dt><dd>${usd.format(car.finalPriceCents / 100)}</dd></dl>
      </div>
      <div class="panel"><h2>Book this car</h2>${message}${checkout}</div>
    </section>`, account);
}

function bookingList(bookings: Booking[], action: 'approve' | 'cancel') {
  return `<ul class="bookings" aria-label="Bookings">${bookings.map(booking => {
    const { id, status, car, pickupDate, returnDate, totalCents, days } = booking;
    const allowAction = action === 'approve' ? status === 'pending' : status !== 'cancelled';
    return `<li class="panel booking" id="${id}" data-booking-id="${id}" data-status="${status}">
        <div class="booking-heading"><div><p class="booking-id">${id}</p><h2>${car.name}</h2></div>
          <p class="status status-${status}">${statusLabels[status]}</p></div>
        <p>${pickupDate} to ${returnDate}</p>
        <p class="booking-total">${usd.format(totalCents / 100)} · ${days} ${days === 1 ? 'day' : 'days'}</p>
        ${allowAction ? `<form method="post" action="/bookings/${id}/${action}">
          <button class="${action === 'cancel' ? 'secondary' : ''}">${action === 'cancel' ? 'Cancel booking' : 'Approve booking'}</button>
        </form>` : ''}
      </li>`;
  }).join('')}</ul>`;
}

export function bookingsPage(bookings: Booking[], account: Account, review: boolean, notice = '') {
  const title = review ? 'Review bookings' : 'My bookings';
  const empty = review ? 'No bookings to review yet.' : 'Your bookings will appear here after checkout.';
  return layout(title, `<h1>${title}</h1>
    ${notice ? `<p class="notice" role="alert">${escape(notice)}</p>` : ''}
    ${bookings.length ? bookingList(bookings, review ? 'approve' : 'cancel') :
      `<section class="panel empty"><p>${empty}</p><a href="/">Browse the catalog</a></section>`}`, account);
}
