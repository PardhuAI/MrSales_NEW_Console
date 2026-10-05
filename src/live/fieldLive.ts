import { useEffect } from 'react';
import { invalidate } from '../data/resource';
import { dashboardStore } from '../data/dashboard';
import { isLive, supabase } from './client';
import { useMe } from './session';

/**
 * The field as it happens, on the pages that watch it (Today and Field).
 *
 * The database announces every visit and day plan written (migration 0103),
 * through row-level security, so a manager hears only their own team. On news
 * the page reads again, at most once every ten seconds, so a busy morning of
 * visits is a few reads, not hundreds. One connection while such a page is
 * open, none otherwise; the minute-by-minute read covers anything missed.
 */
const QUIET = 10_000;

export function useFieldLive(alsoToday = false) {
  const me = useMe();
  useEffect(() => {
    if (!isLive || !supabase || me.demo) return;
    let last = 0;
    let timer: number | undefined;
    const readAgain = () => {
      timer = undefined;
      last = Date.now();
      invalidate('field:', 'team:');
      if (alsoToday) void dashboardStore.load();
    };
    const news = () => {
      if (timer) return;
      const wait = Math.max(1_500, QUIET - (Date.now() - last));
      timer = window.setTimeout(readAgain, wait);
    };
    const filter = `org_id=eq.${me.orgId}`;
    const channel = supabase
      .channel(`field-live:${me.orgId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter }, news)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_plans', filter }, news)
      .subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [me.orgId, me.demo, alsoToday]);
}
