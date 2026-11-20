import { categories, memberRoles, roleLabels, type Account, type Car } from './catalog.ts';

export const escape = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function layout(title: string, content: string, account?: Account) {
  const nav = account
    ? `<a href="/bookings">My bookings</a><a href="/account">Account</a>${account.role !== 'member' ? '<a href="/bookings/review">Review bookings</a>' : ''}${account.role === 'admin' ? '<a href="/admin">Manage users</a>' : ''}
       <form method="post" action="/logout"><button class="quiet">Sign out</button></form>`
    : '<a href="/login">Sign in</a>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | Flowstride Practice</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="topbar"><a class="brand" href="/"><img src="/flowstride-logo.png" alt="" width="35" height="35"> Flowstride Practice</a>
<nav aria-label="Main navigation"><a href="/">Catalog</a>${nav}</nav></header>
<main>${content}</main>
</body>
</html>`;
}

export function catalogPage(cars: Car[], category: string, account?: Account, search = '', sort = '') {
  const options = categories.map(value =>
    `<option${value === category ? ' selected' : ''}>${value}</option>`).join('');
  const cards = cars.map(car => `<li class="car" data-sku="${car.sku}" data-price-cents="${car.finalPriceCents}">
    <div class="car-meta"><span>${car.category}</span><span>${car.sku}</span></div>
    <h2>${car.name}</h2>
    <p class="price"><span>${usd.format(car.finalPriceCents / 100)}</span>${car.discountPercent ? ` <del>${usd.format(car.priceCents / 100)}</del>` : ''}</p>
    ${car.discountPercent ? `<p class="discount">${car.discountPercent}% off</p>` : ''}
    <a class="car-link" href="/cars/${car.sku}">View ${car.name} <span aria-hidden="true">→</span></a>
  </li>`).join('');
  return layout('Car catalog', `<section class="catalog-hero">
  <div class="hero-copy"><h1>Car catalog</h1><p>Browse the fleet, compare prices, and book your next drive.</p></div>
</section>
<section class="catalog-section" aria-label="Browse cars">
  <form class="filter panel" method="get" action="/">
    <label>Search <input name="q" type="search" value="${escape(search)}" maxlength="80" placeholder="Car name or SKU"></label>
    <label for="category">Category
      <select id="category" name="category"><option value="">All cars</option>${options}</select></label>
    <label>Sort by
      <select name="sort">
        <option value="">Catalog order</option>
        <option value="price-asc"${sort === 'price-asc' ? ' selected' : ''}>Price: low to high</option>
        <option value="price-desc"${sort === 'price-desc' ? ' selected' : ''}>Price: high to low</option>
      </select></label>
    <button>Filter cars</button>
  </form>
  <div class="list-title"><h2>Available models</h2><p class="count">${cars.length} cars</p></div>
  ${cars.length ? `<ul class="catalog" aria-label="Cars">${cards}</ul>` : '<p class="panel empty">No matching cars. Try another search or category.</p>'}
</section>`, account);
}

export function loginPage(error = '', next = '') {
  return layout('Sign in', `<section class="panel narrow"><h1>Sign in</h1>
  ${error ? `<p class="notice" role="alert">${escape(error)}</p>` : ''}
  <form method="post" action="/login${next ? '?next=' + encodeURIComponent(next) : ''}">
    <label>Email <input id="login-email" name="email" type="email" autocomplete="username" required></label>
    <label>Password <input id="login-password" name="password" type="password" autocomplete="current-password" required></label>
    <button>Sign in</button>
  </form></section>`);
}

export function accountPage(account: Account) {
  return layout('Your account', `<section class="panel narrow" data-user-id="${account.id}"><h1>Your account</h1>
  <p>Signed in as ${escape(account.name)}</p><dl><dt>Role</dt><dd>${roleLabels[account.role]}</dd></dl>
  ${account.role === 'approver' ? '<p class="discount">Can approve bookings</p>' : ''}
  </section>`, account);
}

export function adminPage(accounts: Account[], admin: Account, error = '') {
  const rows = accounts.filter(account => account.role !== 'admin').map(account => {
    const roles = memberRoles.map(role => `<option value="${role}"${account.role === role ? ' selected' : ''}>${roleLabels[role]}</option>`).join('');
    return `<li class="member" data-user-id="${account.id}">
      <div><strong>${escape(account.name)}</strong><p>${escape(account.email)}</p>
        <p class="saved-role">Saved role · ${roleLabels[account.role]}</p></div>
      <form method="post" action="/admin/users/${account.id}/role">
        <label for="role-${account.id}">Role for ${escape(account.name)}</label>
        <div class="inline"><select id="role-${account.id}" name="role">${roles}</select><button>Assign role</button></div>
      </form>
    </li>`;
  }).join('');
  return layout('Manage users', `<h1>Manage users</h1>
  ${error ? `<p class="notice" role="alert">${escape(error)}</p>` : ''}
  <div class="admin-layout">
    <section class="panel"><h2>Create a user</h2>
      <form method="post" action="/admin/users">
        <label>Full name <input id="user-name" name="name" required maxlength="80"></label>
        <label>User email <input id="user-email" name="email" type="email" required maxlength="150"></label>
        <label>Temporary password <input id="user-password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
        <button>Create user</button>
      </form>
    </section>
    <section class="panel"><h2>Workspace users</h2><ul class="members">${rows}</ul></section>
  </div>`, admin);
}

export function errorPage(message: string, account?: Account) {
  return layout('Request result', `<section class="panel narrow"><h1>Request result</h1>
    <p class="notice" role="alert">${escape(message)}</p>
    <a href="/">Back to catalog</a></section>`, account);
}
