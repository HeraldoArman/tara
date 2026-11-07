/* ==========================================================================
   TARa — demo data
   All content is fictional and used for the frontend prototype.
   ========================================================================== */

window.TARa = window.TARa || {};

/* --------------------------------------------------------------------------
   Icons
   -------------------------------------------------------------------------- */

TARa.ICON = {
  camera:
    '<path d="M3 8.6A2.6 2.6 0 0 1 5.6 6h1.7l1.2-1.9h7L16.7 6h1.7A2.6 2.6 0 0 1 21 8.6v8.8A2.6 2.6 0 0 1 18.4 20H5.6A2.6 2.6 0 0 1 3 17.4Z"/><circle cx="12" cy="13" r="3.4"/>',
  check: '<path d="m4.5 12.5 5 5L20 6.8"/>',
  checkCircle:
    '<circle cx="12" cy="12" r="8.6"/><path d="m8.3 12.4 2.6 2.6 5-5.4"/>',
  alert: '<path d="M12 4.2 21 20H3Z"/><path d="M12 10v4.2"/><path d="M12 17.4h.01"/>',
  lock:
    '<rect x="4.5" y="10.5" width="15" height="10" rx="2.4"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>',
  mic:
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.4 11.2a6.6 6.6 0 0 0 13.2 0"/><path d="M12 17.8V21"/><path d="M9 21h6"/>',
  micOff:
    '<path d="M9 9v2a3 3 0 0 0 4.5 2.6"/><path d="M15 10.5V6a3 3 0 0 0-5.6-1.5"/><path d="M5.4 11.2a6.6 6.6 0 0 0 10.4 5.5"/><path d="M12 17.8V21"/><path d="M9 21h6"/><path d="m4 4 16 16"/>',
  send: '<path d="M4 11.5 20.5 4l-6 17-2.7-6.8Z"/><path d="m11.8 14.2 8.7-10.2"/>',
  pause:
    '<rect x="7" y="4.5" width="3.4" height="15" rx="1"/><rect x="13.6" y="4.5" width="3.4" height="15" rx="1"/>',
  play: '<path d="M7 4.8v14.4l12-7.2Z"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  spark:
    '<path d="m11 3 1.9 5.4L18.5 10l-5.6 1.6L11 17l-1.9-5.4L3.5 10l5.6-1.6Z"/><path d="m18.5 15.6.8 2.2 2.2.7-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.7Z"/>',
  shield:
    '<path d="M12 3.2 19.5 6v5.6c0 4.6-3.1 7.4-7.5 9.2-4.4-1.8-7.5-4.6-7.5-9.2V6Z"/><path d="m9.2 11.9 2 2 3.6-3.9"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.5V12l3 1.8"/>',
  flag: '<path d="M5 21V4.5"/><path d="M5 5h12.5l-2.2 4 2.2 4H5"/>',
  help:
    '<circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2.1-2.5 3.7"/><path d="M12 17.2h.01"/>',
  download:
    '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  print:
    '<path d="M7 9V4.5h10V9"/><rect x="4" y="9" width="16" height="7" rx="1.6"/><path d="M7 14h10v5.5H7Z"/>',
  arrowLeft: '<path d="M20 12H4.5"/><path d="m10 5.5-5.5 6.5 5.5 6.5"/>',
  arrowRight: '<path d="M4 12h15.5"/><path d="m14 5.5 5.5 6.5-5.5 6.5"/>',
  refresh:
    '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
  volume:
    '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5Z"/><path d="M16.5 8.6a5 5 0 0 1 0 6.8"/><path d="M19 6.5a8 8 0 0 1 0 11"/>',
  volumeOff:
    '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5Z"/><path d="m17 9.5 4 5M21 9.5l-4 5"/>',
  hash: '<path d="M4.5 9h15M4.5 15h15M10 3.5 8.2 20.5M16 3.5l-1.9 17"/>',
  user:
    '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.8-3.4 3.6-5.2 7.2-5.2s6.4 1.8 7.2 5.2"/>',
  wifi:
    '<path d="M3.5 9.5a13 13 0 0 1 17 0"/><path d="M6.5 13a8.6 8.6 0 0 1 11 0"/><path d="M9.6 16.4a4.2 4.2 0 0 1 4.8 0"/><path d="M12 19.8h.01"/>',
  info:
    '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.4"/><path d="M12 7.8h.01"/>',
  eye:
    '<path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  scan:
    '<path d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3"/><path d="M4 12h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  key:
    '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21"/><path d="M17.5 12v3M20 12v2.2"/>',
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
  activity: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
  layers:
    '<path d="m12 3 8.5 4.5L12 12 3.5 7.5Z"/><path d="m4.5 12 7.5 4 7.5-4"/><path d="m4.5 16.5 7.5 4 7.5-4"/>',
  target:
    '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  tool:
    '<path d="m14.5 4.5 1.8 1.8-2.4 2.4-1.8-1.8Z"/><path d="m12.1 8.7-7.3 7.3 3.2 3.2 7.3-7.3"/><path d="M4.5 20.5 6 19"/>',
  zap: '<path d="M13 2 5.5 13.5H11L10 22l7.5-11.5H12Z"/>',
  file:
    '<path d="M6 3.5h8L19 8v12.5H6Z"/><path d="M13.5 3.5V8H19"/><path d="M9 12.5h6M9 16h6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  link:
    '<path d="M10.5 13.5a4 4 0 0 0 5.6 0l2.6-2.6a4 4 0 0 0-5.6-5.6L11.4 7"/><path d="M13.5 10.5a4 4 0 0 0-5.6 0l-2.6 2.6a4 4 0 0 0 5.6 5.6l1.7-1.7"/>',
  copy:
    '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>',
  badge:
    '<circle cx="12" cy="9.5" r="5.2"/><path d="m8.8 13.8-1 7 4.2-2 4.2 2-1-7"/>',
  stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
  playCircle:
    '<circle cx="12" cy="12" r="8.6"/><path d="m10 8.6 5.4 3.4-5.4 3.4Z"/>',
};

