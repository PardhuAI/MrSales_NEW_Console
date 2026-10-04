/**
 * Demo data for choosing a direction. Not real figures: the Dashboard says so on
 * screen. Deterministic (a seeded generator), so a reload shows the same day.
 *
 * The shape follows the old console's dashboard (Mr_Sales_Web/src/pages/Dashboard.tsx)
 * so every figure here has a live source later: calls from activities, approvals
 * from the four queues, sales and targets from the commerce tables, attention from
 * pullAttention.
 */

let seed = 20260924;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** The demo's clock: a Thursday afternoon late in the month. */
export const NOW = new Date(2026, 8, 24, 13, 40);
export const DAY_START = 9; // 9 am
export const DAY_END = 19; // 7 pm

export type CallMark = {
  /** Hours since midnight, e.g. 10.5 is 10:30. */
  at: number;
  state: 'done' | 'planned' | 'flagged';
  client: string;
  note?: string;
};

export type Rep = {
  id: string;
  name: string;
  hq: string;
  managerId: string;
  calls: CallMark[];
  monthSales: number;
  monthTarget: number;
};

export type Manager = { id: string; name: string; territory: string };

export const managers: Manager[] = [
  { id: 'm1', name: 'Ravi Teja Varma', territory: 'Hyderabad West' },
  { id: 'm2', name: 'Lakshmi Prasanna', territory: 'Hyderabad East' },
  { id: 'm3', name: 'Mohammed Irfan', territory: 'Warangal' },
  { id: 'm4', name: 'Kavya Reddy', territory: 'Vijayawada' },
];

const repNames: [string, string, string][] = [
  ['Sai Kiran Reddy', 'Madhapur', 'm1'],
  ['Anil Kumar Goud', 'Kukatpally', 'm1'],
  ['Divya Sree', 'Gachibowli', 'm1'],
  ['Pranay Rao', 'Miyapur', 'm1'],
  ['Nikhil Varma', 'Uppal', 'm2'],
  ['Harika Naidu', 'Dilsukhnagar', 'm2'],
  ['Srinivas Chary', 'LB Nagar', 'm2'],
  ['Meghana Rao', 'Secunderabad', 'm2'],
  ['Rahul Yadav', 'Hanamkonda', 'm3'],
  ['Swathi Reddy', 'Kazipet', 'm3'],
  ['Venkatesh Babu', 'Warangal Fort', 'm3'],
  ['Ramya Krishna', 'Subedari', 'm3'],
  ['Kiran Teja', 'Benz Circle', 'm4'],
  ['Pavani Devi', 'Governorpet', 'm4'],
  ['Arjun Reddy', 'Patamata', 'm4'],
  ['Sowmya Lakshmi', 'Labbipet', 'm4'],
];

const doctors = [
  'Dr. Kavitha Rachakonda', 'Dr. Sandeep Vemuri', 'Dr. Farhan Ali', 'Dr. Padmaja Kolli',
  'Sri Sai Medicals', 'Apollo Pharmacy, Hitech City', 'Dr. Ramesh Babu', 'Dr. Anitha Reddy',
  'Care Hospital', 'Dr. Suresh Naidu', 'MedPlus, Kondapur', 'Dr. Lalitha Devi',
  'Dr. Vamshi Krishna', 'Krishna Medical Hall', 'Dr. Haritha Rao', 'Yashoda Hospital',
];

const nowHours = NOW.getHours() + NOW.getMinutes() / 60;

export const reps: Rep[] = repNames.map(([name, hq, managerId], i) => {
  const planned = 7 + Math.floor(rnd() * 3); // 7 to 9 calls
  const quiet = name === 'Nikhil Varma'; // has not logged a call today
  let t = DAY_START + 0.4 + rnd() * 0.6;
  const calls: CallMark[] = [];
  for (let c = 0; c < planned; c++) {
    const at = Math.min(t, DAY_END - 0.3);
    const past = at < nowHours;
    let state: CallMark['state'] = past && !quiet ? 'done' : 'planned';
    let note: string | undefined;
    if (name === 'Sai Kiran Reddy' && c === 2) {
      state = 'flagged';
      note = 'Fake location app detected. The visit was blocked.';
    }
    calls.push({ at, state, client: doctors[(i * 3 + c) % doctors.length], note });
    t += 0.75 + rnd() * 0.55;
  }
  const target = [7, 6, 6.5, 5.5][managers.findIndex(m => m.id === managerId)] * 100000 / 4;
  const pace = 0.35 + rnd() * 0.75;
  return {
    id: `r${i + 1}`,
    name,
    hq,
    managerId,
    calls,
    monthTarget: Math.round(target / 1000) * 1000,
    monthSales: Math.round((target * pace) / 100) * 100,
  };
});

