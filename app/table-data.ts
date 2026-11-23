import { InputError, field } from './request.ts';

export const branches = ['Port Harcourt', 'Uyo', 'Enugu', 'Ibadan'];
export const memberships = ['Standard', 'Business', 'Premium'];
export const fleetStatuses = ['Ready', 'Service hold', 'On hire'];

const renterSeed = [
  { id: 'R-204', name: 'Nengi Fubara', email: 'nengi.fubara@example.test', branch: 'Port Harcourt', membership: 'Standard' },
  { id: 'R-217', name: 'Tarela Briggs', email: 'tarela.briggs@example.test', branch: 'Uyo', membership: 'Business' },
  { id: 'R-231', name: 'Kene Nwosu', email: 'kene.nwosu@example.test', branch: 'Enugu', membership: 'Standard' },
  { id: 'R-246', name: 'Morayo Dada', email: 'morayo.dada@example.test', branch: 'Ibadan', membership: 'Premium' },
];
const fleetSeed = [
  { id: 'FL-308', name: 'Kia Sonet', category: 'Compact SUV', km: 18420, status: 'Ready' },
  { id: 'FL-315', name: 'Peugeot 301', category: 'Sedan', km: 42760, status: 'Service hold' },
  { id: 'FL-329', name: 'Suzuki Ertiga', category: 'MPV', km: 27105, status: 'On hire' },
  { id: 'FL-342', name: 'Nissan Kicks', category: 'Compact SUV', km: 15880, status: 'Service hold' },
];
const clearances = [
  { id: 'CL-851', fleetId: 'FL-315', work: 'Brake pad replacement', inspector: 'Ebi Tamuno' },
  { id: 'CL-867', fleetId: 'FL-342', work: 'Tyre alignment', inspector: 'Zainab Sani' },
];

export const invoice = {
  id: 'INV-7804',
  charges: [
    { label: 'Daily rental', quantity: 3, price: 28000 },
    { label: 'Child seat', quantity: 2, price: 3500 },
    { label: 'Branch drop-off', quantity: 1, price: 6500 },
  ],
};
export const invoiceTotal = invoice.charges.reduce((sum, charge) => sum + charge.quantity * charge.price, 0);
export const pickupTimes = ['08:00', '10:00', '12:00', '14:00'];
export const pickupSlots = [
  { branch: 'Port Harcourt', slots: [3, 0, 2, 1] },
  { branch: 'Uyo', slots: [1, 4, 0, 2] },
  { branch: 'Enugu', slots: [0, 2, 3, 1] },
];
export const reservations = [
  { id: 'BK-6308', renter: 'R-231', total: invoiceTotal, payments: [
    { ref: 'PAY-914', method: 'Bank transfer', amount: 35000 },
    { ref: 'PAY-927', method: 'Card', amount: 15000 },
  ] },
  { id: 'BK-6341', renter: 'R-246', total: 64000, payments: [
    { ref: 'PAY-942', method: 'Card', amount: 64000 },
  ] },
];

export function createTableStore() {
  let renters = structuredClone(renterSeed);
  let fleet = structuredClone(fleetSeed);

  function vehicle(id: string) {
    const found = fleet.find(car => car.id === id);
    if (!found) throw new InputError(404, 'Vehicle not found.');
    return found;
  }

  return {
    get renters() { return renters; },
    get fleet() { return fleet; },
    get queue() { return clearances.filter(item => vehicle(item.fleetId).status === 'Service hold'); },
    reset() {
      renters = structuredClone(renterSeed);
      fleet = structuredClone(fleetSeed);
    },
    loadEmailError() {
      renters.find(renter => renter.id === 'R-246')!.email = 'morayo.dada.example.test';
    },
    editRenter(id: string, body: Record<string, unknown>) {
      const renter = renters.find(row => row.id === id);
      if (!renter) throw new InputError(404, 'Renter not found.');
      const name = field(body, 'name').trim();
      const email = field(body, 'email').trim().toLowerCase();
      const branch = field(body, 'branch');
      const membership = field(body, 'membership');
      if (!name || name.length > 80) throw new InputError(400, 'Enter a full name of up to 80 characters.');
      if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.test$/.test(email)) {
        throw new InputError(400, 'Enter a fictional email address ending in .test.');
      }
      if (renters.some(other => other.id !== id && other.email === email)) throw new InputError(409, 'Another renter uses that email.');
      if (!branches.includes(branch) || !memberships.includes(membership)) throw new InputError(400, 'Choose a listed branch and membership.');
      Object.assign(renter, { name, email, branch, membership });
    },
    editOdometer(id: string, raw: string) {
      const car = vehicle(id);
      if (!/^\d{1,7}$/.test(raw)) throw new InputError(400, 'Enter a whole number from 0 to 9,999,999 km.');
      car.km = Number(raw);
      fleet = [car, ...fleet.filter(other => other.id !== id)];
    },
    release(id: string) {
      const clearance = clearances.find(row => row.id === id);
      if (!clearance) throw new InputError(404, 'Clearance not found.');
      const car = vehicle(clearance.fleetId);
      if (car.status !== 'Service hold') throw new InputError(409, 'This vehicle has already been released.');
      car.status = 'Ready';
      fleet = [car, ...fleet.filter(other => other.id !== car.id)];
    },
  };
}

export type TableStore = ReturnType<typeof createTableStore>;