/* --------------------------------------------------------------------------
   Technician / shift
   -------------------------------------------------------------------------- */

TARa.TECH = {
  name: 'Andra Wibowo',
  initials: 'AW',
  level: 'Technician L2',
  bay: 'Bay 3',
  shift: '07:00 – 15:00',
};

TARa.SHIFT_STATS = [
  { value: '21', label: 'Steps verified', tone: 'mint' },
  { value: '12', label: 'Frames captured' },
  { value: '2', label: 'Deviations', tone: 'amber' },
  { value: '09:18', label: 'Avg. close time' },
];

/* --------------------------------------------------------------------------
   Work orders
   -------------------------------------------------------------------------- */

TARa.WORK_ORDERS = [
  {
    id: 'WO-1042',
    device: 'Keychron K2 · 65%',
    customer: 'Rina Kusuma',
    issue: 'E key double-types and sometimes does not register. Original switch, hot-swap board.',
    sopId: 'SOP-KBD-01',
    estimate: '8 min',
    sla: '45 min',
    bay: 'Bay 3',
    priority: 'Priority',
    priorityTone: 'amber',
    steps: 5,
    gated: 3,
    startable: true,
  },
  {
    id: 'WO-1043',
    device: 'Keychron Q1 · 75%',
    customer: 'Dimas Prakoso',
    issue: 'Spacebar rattles and sticks on the left stabiliser. No electrical fault reported.',
    sopId: 'SOP-KBD-02',
    estimate: '12 min',
    sla: '90 min',
    bay: 'Bay 1',
    priority: 'Standard',
    priorityTone: 'muted',
    steps: 4,
    gated: 1,
    startable: false,
  },
  {
    id: 'WO-1044',
    device: 'Akko 5075B · 75%',
    customer: 'Sari Wulandari',
    issue: 'Several keys stopped registering after a drink spill. Board powers on.',
    sopId: 'SOP-KBD-03',
    estimate: '25 min',
    sla: '3 h',
    bay: 'Bay 2',
    priority: 'Standard',
    priorityTone: 'muted',
    steps: 7,
    gated: 3,
    startable: false,
  },
];