export const today = (() => {
  const all = reps.flatMap(r => r.calls);
  const due = all.filter(c => c.at < nowHours);
  const done = all.filter(c => c.state === 'done').length;
  const active = reps.filter(r => r.calls.some(c => c.state === 'done')).length;
  return {
    planned: all.length,
    dueByNow: due.length,
    done,
    toGo: all.length - done,
    active,
    team: reps.length,
  };
})();

export type Attention = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  reason: string;
  action: string;
  to: string;
};

export const attention: Attention[] = [
  {
    id: 'a1',
    severity: 'critical',
    title: 'Sai Kiran Reddy tried to log a visit with a fake location',
    reason: 'At Dr. Padmaja Kolli, 11:12 am. Blocked. The last genuine position was 2.4 km away.',
    action: 'Open their day',
    to: '/field',
  },
  {
    id: 'a2',
    severity: 'critical',
    title: 'Two of Anil Kumar Goud\'s journeys do not add up',
    reason: '18 km in 9 minutes on Tuesday, between Kukatpally and Gachibowli.',
    action: 'See both visits',
    to: '/field',
  },
  {
    id: 'a3',
    severity: 'warning',
    title: 'Nikhil Varma has not logged a call today',
    reason: '8 calls planned in Uppal. The day plan was filed at 9:05 am.',
    action: 'Open their day',
    to: '/field',
  },
  {
    id: 'a4',
    severity: 'warning',
    title: '2 expense claims have waited more than 5 days',
    reason: 'The oldest is Harika Naidu\'s August claim, 9 days.',
    action: 'Review claims',
    to: '/approvals',
  },
  {
    id: 'a5',
    severity: 'info',
    title: '6 clients have no registered location',
    reason: 'Visits to them cannot be checked against the 50 m radius.',
    action: 'Fix in clients',
    to: '/clients/quality',
  },
];



export const month = (() => {
  const sales = reps.reduce((s, r) => s + r.monthSales, 0);
  const target = reps.reduce((s, r) => s + r.monthTarget, 0);
  return {
    label: 'September',
    sales,
    target,
    activeClients: 1284,
    newClients: 37,
    workingDaysLeft: 5,
  };
})();

/** Twelve months, sales against target, in rupees. The last one is month to date. */
export const year = [
  ['Oct', 0.86], ['Nov', 0.91], ['Dec', 0.78], ['Jan', 0.95], ['Feb', 1.02], ['Mar', 1.11],
  ['Apr', 0.84], ['May', 0.88], ['Jun', 0.97], ['Jul', 1.04], ['Aug', 0.93],
].map(([m, r]) => ({
  month: m as string,
  target: month.target,
  sales: Math.round(month.target * (r as number)),
})).concat([{ month: 'Sep', target: month.target, sales: month.sales }]);

export const managerRows = managers.map(m => {
  const team = reps.filter(r => r.managerId === m.id);
  const sales = team.reduce((s, r) => s + r.monthSales, 0);
  const target = team.reduce((s, r) => s + r.monthTarget, 0);
  const calls = team.flatMap(r => r.calls);
  const due = calls.filter(c => c.at < nowHours).length;
  const done = calls.filter(c => c.state === 'done').length;
  return { ...m, team: team.length, sales, target, done, due };
});

export const performers = (() => {
  const ranked = [...reps]
    .map(r => ({ ...r, share: r.monthSales / r.monthTarget }))
    .sort((a, b) => b.share - a.share);
  return { top: ranked.slice(0, 3), low: ranked.slice(-3).reverse() };
})();

export { nowHours };
