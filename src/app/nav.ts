import {
  ChartLineUp,
  CheckSquareOffset,
  FileText,
  GearSix,
  House,
  MapTrifold,
  Megaphone,
  Stethoscope,
  UsersThree,
  Wallet,
  type Icon,
} from '@phosphor-icons/react';

/**
 * The whole console in one place: every section, every page, what each is for,
 * the words people use when looking for it, and the module that grants it.
 *
 * The sidebar, the tabs, the hover preview, the search and the permission
 * check all read this file, so they cannot disagree. Every page of the old
 * console is here (FEATURE_CHECKLIST.md); nothing sits behind a folder.
 */

export type Page = {
  path: string;
  label: string;
  /** One line: what an official comes here to do. */
  about: string;
  /** The module in the old console's role matrix that grants this page. */
  module: string;
  /** Other words people use for it, so search finds it. */
  keywords?: string[];
  /** What the rebuilt page will hold (from FEATURE_CHECKLIST.md). */
  will?: string[];
};

export type Section = {
  id: string;
  label: string;
  icon: Icon;
  pages: Page[];
};

export const SECTIONS: Section[] = [
  {
    id: 'home', label: 'Home', icon: House,
    pages: [
      {
        path: '/', label: 'Today', module: 'dashboard',
        about: 'How the field is doing, what needs you, and the month so far.',
        keywords: ['dashboard', 'home', 'overview', 'summary'],
      },
      {
        path: '/attention', label: 'Needs attention', module: 'attention',
        about: 'Everything that looks wrong, ranked, with the reason and where to look.',
        keywords: ['alerts', 'exceptions', 'fake location', 'mock gps', 'travel', 'problems', 'issues'],
        will: [
          'Fake locations, journeys that do not add up, reps who went quiet',
          'Claims waiting too long and clients missing from the master',
          'Each with the reason and a link to the day or record',
        ],
      },
    ],
  },
  {
    id: 'approvals', label: 'Approvals', icon: CheckSquareOffset,
    pages: [
      {
        path: '/approvals', label: 'Waiting for you', module: 'approvals',
        about: 'Expense claims, orders, tour plans and leave waiting for a decision.',
        keywords: ['approve', 'reject', 'pending', 'claims', 'leave requests', 'tour plan approval', 'orders approval', 'queue'],
        will: [
          'Grouped by person, approve all or one at a time',
          'Bills that need checking listed first',
          'Reject with a reason, always',
        ],
      },
      {
        path: '/approvals/decided', label: 'Decided', module: 'approvals',
        about: 'What was approved or rejected, by whom, when and why.',
        keywords: ['history', 'approved', 'rejected', 'audit of decisions'],
      },
    ],
  },
  {
    id: 'field', label: 'Field', icon: MapTrifold,
    pages: [
      {
        path: '/field', label: 'Activity', module: 'field',
        about: 'Every field person for a day: calls made, missed and checked.',
        keywords: ['field activity', 'visits', 'calls', 'dcr', 'gps', 'location', 'map', 'reps today', 'verified'],
        will: [
          'Filter by date, territory, area, headquarters, manager, GPS',
          'Open any person\'s day: timeline, map, call reports, photos, prescription audit',
        ],
      },
      {
        path: '/field/day-plans', label: 'Day plans', module: 'field',
        about: 'Who declared their day, and where they planned to work.',
        keywords: ['intimation', 'day plan', 'declared', 'morning plan'],
      },
      {
        path: '/field/tour-plans', label: 'Tour plans', module: 'tours',
        about: 'Each person\'s month as planned, and months that cannot be submitted.',
        keywords: ['tour', 'monthly plan', 'tp', 'beat plan'],
      },
      {
        path: '/field/coverage', label: 'Coverage', module: 'coverage',
        about: 'Which areas were visited this week, which went quiet, and occasions worth a call.',
        keywords: ['areas', 'quiet', 'untouched', 'birthdays', 'anniversaries'],
      },
    ],
  },
  {
    id: 'clients', label: 'Clients', icon: Stethoscope,
    pages: [
      {
        path: '/clients', label: 'All clients', module: 'clients',
        about: 'Doctors, hospitals, chemists and stockists the field calls on.',
        keywords: ['doctors', 'chemists', 'hospitals', 'listed', 'unlisted', 'specialty', 'import clients', 'master'],
        will: [
          'Search, filter by type and listing, add and edit',
          'Import from a spreadsheet, download the client sheet',
          'Specialties list',
        ],
      },
      {
        path: '/clients/quality', label: 'Data quality', module: 'clients',
        about: 'Duplicates, clients with no location or owner, and clients nobody has visited.',
        keywords: ['duplicates', 'no location', 'unassigned', 'cleanup', 'fix'],
      },
      {
        path: '/clients/complaints', label: 'Complaints', module: 'complaints',
        about: 'What clients raised through the field, and who is handling it.',
        keywords: ['complaint', 'issue', 'grievance'],
      },
    ],
  },
  {
    id: 'sales', label: 'Sales', icon: ChartLineUp,
    pages: [
      {
        path: '/sales', label: 'Sales', module: 'sales',
        about: 'Primary and secondary sales against target, by month and by person.',
        keywords: ['revenue', 'primary', 'secondary', 'achievement'],
      },
      {
        path: '/sales/orders', label: 'Orders', module: 'orders',
        about: 'Orders taken in the field, their approval and fulfilment.',
        keywords: ['order', 'pob', 'booking', 'invoice'],
      },
      {
        path: '/sales/targets', label: 'Targets', module: 'targets',
        about: 'Each person\'s target by month, and assigning new ones.',
        keywords: ['target', 'quota', 'assign target', 'goals'],
      },
      {
        path: '/sales/prescriptions', label: 'Prescription audit', module: 'rcpa',
        about: 'Our share of prescriptions, and the competitors taking it.',
        keywords: ['rcpa', 'competitor', 'share', 'prescription'],
      },
      {
        path: '/sales/products', label: 'Products', module: 'products',
        about: 'The product list and prices the phone takes orders from.',
        keywords: ['product', 'sku', 'price list', 'mrp', 'pts', 'ptr', 'import products'],
      },
      {
        path: '/sales/stockists', label: 'Stockists', module: 'stockists',
        about: 'Distributors who supply orders, and which ones the phone can pick.',
        keywords: ['stockist', 'distributor', 'cnf', 'supplier', 'gstin'],
      },
      {
        path: '/sales/stock', label: 'Stock', module: 'stock',
        about: 'Batches in the market, their value, and stock arriving or written off.',
        keywords: ['inventory', 'batch', 'expiry', 'write off'],
      },
    ],
  },
  {
    id: 'team', label: 'Team', icon: UsersThree,
    pages: [
      {
        path: '/team', label: 'People', module: 'people',
        about: 'Everyone in the company: find a person, open their record, add someone new.',
        keywords: ['employees', 'staff', 'reps', 'mr', 'asm', 'add employee', 'onboarding', 'documents', 'deactivate', 'left'],
        will: [
          'Search and filter by role, manager, territory, band',
          'Each person\'s record: field work, sales, leave, expenses, documents',
          'Add a person, change their manager, hand over clients, mark as left',
        ],
      },
      {
        path: '/team/managers', label: 'Managers', module: 'people',
        about: 'Each manager\'s team side by side: calls, sales against target, who leads and who trails.',
        keywords: ['manager-wise', 'teams', 'asm view'],
      },
      {
        path: '/team/org-chart', label: 'Org chart', module: 'org',
        about: 'Who reports to whom, and moving people between managers.',
        keywords: ['hierarchy', 'reporting', 'tree', 'organisation', 'move', 'reassign manager'],
      },
      {
        path: '/team/attendance', label: 'Attendance', module: 'attendance',
        about: 'Who was present, on leave or off, for every day of the month.',
        keywords: ['present', 'absent', 'muster'],
      },
      {
        path: '/team/leave', label: 'Leave', module: 'leave',
        about: 'Leave requests from the phone and the leave rules.',
        keywords: ['leave requests', 'time off', 'balance', 'casual leave', 'sick leave'],
      },
      {
        path: '/team/tasks', label: 'Tasks', module: 'tasks',
        about: 'Work handed to people, with the date it is wanted by.',
        keywords: ['assign task', 'to do', 'assignments'],
      },
    ],
  },
  {
    id: 'money', label: 'Expenses and pay', icon: Wallet,
    pages: [
      {
        path: '/money', label: 'Expense claims', module: 'expenses',
        about: 'Each person\'s monthly claim, day by day, with bills.',
        keywords: ['expenses', 'claims', 'da', 'ta', 'allowance', 'travel', 'bills', 'receipts', 'reimbursement'],
      },
      {
        path: '/money/payroll', label: 'Payroll', module: 'payroll',
        about: 'Payslips for the month, released and downloaded.',
        keywords: ['salary', 'payslip', 'pay', 'lop', 'loss of pay'],
      },
    ],
  },
  {
    id: 'share', label: 'Share with field', icon: Megaphone,
    pages: [
      {
        path: '/share', label: 'Resources', module: 'resources',
        about: 'Visual aids, price lists and training files, sent to every phone.',
        keywords: ['visual aid', 'detailing', 'brochure', 'pdf', 'training', 'upload file'],
      },
      {
        path: '/share/surveys', label: 'Surveys', module: 'surveys',
        about: 'Questions the field asks clients, and what they answered.',
        keywords: ['feedback', 'questionnaire', 'brand recall'],
      },
      {
        path: '/share/messages', label: 'Messages', module: 'chat',
        about: 'Write to anyone on your team; it reaches their phone, and their replies come here.',
        keywords: ['chat', 'message', 'conversation', 'talk', 'whatsapp', 'write to'],
      },
      {
        path: '/share/sent', label: 'Sent notifications', module: 'notifications',
        about: 'Every message the phones received, and who it reached.',
        keywords: ['notifications', 'messages', 'alerts sent', 'push'],
      },
    ],
  },
  {
    id: 'reports', label: 'Reports', icon: FileText,
    pages: [
      {
        path: '/reports', label: 'Reports', module: 'reports',
        about: 'DCR, visits, sales, targets, attendance, leave, expenses, clients and orders.',
        keywords: ['report', 'dcr', 'mis', 'analysis', 'management overview', 'adherence'],
      },
      {
        path: '/reports/downloads', label: 'Downloads', module: 'exports',
        about: 'Excel sheets in the office\'s own format, for any person and month.',
        keywords: ['export', 'excel', 'xlsx', 'download', 'sheet', 'csv'],
      },
    ],
  },
  {
    id: 'settings', label: 'Settings', icon: GearSix,
    pages: [
      {
        path: '/settings', label: 'All settings', module: 'config',
        about: 'Company rules, geography, roles, logins and the audit log, in one place.',
        keywords: ['settings', 'configuration', 'setup', 'preferences'],
      },
      {
        path: '/settings/rules', label: 'Company rules', module: 'config',
        about: 'Daily allowance, bill limit, week off, and the visit radius.',
        keywords: ['da', 'daily allowance', 'geo fence', 'radius', '50 m', 'week off', 'bill limit', 'receipt'],
      },
      {
        path: '/settings/geography', label: 'Geography', module: 'geo',
        about: 'Regions, territories, areas and clusters.',
        keywords: ['region', 'territory', 'area', 'cluster', 'hq', 'headquarters', 'zone'],
      },
      {
        path: '/settings/roles', label: 'Roles', module: 'roles',
        about: 'What your company calls its people, and which app each opens.',
        keywords: ['designation', 'role names', 'mr', 'asm', 'tbm'],
      },
      {
        path: '/settings/logins', label: 'Logins and access', module: 'users',
        about: 'Office logins and phone logins: invite, reset, suspend.',
        keywords: ['users', 'login', 'password', 'reset password', 'invite', 'access', 'phone login', 'permissions'],
      },
      {
        path: '/settings/hr', label: 'HR rules', module: 'hr',
        about: 'Leave types, holidays, salary structure and expense rules.',
        keywords: ['holidays', 'leave types', 'salary structure', 'policy'],
      },
      {
        path: '/settings/ownership', label: 'Field ownership', module: 'ownership',
        about: 'Who owns which field on a record.',
        keywords: ['ownership', 'data owner'],
      },
      {
        path: '/settings/audit', label: 'Audit log', module: 'audit',
        about: 'Every change made in the console, kept for ever.',
        keywords: ['audit', 'history', 'changes', 'log', 'who changed'],
      },
    ],
  },
];

