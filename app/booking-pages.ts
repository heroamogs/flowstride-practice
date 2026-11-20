import { type Account, type Car } from './catalog.ts';
import { bookingStatuses, canCancel, dailyRateCents, type Booking, type BookingStatus } from './booking.ts';
import { escape, layout, usd } from './pages.ts';

export const statusLabels: Record<BookingStatus, string> = {
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

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const dateLabel = (date: string) => dateFormat.format(new Date(date + 'T00:00:00Z'));
export const statusBadge = (status: BookingStatus) =>
  `<span class="status status-${status}">${statusLabels[status]}</span>`;

const reviewRank: Record<BookingStatus, number> = { pending: 0, approved: 1, cancelled: 2 };

export function sortedBookings(bookings: Booking[], review: boolean) {
  return [...bookings].sort((a, b) => review
    ? reviewRank[a.status] - reviewRank[b.status] || a.pickupDate.localeCompare(b.pickupDate)
    : b.pickupDate.localeCompare(a.pickupDate));
}

function bookingAction(booking: Booking, review: boolean, fromOverview: boolean) {
  const action = review ? 'approve' : 'cancel';
  const allow = review ? booking.status === 'pending' : canCancel(booking);
  return allow ? `<form method="post" action="/bookings/${booking.id}/${action}${fromOverview ? '?from=overview' : ''}">
    <button class="${review ? '' : 'secondary'}">${review ? 'Approve booking' : 'Cancel booking'}</button>
  </form>` : '';
}

export function bookingTable(bookings: Booking[], review: boolean, accounts: ReadonlyMap<string, Account>, fromOverview = false) {
  return `<div class="booking-table">
    <table aria-label="Bookings">
      <thead><tr><th scope="col">Booking</th>${review ? '<th scope="col">Driver</th>' : ''}
        <th scope="col">Rental dates</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
      <tbody>${bookings.map(booking => {
        const { id, status, car, pickupDate, returnDate, totalCents, days } = booking;
        const owner = accounts.get(booking.accountId);
        return `<tr class="booking" id="${id}" data-booking-id="${id}" data-status="${status}">
          <th scope="row" data-label="Booking"><a href="/bookings/${id}">${car.name}</a><small>${id}</small></th>
          ${review ? `<td data-label="Driver">${owner ? escape(owner.name) : 'Unavailable'}</td>` : ''}
          <td data-label="Dates">${dateLabel(pickupDate)} – ${dateLabel(returnDate)}<small>${days} ${days === 1 ? 'day' : 'days'}</small></td>
          <td data-label="Total" class="booking-total">${usd.format(totalCents / 100)}</td>
          <td data-label="Status">${statusBadge(status)}</td>
          <td data-label="Actions" class="booking-actions">
            ${!review && status === 'approved' ? `<a href="/bookings/${id}/receipt" target="_blank" rel="noopener">View receipt</a>` : ''}
            ${bookingAction(booking, review, fromOverview)}
            ${!review && !canCancel(booking) ? `<a href="/cars/${car.sku}">Book again</a>` : ''}
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;
}

export function bookingsPage(
  bookings: Booking[], account: Account, review: boolean, accounts: ReadonlyMap<string, Account>, selection?: BookingStatus,
) {
  const title = review ? 'Review bookings' : 'My bookings';
  const href = review ? '/bookings/review' : '/bookings';
  const filters = ([undefined, ...bookingStatuses]).map(status => {
    const count = status ? bookings.filter(booking => booking.status === status).length : bookings.length;
    return `<a href="${href}${status ? '?status=' + status : ''}"${status === selection ? ' aria-current="true"' : ''}>
      ${status ? statusLabels[status] : 'All bookings'} <span>${count}</span></a>`;
  }).join('');
  const visible = sortedBookings(selection ? bookings.filter(booking => booking.status === selection) : bookings, review);
  const empty = selection ? 'No bookings match this status.' : review ? 'No bookings to review yet.' : 'Your bookings will appear here after checkout.';
  return layout(title, `<header class="workspace-title"><div><h1>${title}</h1>
      <p>${review ? 'Review driver reservations and approve the bookings that are ready.' : 'Track approvals, change plans, and open your receipts.'}</p></div>
      ${review ? '' : '<a class="button" href="/">Browse cars</a>'}</header>
    <section class="dashboard-panel"><nav class="status-filters" aria-label="Filter by booking status">${filters}</nav>
      ${visible.length ? bookingTable(visible, review, accounts) : `<p class="empty-message">${empty}</p>`}
    </section>`, account, review ? 'review' : 'bookings');
}

export function bookingDetails(booking: Booking, account: Account) {
  const owned = booking.accountId === account.id;
  const name = booking.car.name;
  return layout(name, `<a class="back" href="${owned ? '/bookings' : '/bookings/review'}">Back to bookings</a>
    <header class="workspace-title"><div><h1>${name}</h1><p>${booking.id} · ${booking.car.category}</p></div>${statusBadge(booking.status)}</header>
    <section class="dashboard-panel padded"><h2>Rental details</h2>
      <dl class="details-grid"><div><dt>Pickup</dt><dd>${booking.pickupDate}</dd></div><div><dt>Return</dt><dd>${booking.returnDate}</dd></div>
      <div><dt>Total</dt><dd>${usd.format(booking.totalCents / 100)}</dd></div></dl>
      <div class="panel-actions">${owned && booking.status === 'approved'
        ? `<a class="button" href="/bookings/${booking.id}/receipt" target="_blank" rel="noopener">View receipt</a>` : ''}
      ${bookingAction(booking, !owned, false)}</div>
    </section>`, account, owned ? 'bookings' : 'review');
}

export function receiptPage(booking: Booking, account: Account) {
  return layout('Booking receipt', `<section class="dashboard-panel receipt-panel padded">
    <header class="workspace-title"><div><h1>Booking receipt</h1><p>${booking.car.name} · ${booking.id}</p></div>${statusBadge(booking.status)}</header>
    <dl class="details-grid"><div><dt>Booking reference</dt><dd id="receipt-id">${booking.id}</dd></div>
      <div><dt>Driver</dt><dd>${escape(account.name)}</dd></div><div><dt>Pickup</dt><dd>${booking.pickupDate}</dd></div>
      <div><dt>Return</dt><dd>${booking.returnDate}</dd></div><div><dt>Days</dt><dd>${booking.days}</dd></div>
      <div><dt>Total</dt><dd id="receipt-total">${usd.format(booking.totalCents / 100)}</dd></div></dl>
    <div class="panel-actions"><a class="button" href="/bookings/${booking.id}/receipt/download">Download receipt</a>
      <a href="/bookings/${booking.id}">Booking details</a></div>
    </section>`, account, 'bookings');
}

export function retryReceiptPage(id: string, account: Account) {
  return layout('Receipt temporarily unavailable', `<section class="dashboard-panel receipt-panel padded">
    <h1>Receipt temporarily unavailable</h1>
    <p class="notice" role="alert">The booking is approved. Try opening its receipt again.</p>
    <a class="button" href="/bookings/${id}/receipt">Retry receipt</a></section>`, account, 'bookings');
}
