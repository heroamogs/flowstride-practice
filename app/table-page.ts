import { escape, layout } from './pages.ts';
import type { Account } from './catalog.ts';
import { branches, memberships, fleetStatuses, invoice, invoiceTotal, pickupTimes, pickupSlots, reservations, type TableStore } from './table-data.ts';
import { field, InputError } from './request.ts';

const sections = [
  ['renters', 'Renter directory'], ['fleet', 'Fleet register'], ['invoice', 'Rental invoice'],
  ['clearances', 'Service clearance queue'], ['slots', 'Branch pickup slots'], ['reservations', 'Reservation payments'],
] as const;
type Section = typeof sections[number][0];
const notices: Record<string, string> = {
  reset: 'Practice tables restored.', email: 'Email error loaded in the renter directory.',
  renter: 'Renter saved.', fleet: 'Odometer saved.', released: 'Vehicle released to the fleet.',
};
const numbers = new Intl.NumberFormat('en-NG');
const naira = (amount: number) => '₦' + numbers.format(amount);

function tableView(query: URLSearchParams, store: TableStore) {
  const view = new URLSearchParams();
  if (query.get('renters') === 'name') view.set('renters', 'name');
  if (query.get('fleet') === 'id') view.set('fleet', 'id');
  const status = query.get('status');
  if (status && fleetStatuses.includes(status)) view.set('status', status);
  const edit = query.get('edit');
  if (edit && [...store.renters, ...store.fleet].some(row => row.id === edit)) view.set('edit', edit);
  for (const row of reservations) {
    if (query.getAll('payments').includes(row.id)) view.append('payments', row.id);
  }
  return view;
}

function address(view: URLSearchParams, anchor: string, notice?: string) {
  const query = new URLSearchParams(view);
  if (notice) query.set('notice', notice);
  return '/tables' + (query.size ? '?' + query.toString() : '') + '#' + anchor;
}

export function submitTables(store: TableStore, query: URLSearchParams, body: Record<string, unknown>) {
  const view = tableView(query, store);
  const id = field(body, 'id');
  switch (field(body, 'action')) {
    case 'reset':
      store.reset();
      return address(new URLSearchParams(), 'tables', 'reset');
    case 'email-error':
      store.loadEmailError();
      view.delete('edit');
      return address(view, 'renters', 'email');
    case 'save-renter':
      store.editRenter(id, body);
      view.delete('edit');
      return address(view, id, 'renter');
    case 'save-odometer':
      store.editOdometer(id, field(body, 'km'));
      view.delete('edit');
      return address(view, id, 'fleet');
    case 'release':
      store.release(id);
      return address(view, 'clearances', 'released');
    default:
      throw new InputError(400, 'Unknown table action.');
  }
}

function hidden(name: string, value: string) {
  return `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`;
}

function viewInputs(view: URLSearchParams, omit: string[] = []) {
  return [...view].filter(([name]) => !omit.includes(name)).map(([name, value]) => hidden(name, value)).join('');
}

