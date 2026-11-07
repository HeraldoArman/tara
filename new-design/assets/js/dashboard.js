/* ==========================================================================
   TARa — work queue (dashboard)
   ========================================================================== */

(function () {
  const M = window.TARa;
  const icon = M.icon;
  const esc = M.esc;

  M.hydrateIcons();

  const el = {
    woList: M.byId('woList'),
    queueCount: M.byId('queueCount'),
    readyList: M.byId('readyList'),
    statGrid: M.byId('statGrid'),
    recentList: M.byId('recentList'),
    resume: M.byId('resumeStrip'),
    heroStart: M.byId('heroStartBtn'),
    recheck: M.byId('recheckBtn'),
    how: M.byId('howBtn'),
    avatar: M.byId('avatarBtn'),
    sample: M.byId('sampleReportBtn'),
  };

  let filter = 'all';

  /* ------------------------------------------------------------------------
     Work queue
     ------------------------------------------------------------------------ */

  function queueCard(wo) {
    const active = M.session.get();
    const isCurrent = active && active.workOrderId === wo.id && active.status !== 'complete';
    const tone = wo.priorityTone === 'amber' ? 'amber' : wo.priorityTone === 'red' ? 'red' : 'muted';
    const group = wo.priority === 'Standard' ? 'standard' : 'priority';
    const disabled = !wo.startable;

    return (
      '<article class="wo ' +
      (wo.priority === 'Priority' ? 'wo--priority ' : '') +
      (wo.priority === 'Urgent' ? 'wo--urgent ' : '') +
      (disabled ? 'is-disabled' : '') +
      '" data-group="' +
      group +
      '" data-wo="' +
      wo.id +
      '" aria-label="' +
      esc(wo.device) +
      '">' +
      '<span class="wo__accent" aria-hidden="true"></span>' +
      '<div class="wo__main">' +
      '<div class="wo__top">' +
      '<span class="wo__id mono">' +
      esc(wo.id) +
      '</span>' +
      '<span class="tag tag--' +
      tone +
      '">' +
      esc(wo.priority) +
      '</span>' +
      '<span class="tag tag--muted">' +
      esc(wo.bay) +
      '</span>' +
      '<span class="wo__sla">SLA ' +
      esc(wo.sla) +
      '</span>' +
      '</div>' +
      '<h3 class="wo__title">' +
      esc(wo.device) +
      '</h3>' +
      '<p class="wo__issue">' +
      esc(wo.issue) +
      '</p>' +
      '<div class="wo__meta">' +
      '<span>' +
      icon('user', '', 13) +
      esc(wo.customer) +
      '</span>' +
      '<span>' +
      icon('layers', '', 13) +
      esc(wo.sopId) +
      '</span>' +
      '<span>' +
      icon('clock', '', 13) +
      '~' +
      esc(wo.estimate) +
      '</span>' +
      '</div>' +
      '</div>' +
      '<div class="wo__side">' +
      '<div class="wo__steps"><b>' +
      wo.steps +
      '</b>steps · ' +
      wo.gated +
      ' gated</div>' +
      (disabled
        ? '<button class="btn btn--ghost btn--sm" data-locked="' +
          wo.id +
          '">' +
          icon('lock', '', 13) +
          'Queued</button>'
        : '<button class="btn ' +
          (isCurrent ? 'btn--primary' : 'btn--primary') +
          ' btn--sm" data-start="' +
          wo.id +
          '">' +
          icon(isCurrent ? 'playCircle' : 'play', '', 13) +
          (isCurrent ? 'Resume' : 'Start') +
          '</button>') +
      '</div>' +
      '</article>'
    );
  }

  function renderQueue() {
    el.woList.innerHTML = M.WORK_ORDERS.map(queueCard).join('');
    applyFilter();
  }

  function applyFilter() {
    let visible = 0;
    el.woList.querySelectorAll('.wo').forEach((node) => {
      const group = node.dataset.group;
      const show = filter === 'all' || group === filter;
      node.hidden = !show;
      if (show) visible++;
    });
    el.queueCount.textContent = visible + (visible === 1 ? ' job' : ' jobs');
  }

  el.woList.addEventListener('click', (e) => {
    const startBtn = e.target.closest('[data-start]');
    if (startBtn) {
      const wo = M.WORK_ORDERS.find((w) => w.id === startBtn.dataset.start);
      if (wo) startWork(wo);
      return;
    }

    const locked = e.target.closest('[data-locked]');
    if (locked) {
      M.ui.toast(
        'This prototype runs <b>WO-1042</b> end-to-end. The other work orders show how the queue scales — their SOPs are not wired up.',
        { type: 'info', icon: 'info' }
      );
      return;
    }

    const card = e.target.closest('[data-wo]');
    if (card && !e.target.closest('button')) {
      const wo = M.WORK_ORDERS.find((w) => w.id === card.dataset.wo);
      if (wo && wo.startable) startWork(wo);
    }
  });

  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      applyFilter();
    });
  });

  function startWork(wo) {
    const existing = M.session.get();
    if (existing && existing.workOrderId === wo.id && existing.status !== 'complete') {
      location.href = 'workspace.html';
      return;
    }
    M.session.start(wo);
    location.href = 'workspace.html';
  }

  el.heroStart.addEventListener('click', () => {
    const wo = M.WORK_ORDERS.find((w) => w.id === 'WO-1042');
    if (wo) startWork(wo);
  });

  /* ------------------------------------------------------------------------
     Resume strip
     ------------------------------------------------------------------------ */

  function renderResume() {
    const state = M.session.get();
    if (!state || state.status === 'complete') {
      el.resume.innerHTML = '';
      el.heroStart.innerHTML = icon('play', '', 15) + 'Start WO-1042';
      return;
    }

    const step = M.SOP.steps[state.currentStepId];
    const index = state.stepOrder.indexOf(state.currentStepId) + 1;
    const total = state.stepOrder.length;
    const paused = state.status === 'paused';

    el.resume.innerHTML =
      '<div class="resume-strip" style="' +
      (paused ? 'border-color: var(--amber-line); background: linear-gradient(90deg, rgba(255,192,107,.09), transparent);' : '') +
      '">' +
      '<span class="resume-strip__pulse" style="' +
      (paused ? 'background: var(--amber)' : '') +
      '"></span>' +
      '<div class="resume-strip__main">' +
      '<div class="resume-strip__title">' +
      esc(state.workOrderId) +
      ' ' +
      (paused ? 'paused' : 'in progress') +
      ' · <span class="muted">Step ' +
      index +
      ' of ' +
      total +
      ' — ' +
      esc(step ? step.title : '') +
      '</span></div>' +
      '<div class="resume-strip__meta">' +
      (paused ? 'Timer paused' : M.fmt.clock(M.session.elapsed(state)) + ' elapsed') +
      ' · ' +
      state.evidence.length +
      ' frame' +
      (state.evidence.length === 1 ? '' : 's') +
      ' · session saved locally</div>' +
      '</div>' +
      '<button class="btn btn--sm ' +
      (paused ? 'btn--ghost' : 'btn--primary') +
      '" data-resume>' +
      icon(paused ? 'play' : 'arrowRight', '', 14) +
      (paused ? 'Resume session' : 'Continue') +
      '</button>' +
      '</div>';

    const btn = el.resume.querySelector('[data-resume]');
    if (btn) btn.addEventListener('click', () => (location.href = 'workspace.html'));

    el.heroStart.innerHTML = icon('playCircle', '', 15) + 'Resume WO-1042';
  }

  /* ------------------------------------------------------------------------
     Readiness
     ------------------------------------------------------------------------ */

  function readinessRow(item, checking) {
    return (
      '<div class="ready-item' +
      (checking ? ' is-checking' : '') +
      '">' +
      '<span class="ready-item__ic">' +
      icon(item.icon) +
      '</span>' +
      '<span>' +
      esc(item.label) +
      '</span>' +
      '<span class="ready-item__state">' +
      (checking ? 'Checking…' : esc(item.state)) +
      '</span>' +
      '</div>'
    );
  }

  function renderReadiness(checking) {
    el.readyList.innerHTML = M.READINESS.map((item) => readinessRow(item, checking)).join('');
  }

  renderQueue();
  renderReadiness(false);

  el.recheck.addEventListener('click', () => {
    el.recheck.classList.add('is-disabled');
    renderReadiness(true);
    setTimeout(() => {
      renderReadiness(false);
      el.recheck.classList.remove('is-disabled');
      M.ui.toast('Mic, camera, SOP sync and agent latency all within range.', {
        type: 'success',
        icon: 'checkCircle',
      });
    }, 1400);
  });

  /* ------------------------------------------------------------------------
     Stats + recent reports
     ------------------------------------------------------------------------ */

  el.statGrid.innerHTML = M.SHIFT_STATS.map((stat) => {
    return (
      '<div class="stat' +
      (stat.tone ? ' stat--' + stat.tone : '') +
      '">' +
      '<div class="stat__value">' +
      esc(stat.value) +
      '</div>' +
      '<div class="stat__label">' +
      esc(stat.label) +
      '</div>' +
      '</div>'
    );
  }).join('');

  function recentItem(item, isSample) {
    const warn = item.score < 95;
    return (
      '<button class="recent__item" data-report="' +
      esc(item.id) +
      '" data-sample="' +
      (isSample ? '1' : '0') +
      '">' +
      '<span class="recent__score' +
      (warn ? ' is-warn' : '') +
      '">' +
      (item.score != null ? item.score : '—') +
      '</span>' +
      '<span class="recent__main">' +
      '<span class="recent__title">' +
      esc(item.device || item.title) +
      '</span>' +
      '<span class="recent__meta">' +
      esc(item.meta) +
      '</span>' +
      '</span>' +
      icon('chevronRight', '', 14) +
      '</button>'
    );
  }

  function renderRecent() {
    const archived = M.reports.list();
    const archivedIds = new Set(archived.map((r) => r.id));
    const staticOnes = M.STATIC_REPORTS.filter((r) => !archivedIds.has(r.id));

    let html = archived
      .map((r) =>
        recentItem(
          {
            id: r.id,
            device: r.device,
            score: Math.round((r.compliance || 0) * 100),
            meta:
              M.fmt.dateTime(r.completedAt) +
              ' · ' +
              r.steps.length +
              ' steps · ' +
              (r.counts.deviations || 0) +
              ' deviation' +
              (r.counts.deviations === 1 ? '' : 's'),
          },
          false
        )
      )
      .join('');

    html += staticOnes
      .map((r) =>
        recentItem(
          {
            id: r.id,
            device: r.device,
            score: r.score,
            meta: r.meta,
          },
          true
        )
      )
      .join('');

    el.recentList.innerHTML = html;

    el.recentList.querySelectorAll('[data-report]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.report;
        const existing = M.reports.find(id);
        if (existing) {
          location.href = 'report.html?id=' + encodeURIComponent(id);
          return;
        }
        if (btn.dataset.sample === '1' && id === 'RPT-1039') {
          seedSampleReport();
          return;
        }
        M.ui.toast(
          'That report is not included in the prototype. Finish WO-1042 — or open the sample report in the footer.',
          { type: 'info' }
        );
      });
    });
  }

  renderRecent();

  /* ------------------------------------------------------------------------
     Seed a completed sample report (skip the walkthrough)
     ------------------------------------------------------------------------ */

  function seedSampleReport() {
    const sop = M.SOP;
    const now = Date.now();
    const start = now - 19 * 60000;
    const end = now - 3 * 60000;

    const order = ['s1', 's2', 's3', 's4', 's5'];
    const statusMap = {
      s1: 'verified',
      s2: 'verified',
      s3: 'attested',
      s4: 'attested',
      s5: 'verified',
    };
    const times = [150000, 410000, 560000, 720000, 880000];

    const checks = {
      s1: [
        { label: 'Model readable', state: 'ok', note: 'K2-A3' },
        { label: 'Serial matches WO-1039', state: 'ok', note: '···8214' },
        { label: 'Case shine', state: 'warn', note: 'pre-existing' },
      ],
      switchWide: [
        { label: 'Switch coverage', state: 'warn', note: '~15% of frame' },
        { label: 'Keycap', state: 'warn', note: 'still fitted' },
      ],
      switch: [
        { label: 'Switch', state: 'ok', note: 'Gateron Brown · 3-pin' },
        { label: 'Socket', state: 'ok', note: 'hot-swap, intact' },
        { label: 'Corrosion', state: 'ok', note: 'none' },
      ],
      final: [
        { label: 'Keycap seated', state: 'ok', note: 'E key, aligned' },
        { label: 'No new damage', state: 'ok', note: 'vs. intake' },
      ],
    };

    const evidence = [
      {
        id: 'EV-9F21',
        stepId: 's1',
        url: M.scene.still({ focus: 'label' }),
        verdict: 'pass',
        confidence: 0.95,
        accepted: true,
        source: 'demo',
        ts: start + times[0],
        checks: checks.s1,
        note: 'Identity: Keychron K2 · serial ···8214',
      },
      {
        id: 'EV-9F22',
        stepId: 's2',
        url: M.scene.still({ focus: 'device', t: 2 }),
        verdict: 'retake',
        confidence: 0.43,
        accepted: false,
        source: 'demo',
        ts: start + 290000,
        checks: checks.switchWide,
        note: 'Rejected — switch occupied ~15% of the frame',
      },
      {
        id: 'EV-9F23',
        stepId: 's2',
        url: M.scene.still({ focus: 'switch', t: 5 }),
        verdict: 'pass',
        confidence: 0.9,
        accepted: true,
        source: 'demo',
        ts: start + times[1],
        checks: checks.switch,
        note: 'Hot-swap socket and 3-pin switch confirmed',
      },
      {
        id: 'EV-9F24',
        stepId: 's5',
        url: M.scene.still({ focus: 'device', fixed: true, t: 12 }),
        verdict: 'pass',
        confidence: 0.92,
        accepted: true,
        source: 'demo',
        ts: start + times[4],
        checks: checks.final,
        note: 'Final condition — matches intake apart from the replaced switch',
      },
    ];

    const steps = {};
    order.forEach((id, i) => {
      steps[id] = {
        status: statusMap[id],
        attempts: id === 's2' ? 2 : 1,
        evidenceIds: evidence.filter((e) => e.stepId === id && e.accepted).map((e) => e.id),
        verification:
          statusMap[id] === 'attested'
            ? { mode: 'attestation' }
            : { mode: 'evidence', confidence: evidence.find((e) => e.stepId === id && e.accepted).confidence },
        completedAt: start + times[i],
        note:
          id === 's1'
            ? 'Intake matched WO-1039. Pre-existing case shine logged.'
            : id === 's2'
            ? 'Hot-swap socket intact; 3-pin Gateron Brown confirmed.'
            : id === 's3'
            ? 'Replacement switch seated flush; no force used.'
            : id === 's4'
            ? 'E key registered 5 of 5 presses in a text field.'
            : 'Final condition captured; keycap seated and aligned.',
        manualOverride: false,
      };
    });

    const events = [
      { type: 'task_started', label: 'Task started · WO-1039', tone: 'mint', ts: start, stepId: 's1' },
      { type: 'step_entered', label: 'Step 1 opened · Verify keyboard & intake', tone: 'muted', ts: start + 3000, stepId: 's1' },
      { type: 'evidence_captured', label: 'Frame accepted · underside label', tone: 'mint', ts: start + times[0], stepId: 's1' },
      { type: 'step_verified', label: 'Step 1 verified', tone: 'mint', ts: start + times[0], stepId: 's1' },
      { type: 'step_entered', label: 'Step 2 opened · Inspect the faulty key', tone: 'muted', ts: start + 160000, stepId: 's2' },
      { type: 'evidence_rejected', label: 'Frame rejected · switch too small in frame', tone: 'amber', ts: start + 290000, stepId: 's2' },
      { type: 'tool_call', label: 'Agent used Reference images · hot-swap switch', tone: 'blue', ts: start + 300000, stepId: 's2' },
      { type: 'evidence_captured', label: 'Frame accepted · switch close-up', tone: 'mint', ts: start + times[1], stepId: 's2' },
      { type: 'step_verified', label: 'Step 2 verified', tone: 'mint', ts: start + times[1], stepId: 's2' },
      { type: 'step_entered', label: 'Step 3 opened · Swap the switch', tone: 'muted', ts: start + 430000, stepId: 's3' },
      { type: 'deviation_logged', label: 'Deviation · serial scuffed on label', tone: 'amber', ts: start + 470000, stepId: 's3' },
      { type: 'step_attested', label: 'Step 3 attested · new switch seated', tone: 'blue', ts: start + times[2], stepId: 's3' },
      { type: 'step_entered', label: 'Step 4 opened · Test the key', tone: 'muted', ts: start + 600000, stepId: 's4' },
      { type: 'step_attested', label: 'Step 4 attested · 5 of 5 presses', tone: 'blue', ts: start + times[3], stepId: 's4' },
      { type: 'step_entered', label: 'Step 5 opened · Final condition & report', tone: 'muted', ts: start + 760000, stepId: 's5' },
      { type: 'evidence_captured', label: 'Frame accepted · final condition', tone: 'mint', ts: start + times[4], stepId: 's5' },
      { type: 'step_verified', label: 'Step 5 verified · final condition captured', tone: 'mint', ts: start + times[4], stepId: 's5' },
      { type: 'task_completed', label: 'Task completed · report generated', tone: 'mint', ts: end, stepId: 's5' },
    ].map((e, i) => Object.assign({ id: 'EVT-' + (100 + i) }, e));

    const state = {
      id: 'SES-SAMPLE',
      workOrderId: 'WO-1039',
      device: 'Keychron K2 · 65%',
      customer: 'Bagus Hartono',
      sopId: sop.id,
      sopVersion: sop.version,
      status: 'complete',
      startedAt: start,
      totalPaused: 0,
      pauseStartedAt: null,
      completedAt: end,
      outcome: 'complete',
      currentStepId: 's5',
      stepOrder: order,
      steps: steps,
      evidence: evidence,
      events: events,
      messages: [],
      research: [
        { tool: 'images', query: 'Hot-swap switch — reference', stepId: 's2', ts: start + 300000 },
      ],
      deviations: [
        {
          id: 'DEV-1',
          ts: start + 470000,
          severity: 'minor',
          clause: '§1.2',
          title: 'Serial partly scuffed on the label',
          detail:
            'The serial line on the underside sticker was worn. Model K2-A3 was readable; the barcode was cross-checked against the ticket before the swap.',
          resolution: 'Barcode and model matched WO-1039. Intake accepted with the scuff recorded.',
        },
      ],
      escalations: [
        {
          id: 'ESC-1',
          ts: start + 350000,
          type: 'Second opinion',
          title: 'Confirm 3-pin switch is the correct replacement',
          detail: 'Technician requested a senior check before pulling the original switch.',
          resolvedAt: start + 390000,
          resolvedBy: 'Bayu Prasetyo · L3',
        },
      ],
      demo: true,
    };

    const report = M.reports.build(state);
    report.sample = true;
    report.counts.rejectedEvidence = 1;
    M.reports.save(report);

    M.ui.toast('Sample report loaded — this is what a supervisor receives.', {
      type: 'success',
      icon: 'file',
      duration: 900,
    });

    setTimeout(() => {
      location.href = 'report.html?id=' + encodeURIComponent(report.id);
    }, 420);
  }

  el.sample.addEventListener('click', seedSampleReport);

  /* ------------------------------------------------------------------------
     Modals
     ------------------------------------------------------------------------ */

  el.how.addEventListener('click', () => {
    M.ui.modal({
      kicker: 'Prototype walkthrough',
      title: 'How TARa works',
      body:
        '<div class="pillar">' +
        '<span class="pillar__ic">' +
        icon('layers') +
        '</span>' +
        '<div><b>The SOP owns the workflow</b><p>A deterministic state machine decides what can happen next. The agent can ask for a transition, but it cannot skip a gated step or invent a procedure.</p></div>' +
        '</div>' +
        '<div class="pillar">' +
        '<span class="pillar__ic">' +
        icon('eye') +
        '</span>' +
        '<div><b>Live video is the evidence</b><p>There is no photo button. The agent watches the bench feed, verifies the frame that is already in front of it, and keeps a copy. If the frame is unclear it refuses to guess and asks again.</p></div>' +
        '</div>' +
        '<div class="pillar">' +
        '<span class="pillar__ic">' +
        icon('search') +
        '</span>' +
        '<div><b>It can look things up</b><p>Ask “what does a keycap look like?” or “what tool do I need?” and it answers with how-to steps and simulated reference images. Parts and the SOP work the same way, and every lookup lands in the audit trail.</p></div>' +
        '</div>' +
        '<div class="pillar">' +
        '<span class="pillar__ic">' +
        icon('shield') +
        '</span>' +
        '<div><b>The report separates proof from trust</b><p>“Verified” means a live frame supported it. “Attested” means the technician confirmed it. A supervisor sees the difference, plus every exception and the full event trail.</p></div>' +
        '</div>' +
        '<div class="modal-note modal-note--mint" style="margin-top:14px">' +
        '<b>Try this path (about 2 minutes, no buttons):</b><br />' +
        '1. Start WO-1042. The intake frame checks itself.<br />' +
        '2. The first switch check is rejected because the keycap is on; say “the keycap is off” to check again.<br />' +
        '3. Say “seated”, then “registers every press”.<br />' +
        '4. The finished board checks itself; say “generate the report”.<br />' +
        '<span style="opacity:.75">Ask “what does a keycap look like?” or “what tool do I need?” at any point. Voice is primary; typing and Enter are the fallback.</span>' +
        '</div>' +
        '<div class="modal-note" style="margin-top:8px">Everything runs in the browser. There is no backend, no model call and no network request — the agent, vision, search and timings are simulated for UX review.</div>',
      actions: [
        { label: 'Close', tone: 'ghost' },
        {
          label: 'Start the demo',
          tone: 'primary',
          icon: 'play',
          onClick: () => {
            const wo = M.WORK_ORDERS.find((w) => w.id === 'WO-1042');
            if (wo) startWork(wo);
          },
        },
      ],
    });
  });

  el.avatar.addEventListener('click', () => {
    M.ui.modal({
      kicker: 'Signed in',
      title: M.TECH.name,
      subtitle: M.TECH.level + ' · ' + M.TECH.bay + ' · shift ' + M.TECH.shift,
      size: 'narrow',
      body:
        '<div class="kv" style="margin-bottom:14px">' +
        '<dt>Session</dt><dd>Frontend prototype</dd>' +
        '<dt>Storage</dt><dd>' +
        (M.store.available ? 'Local browser storage' : 'Blocked — memory only') +
        '</dd>' +
        '<dt>Agent</dt><dd>Simulated · no network calls</dd>' +
        '</div>' +
        '<div class="modal-note">Resetting clears the active session and any reports saved in this browser. It does not touch the prototype files.</div>',
      actions: [
        { label: 'Close', tone: 'ghost' },
        {
          label: 'Reset demo data',
          tone: 'danger',
          icon: 'refresh',
          onClick: () => {
            M.session.clear();
            M.store.remove(M.reports.KEY);
            location.reload();
          },
        },
      ],
    });
  });

  document.querySelectorAll('[data-soon]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      M.ui.toast(
        '<b>' +
          esc(link.dataset.soon) +
          '</b> is a stub in this prototype. The SOP library opens from inside a work session; reports open from the queue or after a job is closed.',
        { type: 'info' }
      );
    });
  });

  if (!M.store.available) {
    setTimeout(() => {
      M.ui.toast(
        'This browser blocks local storage for local files. The multi-page demo needs a local server — see <b>README.md</b>.',
        { type: 'warn', icon: 'alert', duration: 9000 }
      );
    }, 1200);
  }

  renderResume();
  window.addEventListener('focus', renderResume);
})();
