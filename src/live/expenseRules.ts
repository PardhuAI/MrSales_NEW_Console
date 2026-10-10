/**
 * Each person's daily allowance and bill threshold, in the order the database
 * decides them (expense_rule_for, 0109): the person's own figure, else their
 * role's (Pay setup), else the company's (Company rules). Each figure falls
 * back on its own, as the database's does.
 *
 * One answer for every screen that compares a claim with the allowance:
 * Claims, Approvals and Home. They each read the company figure once, so a
 * medical representative at ₹350 and an area manager at ₹500 were measured
 * against the same number, and an area manager's ordinary day read as "over".
 */
import { db } from './client';

export type RuleFrom = 'person' | 'role' | 'company';

export type ExpenseRule = { allowance: number; billAbove: number; from: RuleFrom };

export type ExpenseRuleOf = (personId: string) => ExpenseRule;

/** Words for where a person's allowance comes from, after the figure. */
export const RULE_FROM: Record<RuleFrom, string> = {
  person: 'their own figure',
  role: "their role's figure",
  company: "the company's figure",
};

export async function expenseRulesFor(company: { allowance: number; billAbove: number }): Promise<ExpenseRuleOf> {
  const sb = db();
  const [people, roles, own] = await Promise.all([
    sb.from('employees').select('id, designation_id'),
    sb.from('expense_rules').select('designation_id, daily_allowance, receipt_threshold').not('designation_id', 'is', null),
    sb.from('employee_expense_rules').select('employee_id, daily_allowance, receipt_threshold'),
  ]);
  const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
  // A project without the policy tables (0104, 0109) has only the company figure.
  const roleRule = new Map(roles.error ? [] : (roles.data ?? []).map(r => [r.designation_id as string, { allowance: n(r.daily_allowance), billAbove: n(r.receipt_threshold) }]));
  const ownRule = new Map(own.error ? [] : (own.data ?? []).map(r => [r.employee_id as string, { allowance: n(r.daily_allowance), billAbove: n(r.receipt_threshold) }]));
  const roleOf = new Map(people.error ? [] : (people.data ?? []).map(p => [p.id as string, p.designation_id as string | null]));
  return id => {
    const mine = ownRule.get(id);
    const role = roleOf.get(id);
    const theirs = role ? roleRule.get(role) : undefined;
    const allowance = mine?.allowance ?? theirs?.allowance ?? company.allowance;
    const billAbove = mine?.billAbove ?? theirs?.billAbove ?? company.billAbove;
    const from: RuleFrom = mine?.allowance != null ? 'person' : theirs?.allowance != null ? 'role' : 'company';
    return { allowance, billAbove, from };
  };
}
