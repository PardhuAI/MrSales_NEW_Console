import { useEffect, useState } from 'react';
import { isLive, supabase } from '../live/client';

type IncidentNotice = {
  incident_id: string;
  service: string;
  status: string;
  body: string;
  updated_at: string;
};

export function IncidentNotices() {
  const [notices, setNotices] = useState<IncidentNotice[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!isLive || !client) return;
    let active = true;
    const load = async () => {
      const { data, error } = await client.rpc('my_incident_notices');
      if (active) setNotices(error ? [] : (data ?? []) as IncidentNotice[]);
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, []);

  if (!notices.length) return null;
  return <div className="incident-notices" aria-label="Service notices">
    {notices.map((notice) => <div key={notice.incident_id} className={`incident-notice${notice.status === 'resolved' ? ' resolved' : ''}`} role="status">
      <strong>{notice.status === 'resolved' ? 'Service restored' : 'Service interruption'}</strong>
      <span>{notice.body}</span>
    </div>)}
  </div>;
}
