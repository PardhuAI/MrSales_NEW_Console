import { type Decision, type ExpenseDay, type Pending, type Person } from '../data/approvals';

/** Demo approvals: labelled sample data, used when no backend is configured. */

export const DEMO_ALLOWANCE = 250;

export const DEMO_NOW = new Date(2026, 8, 24, 13, 40);

export const demoPeople: Person[] = [
  { id: 'p-harika', name: 'Harika Naidu', hq: 'Dilsukhnagar', territory: 'Hyderabad East', manager: 'Lakshmi Prasanna' },
  { id: 'p-sai', name: 'Sai Kiran Reddy', hq: 'Madhapur', territory: 'Hyderabad West', manager: 'Ravi Teja Varma' },
  { id: 'p-kiran', name: 'Kiran Teja', hq: 'Benz Circle', territory: 'Vijayawada', manager: 'Kavya Reddy' },
  { id: 'p-anil', name: 'Anil Kumar Goud', hq: 'Kukatpally', territory: 'Hyderabad West', manager: 'Ravi Teja Varma' },
  { id: 'p-meghana', name: 'Meghana Rao', hq: 'Secunderabad', territory: 'Hyderabad East', manager: 'Lakshmi Prasanna' },
  { id: 'p-pavani', name: 'Pavani Devi', hq: 'Governorpet', territory: 'Vijayawada', manager: 'Kavya Reddy' },
  { id: 'p-rahul', name: 'Rahul Yadav', hq: 'Hanamkonda', territory: 'Warangal', manager: 'Mohammed Irfan' },
  { id: 'p-divya', name: 'Divya Sree', hq: 'Gachibowli', territory: 'Hyderabad West', manager: 'Ravi Teja Varma' },
  { id: 'p-swathi', name: 'Swathi Reddy', hq: 'Kazipet', territory: 'Warangal', manager: 'Mohammed Irfan' },
  { id: 'p-arjun', name: 'Arjun Reddy', hq: 'Patamata', territory: 'Vijayawada', manager: 'Kavya Reddy' },
  { id: 'p-srinivas', name: 'Srinivas Chary', hq: 'LB Nagar', territory: 'Hyderabad East', manager: 'Lakshmi Prasanna' },
  { id: 'p-ramya', name: 'Ramya Krishna', hq: 'Subedari', territory: 'Warangal', manager: 'Mohammed Irfan' },
];

const day = (d: number, m = 8) => new Date(2026, m - 1, d).toISOString();
const sent = (daysAgo: number) => new Date(DEMO_NOW.getTime() - daysAgo * 86_400_000 - 3_600_000).toISOString();

const expenseDays = (personId: string, month: number, dates: number[], station: string, submitted: number, extras: Record<number, Partial<ExpenseDay>> = {}): ExpenseDay[] =>
  dates.map(d => ({
    kind: 'expense',
    id: `e-${personId}-${month}-${d}`,
    personId,
    submittedAt: sent(submitted),
    date: day(d, month),
    amount: DEMO_ALLOWANCE,
    categories: ['Daily allowance'],
    station,
    bills: [],
    ...extras[d],
  }));