/** Pages reached from the account menu rather than the sidebar. */
export const ACCOUNT_PAGES: Page[] = [
  {
    path: '/help', label: 'Help from Mr Sales', module: 'help',
    about: 'Ask the Mr Sales team for help, and follow your requests.',
    keywords: ['support', 'ticket', 'help', 'contact'],
  },
  {
    path: '/billing', label: 'Plan and billing', module: 'billing',
    about: 'Your plan, field seats used, and invoices.',
    keywords: ['invoice', 'plan', 'seats', 'payment', 'subscription'],
  },
];

/** Things people create, offered from the New button and from search. */
export type Action = { label: string; path: string; module: string; keywords?: string[] };

export const NEW_ACTIONS: Action[] = [
  { label: 'Add a person', path: '/team/new', module: 'onboarding', keywords: ['employee', 'onboard', 'hire', 'joiner'] },
  { label: 'Add a client', path: '/clients/new', module: 'clients', keywords: ['doctor', 'chemist'] },
  { label: 'Assign a target', path: '/sales/targets/new', module: 'targets' },
  { label: 'Assign a task', path: '/team/tasks/new', module: 'tasks' },
  { label: 'Add a product', path: '/sales/products/new', module: 'products' },
  { label: 'Add a stockist', path: '/sales/stockists/new', module: 'stockists' },
  { label: 'Upload a resource', path: '/share/new', module: 'resources', keywords: ['visual aid', 'file'] },
  { label: 'Start a survey', path: '/share/surveys/new', module: 'surveys' },
  { label: 'Declare a holiday', path: '/settings/hr/holiday', module: 'hr' },
  { label: 'Invite an office user', path: '/settings/logins/invite', module: 'users', keywords: ['login', 'access'] },
];

export const allPages = (): Page[] => [...SECTIONS.flatMap(s => s.pages), ...ACCOUNT_PAGES];

export const sectionOf = (path: string): Section | undefined =>
  SECTIONS.find(s => s.pages.some(p => p.path === path))
  ?? SECTIONS.find(s => s.pages.some(p => p.path !== '/' && path.startsWith(`${p.path}/`)));

export const pageOf = (path: string): Page | undefined =>
  allPages().find(p => p.path === path);
