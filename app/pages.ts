import { categories, memberRoles, roleLabels, type Account, type Car } from './catalog.ts';

export const escape = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export type WorkspacePage = 'overview' | 'bookings' | 'review' | 'users';

function workspaceLinks(account: Account, current?: WorkspacePage) {
  const links: [WorkspacePage, string, string][] = [
    ['overview', '/account', current ? 'Overview' : 'Account'],
    ['bookings', '/bookings', 'My bookings'],
  ];
  if (account.role !== 'member') links.push(['review', '/bookings/review', 'Review bookings']);
  if (account.role === 'admin') links.push(['users', '/admin', 'Manage users']);
  return links.map(([key, href, label]) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`).join('');
}

export function layout(title: string, content: string, account?: Account, area?: WorkspacePage | 'tables') {
  const tables = area === 'tables';
  const workspace = area === 'tables' ? undefined : area;
  const signOut = '<form method="post" action="/logout"><button class="quiet">Sign out</button></form>';
  const nav = account
    ? (workspace ? signOut : workspaceLinks(account) + signOut)
    : '<a href="/login">Sign in</a><a class="signup-link" href="/signup">Sign up</a>';
  const sidebar = account && workspace ? `<aside class="workspace-sidebar">
    <nav aria-label="Workspace navigation">${workspaceLinks(account, workspace)}</nav>
    <div class="workspace-identity"><span class="user-mark" aria-hidden="true">${escape(account.name.slice(0, 1).toUpperCase())}</span>
      <div><strong>${escape(account.name)}</strong><span>${roleLabels[account.role]}</span></div>
    </div>
  </aside>` : '';
  const body = workspace
    ? `<div class="workspace-shell">${sidebar}<main id="main-content" class="workspace-main">${content}</main></div>`
    : `<main id="main-content">${content}</main>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} | Flowstride Practice</title>
<link rel="stylesheet" href="/styles.css">
${tables ? '<link rel="stylesheet" href="/practice-tables.css">' : ''}
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
<header class="topbar"><a class="brand" href="/"><img src="/flowstride-logo.png" alt="" width="35" height="35"> Flowstride Practice</a>
<nav aria-label="Main navigation"><a href="/">Catalog</a><a href="/tables"${tables ? ' aria-current="page"' : ''}>Tables</a>${nav}</nav></header>
${body}
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

export function passwordField(mode: 'login' | 'signup') {
  const id = mode + '-password';
  const attributes = mode === 'signup'
    ? 'placeholder="Create a password" autocomplete="new-password" minlength="8" maxlength="128" aria-describedby="password-hint"'
    : 'placeholder="Enter password" autocomplete="current-password"';
  return `<div class="password-field">
      <label for="${id}">Password
        <input id="${id}" name="password" type="password" required ${attributes}>
      </label>
      <button type="button" class="password-toggle" aria-controls="${id}" aria-label="Show password" title="Show password" hidden>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12Z"/>
          <circle cx="12" cy="12" r="3"/>
          <path class="eye-slash" d="m3 3 18 18"/>
        </svg>
      </button>
    </div>
    <script src="/password-visibility.js" defer></script>`;
}

export function loginPage(error = '', next = '', registered = false) {
  return layout('Sign in', `<section class="panel narrow auth-panel"><h1>Sign in</h1>
  ${registered ? '<p class="notice notice-success" role="status">Account verified. Sign in to continue.</p>' : ''}
  ${error ? `<p class="notice" role="alert">${escape(error)}</p>` : ''}
  <form method="post" action="/login${next ? '?next=' + encodeURIComponent(next) : ''}">
    <label>Email <input id="login-email" name="email" type="email" placeholder="Enter email" autocomplete="username" required></label>
    ${passwordField('login')}
    <button>Sign in</button>
  </form></section>`);
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
  return layout('Manage users', `<header class="workspace-title"><div><h1>Manage users</h1><p>Create practice accounts and control their access.</p></div>
    <span class="role-pill">${accounts.length} accounts</span></header>
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
  </div>`, admin, 'users');
}

export function errorPage(message: string, account?: Account) {
  return layout('Request result', `<section class="panel narrow"><h1>Request result</h1>
    <p class="notice" role="alert">${escape(message)}</p>
    <a href="/">Back to catalog</a></section>`, account);
}