export const demoPending: Pending[] = [
  ...expenseDays('p-harika', 8, [3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 18], 'Dilsukhnagar', 9, {
    12: { amount: 1180, categories: ['Daily allowance', 'Travel'], station: 'Shamshabad', reason: 'Stockist meeting at Shamshabad, cab both ways.', bill: 'Cab receipt, ₹930', bills: [] },
    17: { amount: 640, categories: ['Daily allowance', 'Courier'], reason: 'Couriered samples to Dr. Lalitha Devi.', bill: 'Courier slip, ₹390', bills: [] },
  }),
  ...expenseDays('p-sai', 9, [1, 2, 3, 4, 5, 8], 'Madhapur', 6, {
    4: { amount: 920, categories: ['Daily allowance', 'Travel'], station: 'Nalgonda', reason: 'Train to Nalgonda for the CME at the district hospital.', bill: 'Train ticket, ₹670', bills: [] },
  }),
  ...expenseDays('p-kiran', 9, [14, 15, 16, 17], 'Benz Circle', 2),
  { kind: 'order', id: 'o-1', personId: 'p-anil', submittedAt: sent(2), number: 'ORD-2409-118', client: 'Sri Sai Medicals', stockist: 'Mahavir Pharma Distributors', lines: 6, value: 48200, discount: 4, slab: 5 },
  { kind: 'order', id: 'o-2', personId: 'p-anil', submittedAt: sent(1), number: 'ORD-2409-124', client: 'Apollo Pharmacy, Hitech City', stockist: 'Mahavir Pharma Distributors', lines: 9, value: 61800, discount: 5, slab: 5 },
  { kind: 'order', id: 'o-3', personId: 'p-meghana', submittedAt: sent(1), number: 'ORD-2409-127', client: 'Krishna Medical Hall', stockist: 'Deccan Healthcare', lines: 4, value: 22400, discount: 12, slab: 6 },
  { kind: 'order', id: 'o-4', personId: 'p-pavani', submittedAt: sent(0), number: 'ORD-2409-131', client: 'MedPlus, Governorpet', stockist: 'Krishna District Pharma', lines: 5, value: 31700, discount: 3, slab: 5 },
  { kind: 'order', id: 'o-5', personId: 'p-rahul', submittedAt: sent(0), number: 'ORD-2409-133', client: 'Care Hospital Pharmacy', stockist: 'Kakatiya Medical Agencies', lines: 3, value: 20500, discount: 5, slab: 5 },
  { kind: 'tour', id: 't-1', personId: 'p-divya', submittedAt: sent(4), month: 'October 2026', workingDays: 26, plannedDays: 26, clients: 148, outstation: 2 },
  { kind: 'tour', id: 't-2', personId: 'p-swathi', submittedAt: sent(3), month: 'October 2026', workingDays: 26, plannedDays: 24, clients: 131, outstation: 4 },
  { kind: 'tour', id: 't-3', personId: 'p-arjun', submittedAt: sent(1), month: 'October 2026', workingDays: 26, plannedDays: 26, clients: 156, outstation: 1 },
  { kind: 'leave', id: 'l-1', personId: 'p-srinivas', submittedAt: sent(1), leaveType: 'Casual leave', from: day(29, 9), to: day(30, 9), days: 2, reason: 'Sister\'s wedding in Khammam.', balanceAfter: 4 },
  { kind: 'leave', id: 'l-2', personId: 'p-ramya', submittedAt: sent(0), leaveType: 'Sick leave', from: day(25, 9), to: day(25, 9), days: 1, reason: 'Fever since last night.', balanceAfter: 6 },
];

export const demoDecided: Decision[] = [
  { id: 'd-1', kind: 'expense', personId: 'p-divya', summary: 'August claim, 21 days', value: 6150, approved: true, by: 'Ravi Teja Varma', at: sent(1) },
  { id: 'd-2', kind: 'order', personId: 'p-kiran', summary: 'ORD-2409-102 · Benz Circle Medicals', value: 38400, approved: true, by: 'Kavya Reddy', at: sent(1) },
  { id: 'd-3', kind: 'expense', personId: 'p-rahul', summary: '12 August · ₹1,450', value: 1450, approved: false, reason: 'No bill attached for the cab. Please add it and resend.', by: 'Mohammed Irfan', at: sent(2) },
  { id: 'd-4', kind: 'leave', personId: 'p-meghana', summary: 'Casual leave, 1 day · 19 September', approved: true, by: 'Lakshmi Prasanna', at: sent(3) },
  { id: 'd-5', kind: 'tour', personId: 'p-sai', summary: 'October 2026', approved: false, reason: 'Five working days have no clients planned.', by: 'Ravi Teja Varma', at: sent(3) },
  { id: 'd-6', kind: 'order', personId: 'p-swathi', summary: 'ORD-2409-097 · Kazipet Drug House', value: 27600, approved: true, by: 'Mohammed Irfan', at: sent(4) },
];

