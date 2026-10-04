import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/dashboard.css';
import './styles/pages.css';
import './styles/approvals.css';
import { App } from './App';
import { approvalsStore } from './data/approvals';
import { demoApprovals } from './demo/approvalsSource';
import { liveApprovals } from './live/approvals';
import { isLive } from './live/client';

import { dashboardStore } from './data/dashboard';
import { loadDemoDashboard } from './demo/dashboard';
import { loadLiveDashboard } from './live/dashboard';
import { onSignOut } from './live/session';

// One switch decides where the data comes from; screens never know.
const connect = () => {
  approvalsStore.use(isLive ? liveApprovals : demoApprovals);
  dashboardStore.use(isLive ? () => loadLiveDashboard('') : loadDemoDashboard);
};
connect();
// Nothing read for one login is ever shown to the next.
onSignOut(connect);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