function options(values: [string, string][], selected: string) {
  return values.map(([value, label]) => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(label)}</option>`).join('');
}

function postButton(action: string, id: string, label: string, view: URLSearchParams, anchor: string) {
  return `<form method="post" action="${escape(address(view, anchor))}">${hidden('action', action)}${id ? hidden('id', id) : ''}
    <button class="${action === 'reset' ? 'table-primary' : 'secondary'}">${label}</button></form>`;
}

function editButton(id: string, view: URLSearchParams) {
  const next = new URLSearchParams(view);
  next.set('edit', id);
  return `<form action="/tables#${id}">${viewInputs(next)}<button class="secondary">Edit</button></form>`;
}

function editActions(id: string, action: string, view: URLSearchParams) {
  const cancel = new URLSearchParams(view);
  cancel.delete('edit');
  return `<form id="save-${id}" method="post" action="${escape(address(view, id))}">
    ${hidden('action', action)}${hidden('id', id)}<button>Save</button>
    <a href="${escape(address(cancel, id))}">Cancel</a></form>`;
}

function table(id: string, label: string, columns: string[], rows: string, foot = '') {
  return `<div class="table-scroll" role="region" aria-label="${label} scroll area" tabindex="0">
    <table id="${id}" aria-label="${label}"><thead><tr>${columns.map(name => `<th scope="col">${name}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>${foot}</table></div>`;
}

function panel(section: Section, contents: string, toolbar = '') {
  const title = sections.find(([id]) => section === id)![1];
  return `<section class="tables-panel" id="${section}" aria-labelledby="${section}-title"><header class="tables-panel-head">
    <h2 id="${section}-title">${title}</h2>${toolbar}</header>${contents}</section>`;
}

function directory(store: TableStore, view: URLSearchParams) {
  const order = view.get('renters') || 'id';
  const renters = order === 'name' ? [...store.renters].sort((a,b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id)) : store.renters;
  const rows = renters.map(r => {
    const start = `<tr id="${r.id}" data-renter-id="${r.id}"><td>${r.id}</td>`;
    if (view.get('edit') !== r.id) return start + `<td>${escape(r.name)}</td><td>${escape(r.email)}</td><td>${r.branch}</td><td>${r.membership}</td><td>${editButton(r.id, view)}</td></tr>`;
    const form = `form="save-${r.id}"`;
    return start + `<td><input ${form} aria-label="Full name" name="name" maxlength="80" required value="${escape(r.name)}"></td>
      <td><input ${form} aria-label="Email" name="email" type="email" maxlength="150" required value="${escape(r.email)}"></td>
      <td><select ${form} aria-label="Home branch" name="branch">${options(branches.map(v => [v,v]),r.branch)}</select></td>
      <td><select ${form} aria-label="Membership" name="membership">${options(memberships.map(v => [v,v]),r.membership)}</select></td>
      <td>${editActions(r.id,'save-renter',view)}</td></tr>`;
  }).join('');
  const sort = `<form class="table-filters" action="/tables#renters">${viewInputs(view,['renters','edit'])}
    <label>Sort renters <select name="renters">${options([['id','Renter ID'],['name','Full name']],order)}</select></label><button class="secondary">Sort</button></form>`;
  return panel('renters', table('renter-directory','Renter directory',['Renter ID','Full name','Email','Home branch','Membership','Actions'],rows),sort);
}

function fleetRegister(store: TableStore, view: URLSearchParams) {
  const status = view.get('status') || '';
  const order = view.get('fleet') || 'updated';
  const fleet = store.fleet.filter(car => !status || car.status === status);
  if (order === 'id') fleet.sort((a,b) => a.id.localeCompare(b.id));
  const rows = fleet.map(car => {
    const edit = view.get('edit') === car.id;
    const km = edit ? `<input form="save-${car.id}" name="km" type="number" min="0" max="9999999" step="1" required aria-label="Odometer in kilometres" value="${car.km}">` : numbers.format(car.km) + ' km';
    return `<tr id="${car.id}" data-fleet-id="${car.id}"><td>${car.id}</td><td>${car.name}</td><td>${car.category}</td><td>${km}</td>
      <td><span class="fleet-state" data-state="${car.status}">${car.status}</span></td>
      <td>${edit ? editActions(car.id,'save-odometer',view) : editButton(car.id,view)}</td></tr>`;
  }).join('');
  const filter = `<form class="table-filters" action="/tables#fleet">${viewInputs(view,['fleet','status','edit'])}
    <label>Fleet status <select name="status">${options([['','All statuses'], ...fleetStatuses.map((v): [string,string] => [v,v])],status)}</select></label>
    <label>Sort fleet <select name="fleet">${options([['updated','Recently updated'],['id','Fleet ID']],order)}</select></label>
    <button class="secondary">Apply</button></form>`;
  return panel('fleet',table('fleet-register','Fleet register',['Fleet ID','Vehicle','Category','Odometer','Fleet status','Actions'],rows)
    + (fleet.length ? '' : '<p class="table-empty">No vehicles match this status.</p>'),filter);
}

function rentalInvoice() {
  const rows = invoice.charges.map(c => `<tr><td>${c.label}</td><td>${c.quantity}</td><td>${naira(c.price)}</td><td>${naira(c.quantity * c.price)}</td></tr>`).join('');
  const foot = `<tfoot><tr><th colspan="3" scope="row">Invoice total</th><td>${naira(invoiceTotal)}</td></tr></tfoot>`;
  return panel('invoice',table('rental-invoice','Rental invoice',['Charge','Quantity','Unit price','Line amount'],rows,foot),`<span class="table-reference">${invoice.id}</span>`);
}

function clearanceQueue(store: TableStore, view: URLSearchParams) {
  const queue = store.queue;
  const rows = queue.map(c => `<tr data-clearance-id="${c.id}"><td>${c.id}</td><td>${c.fleetId}</td><td>${c.work}</td><td>${c.inspector}</td>
    <td>${postButton('release',c.id,'Release vehicle',view,'clearances')}</td></tr>`).join('');
  return panel('clearances',table('service-clearance-queue','Service clearance queue',['Clearance ID','Fleet ID','Work completed','Inspected by','Action'],rows)
    + (queue.length ? '' : '<p class="table-empty">No vehicles awaiting clearance</p>'));
}

function branchSlots() {
  const rows = pickupSlots.map(row => `<tr><th scope="row">${row.branch}</th>${row.slots.map(value => `<td>${value}</td>`).join('')}</tr>`).join('');
  return panel('slots',table('branch-pickup-slots','Branch pickup slots',['Branch', ...pickupTimes],rows));
}

function reservationPayments(store: TableStore, view: URLSearchParams) {
  const expanded = view.getAll('payments');
  const rows = reservations.map(r => {
    const open = expanded.includes(r.id);
    const next = new URLSearchParams(view);
    if (open) next.delete('payments',r.id);
    else next.append('payments',r.id);
    const renter = store.renters.find(person => person.id === r.renter)!;
    const paid = r.payments.reduce((sum,p) => sum + p.amount,0);
    const paymentRows = open ? r.payments.map(p => `<tr><td>${p.ref}</td><td>${p.method}</td><td>${naira(p.amount)}</td></tr>`).join('') : '';
    return `<tr id="${r.id}" data-reservation-id="${r.id}"><td>${r.id}</td><td>${escape(renter.name)}</td><td>${naira(r.total)}</td><td>${naira(paid)}</td>
      <td><form action="/tables#${r.id}">${viewInputs(next)}<button class="secondary" aria-expanded="${open}">${open ? 'Hide payments' : 'View payments'}</button></form></td></tr>`
      + (open ? `<tr class="payment-detail"><td colspan="5"><h3>Payments for ${r.id}</h3>
        ${table('payments-'+r.id,'Payments for '+r.id,['Payment reference','Method','Amount'],paymentRows)}</td></tr>` : '');
  }).join('');
  return panel('reservations',table('reservation-payments','Reservation payments',['Reservation','Renter','Rental total','Paid so far','Action'],rows));
}

export function tablesPage(store: TableStore, query: URLSearchParams, account?: Account, error?: string) {
  const view = tableView(query, store);
  const notice = query.get('notice') || '';
  return layout('Practice tables', `<div class="practice-tables" id="tables"><header class="tables-heading"><div><h1>Practice tables</h1>
    <p>Reset practice data to restore the six tables for another run.</p></div><div class="table-controls">
    ${postButton('email-error','','Load email error',view,'renters')}${postButton('reset','','Reset practice data',view,'tables')}</div></header>
    ${error ? `<p class="notice" role="alert">${escape(error)}</p>` : Object.hasOwn(notices,notice) ? `<p class="notice notice-success" role="status">${notices[notice]}</p>` : ''}
    <nav class="table-jumps" aria-label="Jump to table">${sections.map(([id,title]) => `<a href="#${id}">${title}</a>`).join('')}</nav>
    ${directory(store,view)}${fleetRegister(store,view)}${rentalInvoice()}${clearanceQueue(store,view)}${branchSlots()}${reservationPayments(store,view)}
    </div>`, account, 'tables');
}
