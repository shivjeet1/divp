export interface Section {
  id: string;
  label: string;
  group: string;
  blurb: string;
}

export const SECTIONS: Section[] = [
  {
    id: 'overview',
    label: 'Overview',
    group: 'Introduction',
    blurb: 'What the project is, the stack, and how to read this portal.',
  },
  {
    id: 'architecture',
    label: 'Architecture',
    group: 'Introduction',
    blurb: 'Components, the trust split, the data model and the backend module map.',
  },
  {
    id: 'pipeline',
    label: 'Auth pipeline',
    group: 'Flows',
    blurb: 'Interactive walkthrough of the 12 stages from config to logout.',
  },
  {
    id: 'flows',
    label: 'State & flows',
    group: 'Flows',
    blurb: 'Frontend state machine, dashboard surfaces, admin writes and self-registration.',
  },
  {
    id: 'api',
    label: 'API reference',
    group: 'Reference',
    blurb: 'Every endpoint, request/response payload and error code.',
  },
  {
    id: 'security',
    label: 'Security',
    group: 'Reference',
    blurb: 'Security properties, the threat model and the 10 blocked attacks.',
  },
  {
    id: 'setup',
    label: 'Setup & commands',
    group: 'Guide',
    blurb: 'Prerequisites, the quick start, seeded accounts and the command table.',
  },
  {
    id: 'tests',
    label: 'Test matrix',
    group: 'Guide',
    blurb: 'What is tested, at which layer, and how to run the whole battery.',
  },
];

export const SECTION_GROUPS: string[] = ['Introduction', 'Flows', 'Reference', 'Guide'];

export const DEFAULT_SECTION = 'overview';