TARa.SOP_LIBRARY = [
  {
    id: 'SOP-KBD-01',
    title: 'Mechanical Keyboard — Switch Replacement',
    version: 'v1.4',
    steps: 5,
    branches: 0,
    updated: '02 Sep 2026',
    active: true,
  },
  {
    id: 'SOP-KBD-02',
    title: 'Stabiliser Service — Spacebar',
    version: 'v2.1',
    steps: 4,
    branches: 1,
    updated: '18 Aug 2026',
  },
  {
    id: 'SOP-KBD-03',
    title: 'Liquid Ingress Triage',
    version: 'v1.2',
    steps: 7,
    branches: 2,
    updated: '28 Sep 2026',
  },
];

/* --------------------------------------------------------------------------
   SOP-KBD-01

   -------------------------------------------------------------------------- */

TARa.SOP = {
  id: 'SOP-KBD-01',
  title: 'Mechanical Keyboard — Switch Replacement',
  version: 'v1.4',
  owner: 'Service Operations · Jakarta Central',
  effective: '02 Sep 2026',
  review: '02 Mar 2027',
  scope:
    'Applies to hot-swap mechanical keyboards with a single faulty switch. Covers intake, fault isolation, switch replacement, key verification and close-out. Does not authorise soldered switch replacement, socket repair or PCB work.',
  prerequisites: [
    'Keyboard unplugged and powered off before removing any keycap.',
    'Keycap puller, switch puller and an ESD-safe brush on the bench.',
    'Replacement switch matched to the plate — 3-pin or 5-pin, same travel.',
  ],
  clauses: [
    {
      id: '1',
      ref: '§1',
      title: 'Intake & identity',
      body: 'Confirm the keyboard model, serial and layout against the work order. Record pre-existing case wear before handling. The label on the underside is the identity source; do not infer the model from the keycaps.',
    },
    {
      id: '2',
      ref: '§2',
      title: 'Fault isolation',
      body: 'Reproduce the key fault and record it. Remove the keycap with a puller and inspect the exposed switch and socket. Confirm the switch is hot-swap and the socket is undamaged before removal. If the switch is not at least half the frame, look again — do not guess.',
    },
    {
      id: '3',
      ref: '§3',
      title: 'Switch replacement',
      body: 'Pull the old switch straight up with the switch puller. Align the new switch pins with the socket and seat it firmly. Never force a switch — a bent pin damages the socket and turns a Level 1 job into board work.',
    },
    {
      id: '4',
      ref: '§4',
      title: 'Key verification',
      body: 'Refit the keycap and test the key five times in a text field. The repair passes only when every press registers once. A double type or dead key stays open and is escalated.',
    },
    {
      id: '5',
      ref: '§5',
      title: 'Close-out & handoff',
      body: 'Capture the final keyboard condition and generate the service report. The report must separate frame-verified steps from technician-attested steps and list every deviation with its resolution.',
    },
  ],
  order: ['s1', 's2', 's3', 's4', 's5'],
  steps: {
    s1: {
      id: 's1',
      clause: '§1.2',
      clauseId: '1',
      title: 'Verify keyboard & intake',
      estimate: '1 min',
      kind: 'evidence',
      summary: 'Match keyboard model and serial to WO-1042.',
      instruction:
        'Turn the keyboard over and show me the label — model, serial and layout. I will match it to the ticket before we pull anything off.',
      why: 'Working on the wrong keyboard is the most common intake defect. SOP §1.2 requires identity confirmation and a record of pre-existing case wear before any keycap comes off.',
      criteria: [
        'Model and serial match the work order',
        'Layout and switch type recorded',
        'Pre-existing case wear logged',
      ],
      evidence: {
        label: 'Underside label',
        hint: 'Fill the frame with the sticker. Avoid glare from the bench lamp.',
        script: [
          {
            verdict: 'pass',
            confidence: 0.95,
            checks: [
              { label: 'Model readable', state: 'ok', note: 'K2-A3' },
              { label: 'Serial matches WO-1042', state: 'ok', note: 'K2A-88214' },
              { label: 'Case shine', state: 'warn', note: 'pre-existing' },
            ],
            summary:
              'Identity confirmed on the live feed: Keychron K2, serial ending 8214, matching WO-1042. I logged a pre-existing shine on the case.',
          },
        ],
      },
      agentDone:
        'Identity confirmed and logged. One pre-existing shine on the case is recorded so it does not come back to you.',
      agentIntro:
        'Work order 1042, Keychron K2, E key double-typing. Five steps, three frame-gated checks. First gate: identity. Show me the label on the underside.',
    },

    s2: {
      id: 's2',
      clause: '§2.3',
      clauseId: '2',
      title: 'Inspect the faulty key',
      estimate: '1 min',
      kind: 'evidence',
      summary: 'Confirm a hot-swap switch and an intact socket.',
      instruction:
        'Pull the E keycap with the keycap puller and bring the exposed switch close to the camera. I need to see the switch type and the socket before we remove it.',
      why: 'SOP §2.3 checks that the switch is hot-swap and the socket is intact. If this is a soldered board or the socket is damaged, the job stops here instead of becoming board work.',
      criteria: [
        'Switch fills at least half the frame',
        'Hot-swap socket confirmed',
        'Socket and pins undamaged',
      ],
      evidence: {
        label: 'Exposed switch close-up',
        hint: 'Keycap off. About 10 cm away, angled toward the light.',
        script: [
          {
            verdict: 'retake',
            confidence: 0.43,
            checks: [
              { label: 'Switch coverage', state: 'warn', note: '~15% of frame' },
              { label: 'Socket', state: 'pending', note: 'not visible' },
              { label: 'Keycap', state: 'warn', note: 'still fitted' },
            ],
            summary:
              'I can see the keyboard, but not the switch. Pull the E keycap, move closer, and hold the board flat — I will not guess from this frame.',
          },
          {
            verdict: 'pass',
            confidence: 0.9,
            checks: [
              { label: 'Switch', state: 'ok', note: 'Gateron Brown · 3-pin' },
              { label: 'Socket', state: 'ok', note: 'hot-swap, undamaged' },
              { label: 'Corrosion', state: 'ok', note: 'none visible' },
            ],
            summary:
              'Switch and socket are clear. It is a hot-swap board with a 3-pin Gateron Brown — safe to pull and replace.',
          },
        ],
      },
      agentDone:
        'Switch verified as hot-swap, socket intact. The replacement path is safe. Next: swap the switch.',
      agentIntro:
        'Now the fault itself. Keycap off, switch close to the lens. If the frame is not usable I will ask again rather than guess.',
    },

    s3: {
      id: 's3',
      clause: '§3.1',
      clauseId: '3',
      title: 'Swap the switch',
      estimate: '2 min',
      kind: 'attest',
      summary: 'Pull the old switch and seat the matched replacement.',
      instruction:
        'Pull the old switch straight up with the switch puller. Align the new 3-pin switch with the socket and press it in. Do not force it. Tell me when it is seated.',
      why: 'SOP §3.1: a bent pin is the most common way a two-minute swap becomes a socket repair. The switch must drop in with light pressure and sit flush with the plate.',
      criteria: [
        'Switch pulled straight up',
        'Pins aligned — no force used',
        'New switch flush with the plate',
      ],
      attest: {
        options: [
          { id: 'seated', label: 'New switch seated flush', icon: 'check' },
          { id: 'tight', label: "It won't seat", icon: 'alert', tone: 'danger' },
        ],
      },
      agentDone:
        'Swap attested. Refit the keycap and we test the key — five presses, no misses.',
      agentIntro:
        'Swap time. Straight up, align the pins, light pressure. If it needs force, stop and show me the pins instead.',
    },

    s4: {
      id: 's4',
      clause: '§4.1',
      clauseId: '4',
      title: 'Test the key',
      estimate: '1 min',
      kind: 'choice',
      summary: 'Five presses in a text field — one character each.',
      instruction:
        'Keycap back on. Open a text field and press E five times. What did you see?',
      why: 'SOP §4.1 defines a pass as five presses producing five characters. One double type means the repair is not done, even if the key feels right.',
      criteria: ['Keycap refitted', 'Five presses in a text field', 'Result recorded'],
      choices: [
        {
          id: 'pass',
          label: 'Registers every press',
          sub: '5 of 5, no double types',
          icon: 'check',
          attest: true,
          note: 'E key registers reliably — 5 of 5 presses.',
          agent:
            'Five clean presses. I am recording that as technician-attested — the test is yours, not a frame result. Now the final condition check.',
        },
        {
          id: 'double',
          label: 'Double types',
          sub: 'One press, two characters',
          icon: 'alert',
          attest: true,
          tone: 'danger',
          anomaly: true,
          note: 'E key still double-types after the swap.',
          agent:
            'That is not a pass. I am logging the key as still faulty and keeping the job open. Re-seat the switch first; if it doubles again, escalate instead of closing.',
        },
        {
          id: 'dead',
          label: 'No response',
          sub: 'Nothing appears on screen',
          icon: 'x',
          attest: true,
          tone: 'danger',
          anomaly: true,
          note: 'E key dead after the switch swap.',
          agent:
            'No response means the switch or socket is still wrong. Do not close the job. I am flagging it for escalation and the report will keep the key open.',
        },
      ],
      agentDone: 'Key test recorded as passing.',
      agentIntro:
        'Test it for real. Keycap on, five presses in a text field. Tell me what happened — including a double type.',
    },

    s5: {
      id: 's5',
      clause: '§5.1',
      clauseId: '5',
      title: 'Final condition & report',
      estimate: '1 min',
      kind: 'finalize',
      summary: 'Capture the finished keyboard and close the job.',
      instruction:
        'Show me the whole keyboard with the keycap back on, then generate the service report.',
      why: 'The report is the audit artifact. It separates frame-verified steps from technician-attested ones, so a supervisor can see exactly what was proven and what was trusted.',
      criteria: ['Final condition captured', 'Keycap seated and aligned', 'Report generated'],
      evidence: {
        label: 'Final keyboard condition',
        hint: 'Whole board, keycap back on, cable connected.',
        script: [
          {
            verdict: 'pass',
            confidence: 0.92,
            checks: [
              { label: 'Keycap seated', state: 'ok', note: 'E key, aligned' },
              { label: 'No new damage', state: 'ok', note: 'vs. intake' },
              { label: 'Work area clear', state: 'ok', note: 'no stray parts' },
            ],
            summary:
              'Final condition matches intake apart from the replaced switch. The E keycap is seated and the frame is attached to the record.',
          },
        ],
      },
      agentDone: 'Close-out evidence captured.',
      agentIntro:
        'Last step. Show me the finished board, then I will assemble the report — steps, frames, references and the audit trail.',
    },
  },
};

