import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { startPracticeApp } from '../app/server.ts';

async function practice(t: TestContext) {
  const app = await startPracticeApp(0);
  t.after(() => app.close());
  const page = async (query = '') => (await fetch(app.origin + '/tables' + query)).text();
  const submit = async (values: Record<string, string>, query = '') => fetch(app.origin + '/tables' + query, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  return { ...app, page, submit };
}

function row(html: string, key: string) {
  const match = html.match(new RegExp('<tr [^>]*(?:id|data-clearance-id)="' + key + '"[^>]*>([\\s\\S]*?)</tr>'));
  assert.ok(match, 'Missing row ' + key);
  return match[1];
}

test('tables are public and use the seeded data, real headers, a footer and closed payment details', async t => {
  const app = await practice(t);
  const html = await app.page();
  assert.equal((html.match(/<table /g) || []).length, 6);
  assert.equal((html.match(/<thead>/g) || []).length, 6);
  assert.match(row(html,'R-217'), /Tarela Briggs[\s\S]*tarela.briggs@example.test[\s\S]*Uyo[\s\S]*Business/);
  assert.match(html, /<tfoot><tr><th colspan="3" scope="row">Invoice total<\/th><td>₦97,500/);
  assert.match(html, /<th scope="row">Uyo<\/th><td>1<\/td><td>4<\/td><td>0<\/td><td>2/);
  assert.doesNotMatch(html, /PAY-927/);
  assert.match(row(html,'BK-6308'), /Kene Nwosu[\s\S]*₦97,500[\s\S]*₦50,000/);
  const open = await app.page('?payments=BK-6308&payments=BK-6341');
  assert.equal((open.match(/<table /g) || []).length, 8);
  assert.match(open, /<td>PAY-927<\/td><td>Card<\/td><td>₦15,000/);
  assert.match(open, /<td>PAY-942<\/td><td>Card<\/td><td>₦64,000/);
  assert.doesNotMatch(await app.page('?payments=BK-6341'), /PAY-927/);
});

test('renter edits validate all fields atomically, affect linked payments and preserve independent rows', async t => {
  const app = await practice(t);
  const edit = { action:'save-renter',id:'R-231',name:'Kene Nwosu II',email:'kene.new@example.test',branch:'Uyo',membership:'Business' };
  const sorted = await app.page('?renters=name');
  assert.ok(sorted.indexOf('id="R-231"') < sorted.indexOf('id="R-204"'));
  assert.ok(sorted.indexOf('id="R-204"') < sorted.indexOf('id="R-217"'));
  for (const [change, code] of [
    [{email:'broken'},400], [{email:'tarela.briggs@example.test'},409], [{branch:'unknown'},400], [{membership:'unknown'},400],
  ] as const) {
    const result = await app.submit({...edit,...change});
    assert.equal(result.status,code);
    assert.match(await result.text(), /role="alert"/);
    assert.match(row(await app.page(),'R-231'), /kene.nwosu@example.test/);
  }
  const saved = await app.submit(edit,'?renters=name&edit=R-231&payments=BK-6308');
  assert.equal(saved.status,303);
  const location = saved.headers.get('location')!;
  assert.match(location,/payments=BK-6308/);
  assert.doesNotMatch(location,/edit=/);
  const html = await (await fetch(app.origin + location)).text();
  assert.match(row(html,'R-231'),/kene.new@example.test/);
  assert.match(row(html,'BK-6308'),/Kene Nwosu II/);
  assert.match(row(html,'R-217'),/tarela.briggs@example.test/);
});

test('fleet filtering, redrawing after save and queue releases use the same vehicles', async t => {
  const app = await practice(t);
  const held = '?status=Service+hold';
  assert.doesNotMatch(await app.page(held), /id="FL-308"/);
  for (const km of ['-1','1.5','NaN','10000000','']) {
    assert.equal((await app.submit({action:'save-odometer',id:'FL-342',km})).status,400);
  }
  assert.match(row(await app.page(),'FL-342'),/15,880 km/);
  assert.equal((await app.submit({action:'save-odometer',id:'FL-342',km:'16040'})).status,303);
  const html = await app.page();
  assert.ok(html.indexOf('id="FL-342"') < html.indexOf('id="FL-308"'));
  assert.match(row(html,'FL-315'),/42,760 km/);
  assert.match(row(html,'FL-342'),/16,040 km/);
  const byId = await app.page('?fleet=id');
  assert.ok(byId.indexOf('id="FL-308"') < byId.indexOf('id="FL-342"'));
  const results = await Promise.all([app.submit({action:'release',id:'CL-851'}),app.submit({action:'release',id:'CL-851'})]);
  assert.deepEqual(results.map(r => r.status).sort(),[303,409]);
  const released = await app.page();
  assert.match(row(released,'FL-315'),/>Ready</);
  assert.match(row(released,'FL-342'),/>Service hold</);
  assert.doesNotMatch(released,/data-clearance-id="CL-851"/);
  assert.match(row(released,'CL-867'),/FL-342/);
  assert.equal((await app.submit({action:'release',id:'CL-867'})).status,303);
  assert.match(await app.page(), /<tbody><\/tbody><\/table><\/div><p class="table-empty">No vehicles awaiting clearance/);
  assert.match(await app.page(held), /No vehicles match this status/);
  assert.equal((await app.submit({action:'release',id:'missing'})).status,404);
});

test('email error and reset affect only the teaching records in the current instance', async t => {
  const app = await practice(t);
  const independent = await practice(t);
  const seed = await app.page();
  const login = await fetch(app.origin + '/api/session', {method:'POST',body:new URLSearchParams({email:'driver@example.test',password:'practice-driver'})});
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const booking = await fetch(app.origin + '/api/bookings', {method:'POST',headers:{Cookie:cookie},body:new URLSearchParams({
    sku:'CAR-001',pickupDate:'2030-06-12',returnDate:'2030-06-15',payment:'success',
  })});
  assert.equal(booking.status,201);
  const bookings = () => fetch(app.origin + '/api/bookings',{headers:{Cookie:cookie}}).then(r => r.json());
  const before = await bookings();
  for (let i = 0; i < 2; i++) {
    assert.equal((await app.submit({action:'email-error'})).status,303);
    assert.equal(await app.page(), seed.replace('morayo.dada@example.test','morayo.dada.example.test'));
  }
  await app.submit({action:'release',id:'CL-851'});
  await app.submit({action:'save-odometer',id:'FL-342',km:'16040'});
  assert.equal(await independent.page(),seed);
  const reset = await app.submit({action:'reset'},'?edit=R-204&payments=BK-6308&renters=name&status=Ready');
  assert.equal(reset.headers.get('location'),'/tables?notice=reset#tables');
  assert.equal(await app.page(),seed);
  assert.deepEqual(await bookings(),before);
});
