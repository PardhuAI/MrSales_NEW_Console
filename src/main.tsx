import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/dashboard.css';
import './styles/pages.css';
import './styles/approvals.css';
import './styles/components.css';
import './styles/field.css';
import './styles/sales.css';
import './styles/team.css';
import './styles/office.css';
import './styles/chat.css';
import './styles/pay.css';
import { App } from './App';
import { approvalsStore } from './data/approvals';
import { liveApprovals } from './live/approvals';

import { dashboardStore } from './data/dashboard';
import { loadLiveDashboard } from './live/dashboard';
import { onSignOut } from './live/session';
import { startCrashReporting } from './app/crashReporting';
import { forgetAll } from './data/resource';
import { loadDemo } from './live/client';

startCrashReporting();

// One switch decides where the data comes from; screens never know.
const connect = () => {
  approvalsStore.use(liveApprovals);
  dashboardStore.use(() => loadLiveDashboard(''));
};
connect();
// Nothing read for one login is ever shown to the next.
onSignOut(connect);
onSignOut(forgetAll);

// Demo mode fetches its company first; a live console starts at once.
void loadDemo().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
