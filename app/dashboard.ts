import { roleLabels, type Account } from './catalog.ts';
import { today, type Booking } from './booking.ts';
import { bookingTable, dateLabel, sortedBookings, statusBadge, statusLabels } from './booking-pages.ts';
import { escape, layout, usd } from './pages.ts';

function metrics(values: { id: string; label: string; value: number; tone: string }[]) {
  return `<dl class="dashboard-metrics">${values.map(({ id, label, value, tone }) =>
    `<div class="metric metric-${tone}"><dt>${label}</dt><dd id="${id}">${value}</dd></div>`).join('')}</dl>`;
}

function section(title: string, content: string, href?: string, linkText?: string) {
  return `<section class="dashboard-panel">
    <header class="dashboard-panel-heading"><h2>${title}</h2>${href ? `<a href="${href}">${linkText}</a>` : ''}</header>
    ${content}</section>`;
}

function accountCard(account: Account, title = 'Your account') {
  return section(title, `<dl class="account-details">
    <div><dt>Name</dt><dd>${escape(account.name)}</dd></div>
    <div><dt>Email</dt><dd>${escape(account.email)}</dd></div>
    <div><dt>Role</dt><dd id="account-role">${roleLabels[account.role]}</dd></div>
    </dl>${account.role === 'approver' ? '<p class="permission">Can approve bookings</p>' : ''}`);
}

function activePickup(booking?: Booking) {
  if (!booking) return `<section class="next-booking next-booking-empty">
    <h2>Next booking</h2><p>Your next pickup will appear here after you book a car.</p>
    <a class="button" href="/">Browse cars</a></section>`;
  return `<section class="next-booking">
      <div class="next-booking-label"><h2>Next booking</h2>${statusBadge(booking.status)}</div>
      <h3>${booking.car.name}</h3><p class="upcoming-reference">${booking.id}</p>
      <dl class="next-booking-details">
        <div><dt>Pickup</dt><dd>${dateLabel(booking.pickupDate)}</dd></div>
        <div><dt>Return</dt><dd>${dateLabel(booking.returnDate)}</dd></div>
        <div><dt>Total</dt><dd>${usd.format(booking.totalCents / 100)}</dd></div>
      </dl>
      <a class="button next-action" href="/bookings/${booking.id}">View booking</a>
    </section>`;
}

function driverDashboard(account: Account, own: Booking[], accounts: ReadonlyMap<string, Account>) {
  const date = today();
  const upcoming = own.filter(item => item.status !== 'cancelled' && item.returnDate > date)
    .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));
  const history = sortedBookings(own.filter(item => !upcoming.includes(item)), false);
  const recentRows = history.length
    ? bookingTable(history.slice(0, 5), false, accounts, true)
    : '<p class="empty-message">Past and cancelled bookings will appear here.</p>';
  return layout('Your account', `<section data-user-id="${account.id}" class="overview-page">
    <header class="workspace-title"><div><h1>Your account</h1><p>Signed in as ${escape(account.name)}</p></div>
      <a class="button" href="/">Browse cars</a></header>
    ${metrics([
      { id: 'upcoming-count', label: 'Upcoming bookings', value: upcoming.length, tone: 'purple' },
      { id: 'pending-count', label: 'Awaiting approval', value: upcoming.filter(item => item.status === 'pending').length, tone: 'amber' },
      { id: 'approved-count', label: 'Approved rentals', value: own.filter(item => item.status === 'approved').length, tone: 'green' },
    ])}
    <div class="dashboard-columns">
      ${activePickup(upcoming[0])}
      ${accountCard(account, 'Account details')}
    </div>
    ${section('Upcoming bookings', upcoming.length ? bookingTable(upcoming, false, accounts, true) :
      '<p class="empty-message">You don’t have any upcoming bookings.</p>', '/bookings', 'See all bookings')}
    ${section('Booking history', recentRows)}
    </section>`, account, 'overview');
}

function teamOverview(accounts: ReadonlyMap<string, Account>) {
  const members = [...accounts.values()].filter(account => account.role !== 'admin');
  return section('Team access', `<ul class="team-list">${members.slice(-4).reverse().map(member =>
    `<li><span class="user-mark" aria-hidden="true">${escape(member.name.slice(0, 1).toUpperCase())}</span>
    <div><strong>${escape(member.name)}</strong><span>${escape(member.email)}</span></div>
    <span class="role-pill">${roleLabels[member.role]}</span></li>`).join('')}</ul>`, '/admin', 'Open user settings');
}

function staffDashboard(account: Account, bookings: Booking[], accounts: ReadonlyMap<string, Account>) {
  const isAdmin = account.role === 'admin';
  const title = isAdmin ? 'Operations dashboard' : 'Approver dashboard';
  const pending = sortedBookings(bookings.filter(item => item.status === 'pending'), true);
  const recent = sortedBookings(bookings.filter(item => item.status !== 'pending'), false).slice(0, 5);
  return layout(title, `<section data-user-id="${account.id}" class="overview-page">
    <header class="workspace-title"><div><h1>${title}</h1><p>Signed in as ${escape(account.name)}</p></div>
      <span class="role-pill">${roleLabels[account.role]}</span></header>
    ${metrics([
      { id: 'pending-count', label: 'Awaiting approval', value: pending.length, tone: 'amber' },
      { id: 'approved-count', label: 'Approved bookings', value: bookings.filter(item => item.status === 'approved').length, tone: 'green' },
      { id: 'cancelled-count', label: 'Cancelled bookings', value: bookings.filter(item => item.status === 'cancelled').length, tone: 'grey' },
      isAdmin ? { id: 'users-count', label: 'Workspace users', value: accounts.size, tone: 'purple' }
        : { id: 'bookings-count', label: 'Total bookings', value: bookings.length, tone: 'purple' },
    ])}
    ${section('Approval queue', pending.length ? bookingTable(pending.slice(0, 6), true, accounts, true) :
      '<p class="empty-message">There are no bookings waiting for approval.</p>', '/bookings/review?status=pending', 'See all pending')}
    <div class="staff-columns">
      ${section('Booking decisions', recent.length ? `<ul class="decision-list">${recent.map(item =>
        `<li><div><a href="/bookings/${item.id}">${item.car.name}</a><small>${item.id} · ${dateLabel(item.pickupDate)}</small></div>
        <span class="status status-${item.status}">${statusLabels[item.status]}</span></li>`).join('')}</ul>` :
        '<p class="empty-message">Approved and cancelled bookings will appear here.</p>', '/bookings/review', 'Booking history')}
      ${isAdmin ? teamOverview(accounts) : accountCard(account)}
    </div>
    </section>`, account, 'overview');
}

export function dashboardPage(account: Account, bookings: Booking[], accounts: ReadonlyMap<string, Account>) {
  return account.role === 'member'
    ? driverDashboard(account, bookings.filter(booking => booking.accountId === account.id), accounts)
    : staffDashboard(account, bookings, accounts);
}
