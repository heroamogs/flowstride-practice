export interface Car {
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  discountPercent: number;
  finalPriceCents: number;
}

const models = [
  { name: 'Kite', category: 'Hatchback' },
  { name: 'Harbor', category: 'Sedan' },
  { name: 'Mesa', category: 'SUV' },
  { name: 'Orchard', category: 'Wagon' },
  { name: 'Atlas', category: 'Electric' },
];

export const categories = models.map(model => model.category);

export const catalog: Car[] = Array.from({ length: 50 }, (_, index) => {
  const model = models[Math.floor(index / 10)]!;
  const sequence = String(index + 1).padStart(3, '0');
  const priceCents = 1200000 + index * 25000;
  const discountPercent = index % 5 === 0 ? 10 : model.category === 'Electric' ? 5 : 0;
  return {
    sku: 'CAR-' + sequence,
    name: model.name + ' ' + sequence,
    category: model.category,
    priceCents,
    discountPercent,
    finalPriceCents: Math.round(priceCents * (100 - discountPercent) / 100),
  };
});

export const deliveryOptions = {
  pickup: { deliveryCents: 0, nextStep: 'collect' },
  local: { deliveryCents: 12500, nextStep: 'confirm-address' },
  regional: { deliveryCents: 45000, nextStep: 'track-shipment' },
  freight: { deliveryCents: 85000, nextStep: 'book-carrier' },
} as const;

export const memberRoles = ['member', 'approver'] as const;
export type Role = 'admin' | (typeof memberRoles)[number];
export const roleLabels: Record<Role, string> = {
  admin: 'Administrator',
  member: 'Member',
  approver: 'Booking approver',
};

export interface Account {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
}

export function seedAccounts(): Map<string, Account> {
  const accounts: Account[] = [
    { id: 'driver', name: 'Practice Driver', email: 'driver@example.test', password: 'practice-driver', role: 'member' },
    { id: 'admin', name: 'Practice Admin', email: 'admin@example.test', password: 'practice-admin', role: 'admin' },
  ];
  return new Map(accounts.map(account => [account.id, account]));
}
