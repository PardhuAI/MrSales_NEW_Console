import type { DashboardModel } from '../data/dashboard';
import { DAY_END, DAY_START, NOW, attention, managerRows, managers, month, nowHours, performers, reps, today, year } from './world';

/** The demo world as a Dashboard model: the same shape the live loader returns. */
export async function loadDemoDashboard(): Promise<DashboardModel> {
  const groups = managers.map(m => ({
    label: `${m.territory}`,
    people: reps.filter(r => r.managerId === m.id).map(r => ({ id: r.id, name: r.name, hq: r.hq, calls: r.calls })),
  }));
  const figures = {
    planned: today.planned,
    done: today.done,
    missed: 0,
    started: 0,
    dueByNow: today.dueByNow,
    active: today.active,
    team: today.team,
  };
  const trend = Array.from({ length: 20 }, (_, i) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() - (27 - i));
    const done = 90 + ((i * 37) % 31);
    return { date: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), done, missed: 6 + ((i * 7) % 9) };
  }).filter(t => new Date(t.date).getDay() !== 0);
  return {
    demo: true,
    orgName: 'Cleocure Lifesciences',
    now: NOW,
    today: { date: NOW, state: 'working', ...figures },
    shown: { date: NOW, isToday: true, startHour: DAY_START, endHour: DAY_END, groups, ...figures },
    attention,
    month: {
      label: month.label,
      sales: month.sales,
      target: month.target,
      previous: null,
      callsDone: 1611,
      verifiedShare: 0.91,
      clientsVisited: month.activeClients,
      clientsTotal: 1480,
      newClients: month.newClients,
      workingDaysLeft: month.workingDaysLeft,
      year: year.map(y => ({ month: y.month, sales: y.sales, target: y.target })),
    },
    trend,
    managers: managerRows.map(m => ({
      id: m.id, name: m.name, territory: m.territory, team: m.team,
      doneWeek: m.done * 3, plannedWeek: m.due * 3 + 4, verifiedShare: 0.9, sales: m.sales, target: m.target,
    })),
    ranks: {
      basis: 'target',
      top: performers.top.map(p => ({ id: p.id, name: p.name, hq: p.hq, value: `${Math.round(p.share * 100)}%` })),
      low: performers.low.map(p => ({ id: p.id, name: p.name, hq: p.hq, value: `${Math.round(p.share * 100)}%` })),
    },
  };
  void nowHours;
}