TARa.STEP_STATUS = {
  locked: { label: 'Locked', tag: 'muted', icon: 'lock' },
  active: { label: 'In progress', tag: 'mint', icon: 'play' },
  verified: { label: 'Verified', tag: 'mint', icon: 'checkCircle' },
  attested: { label: 'Attested', tag: 'blue', icon: 'user' },
  review: { label: 'Needs review', tag: 'red', icon: 'alert' },
  skipped: { label: 'Exception', tag: 'amber', icon: 'flag' },
};

/* --------------------------------------------------------------------------
   Dashboard extras
   -------------------------------------------------------------------------- */

TARa.READINESS = [
  { icon: 'mic', label: 'Microphone', state: 'Ready' },
  { icon: 'camera', label: 'Camera · 1080p', state: 'Ready' },
  { icon: 'layers', label: 'SOP sync · KBD-01 v1.4', state: 'Current' },
  { icon: 'wifi', label: 'Realtime agent', state: '38 ms' },
];

TARa.STATIC_REPORTS = [
  {
    id: 'RPT-1039',
    workOrderId: 'WO-1039',
    device: 'Keychron K2 · 65%',
    title: 'Switch replacement · E key',
    score: 100,
    meta: 'Today 09:42 · 5 steps · 1 rejected frame',
    seedable: true,
  },
  {
    id: 'RPT-1037',
    workOrderId: 'WO-1037',
    device: 'Keychron Q1 · 75%',
    title: 'Stabiliser service · spacebar',
    score: 87,
    meta: 'Yesterday 16:08 · 4 steps',
    seedable: false,
  },
];
