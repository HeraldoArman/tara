/* ==========================================================================
   TARa — service report
   Renders the persisted report for ?id=… and supervisor sign-off.
   ========================================================================== */

(function () {
  const M = window.TARa;
  const esc = M.esc;

  const EVENT_ICON = {
    task_started: 'play',
    step_entered: 'target',
    evidence_captured: 'camera',
    evidence_rejected: 'alert',
    step_verified: 'checkCircle',
    step_attested: 'user',
    step_skipped: 'flag',
    step_held: 'alert',
    step_override: 'key',
    measurement_recorded: 'activity',
    tool_call: 'search',
    deviation_logged: 'flag',
    branch_inserted: 'layers',
    escalation_created: 'help',
    task_paused: 'pause',
    task_resumed: 'play',
    task_completed: 'shield',
  };

  const SUPERVISOR = {
    name: 'Sari Hidayat',
    role: 'Service Supervisor · Jakarta Central',
  };

  const root = M.byId('reportRoot');
  const briefId = M.byId('briefId');
  const briefDevice = M.byId('briefDevice');

  const params = new URLSearchParams(location.search);
  const wantedId = params.get('id');
  const report = wantedId ? M.reports.find(wantedId) : M.reports.find(null);

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */

  function pct(n) {
    return Math.round((n || 0) * 100) + '%';
  }

  function duration(ms) {
    const total = Math.max(0, Math.floor((ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    return m + 'm ' + String(s).padStart(2, '0') + 's';
  }

  function ring(value, label, tone) {
    const c = 2 * Math.PI * 18;
    const filled = Math.max(0, Math.min(1, value)) * c;
    return (
      '<div class="ring" role="img" aria-label="' +
      esc(label + ' ' + pct(value)) +
      '">' +
      '<svg width="84" height="84" viewBox="0 0 44 44">' +
      '<circle class="ring__track" cx="22" cy="22" r="18" />' +
      '<circle class="ring__value" cx="22" cy="22" r="18" stroke-dasharray="' +
      filled.toFixed(2) +
      ' ' +
      c.toFixed(2) +
      '"' +
      (tone ? ' style="stroke:var(--' + tone + ')"' : '') +
      ' />' +
      '</svg>' +
      '<span class="ring__label">' +
      pct(value) +
      '</span></div>'
    );
  }

  function evidenceFor(ids) {
    if (!ids || !ids.length) return [];
    return (report.evidence || []).filter((e) => ids.indexOf(e.id) !== -1);
  }

  function statusLabel(status) {
    const def = M.STEP_STATUS[status];
    return def ? def.label : 'Not reached';
  }

  function statusIcon(status) {
    const def = M.STEP_STATUS[status];
    return def ? def.icon : 'clock';
  }

  function stepBadge(step) {
    if (step.manualOverride) {
      return '<span class="tag tag--violet">' + M.icon('key', '', 11) + 'Manual override</span>';
    }
    if (step.verification && step.verification.mode === 'evidence') {
      return (
        '<span class="tag tag--mint">' +
        M.icon('camera', '', 11) +
        'Live frame · ' +
        pct(step.verification.confidence) +
        '</span>'
      );
    }
    if (step.evidenceIds && step.evidenceIds.length) {
      return '<span class="tag tag--mint">' + M.icon('camera', '', 11) + 'Frame evidence</span>';
    }
    if (step.status === 'attested') {
      return '<span class="tag tag--blue">' + M.icon('user', '', 11) + 'Attestation</span>';
    }
    if (step.status === 'skipped') {
      return '<span class="tag tag--amber">' + M.icon('flag', '', 11) + 'SOP exception</span>';
    }
    if (step.status === 'review') {
      return '<span class="tag tag--red">' + M.icon('alert', '', 11) + 'Held for review</span>';
    }
    return '<span class="tag tag--muted">' + M.icon(statusIcon(step.status), '', 11) + statusLabel(step.status) + '</span>';
  }

  function stepNote(step) {
    if (step.note) return step.note;
    if (step.manualOverride && step.verification) {
      return 'Closed by manual override — ' + (step.verification.reason || 'reason not recorded') + '.';
    }
    if (step.status === 'skipped') return 'Closed against the agent’s frame. The reason is recorded in the event log.';
    if (step.status === 'review') return 'No closure recorded. This step is still open and must be reworked.';
    if (step.status === 'locked' || step.status === 'pending') return 'The SOP did not reach this step before close-out.';
    if (step.status === 'attested') return 'Technician attested completion. This step does not require a frame.';
    return '';
  }

  /* ------------------------------------------------------------------------
     Empty state
     ------------------------------------------------------------------------ */

  function renderEmpty() {
    if (briefId) briefId.textContent = 'Service report';
    if (briefDevice) briefDevice.textContent = 'No record found';

    const hasAny = M.reports.list().length > 0;
    root.innerHTML =
      '<div class="empty" style="margin:70px auto 0;max-width:480px">' +
      '<span style="color:var(--mint)">' +
      M.icon('file', '', 34) +
      '</span>' +
      '<h1 style="font-size:22px;margin-top:6px">' +
      (wantedId && hasAny ? 'That report is not on this device' : 'No report on this device yet') +
      '</h1>' +
      '<p class="small" style="max-width:400px">' +
      (wantedId && hasAny
        ? 'The link points to a report that was never closed here. Reports live in this browser’s local storage — nothing is uploaded.'
        : 'Close a work order in the workspace and TARa assembles the audit-ready report automatically. You can also open the seeded sample from the work queue.') +
      '</p>' +
      '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;justify-content:center">' +
      '<a class="btn btn--primary" href="index.html" data-icon="arrowLeft">Work queue</a>' +
      '<a class="btn btn--ghost" href="workspace.html">Open WO-1042</a>' +
      '</div></div>';
    M.hydrateIcons(root);
  }

  if (!report) {
    renderEmpty();
    return;
  }

  /* ------------------------------------------------------------------------
     Derive the headline
     ------------------------------------------------------------------------ */

  const counts = report.counts || {};
  const partial = report.outcome === 'partial';
  const held = counts.review || 0;
  const open = Math.max(0, (counts.total || 0) - (counts.closed || 0));
  const compliance = report.compliance != null ? report.compliance : 0;

  const headline = partial
    ? held
      ? held + ' step' + (held === 1 ? '' : 's') + ' held for review'
      : 'Closed as partial — ' + open + ' step' + (open === 1 ? '' : 's') + ' not reached'
    : 'Fault resolved and verified';

  const summary = partial
    ? 'The task was closed before every gate cleared. Held and unreached steps stay visible below — a partial close does not launder incomplete work.'
    : 'Every evidence-gated step closed on a usable live frame or a recorded attestation. Verified, attested and excepted steps are kept separate so a supervisor can see what was actually proven.';

  if (briefId) briefId.textContent = report.id;
  if (briefDevice) {
    briefDevice.textContent = report.workOrderId + ' · ' + report.device;
  }

  /* ------------------------------------------------------------------------
     Step record
     ------------------------------------------------------------------------ */

  function renderSteps() {
    return (report.steps || [])
      .map((step) => {
        const evs = evidenceFor(step.evidenceIds).filter((e) => e.accepted);
        const dotTone =
          step.status === 'verified'
            ? ''
            : step.status === 'attested'
            ? ' rec__dot--blue'
            : step.status === 'review'
            ? ' rec__dot--red'
            : step.status === 'skipped'
            ? ' rec__dot--amber'
            : '';
        return (
          '<div class="rec' +
          (step.branch ? ' is-branch' : '') +
          '">' +
          '<span class="rec__dot' +
          dotTone +
          '">' +
          M.icon(statusIcon(step.status), '', 12) +
          '</span>' +
          '<div>' +
          '<div class="rec__title">' +
          esc(step.title) +
          '<span class="rec__clause">' +
          esc(step.clause) +
          '</span>' +
          stepBadge(step) +
          '</div>' +
          '<div class="rec__note">' +
          esc(stepNote(step)) +
          '</div>' +
          (evs.length
            ? '<div class="rec__evidence">' +
              evs
                .map(
                  (ev) =>
                    '<img src="' +
                    ev.url +
                    '" alt="Evidence for ' +
                    esc(step.clause) +
                    '" data-evidence="' +
                    ev.id +
                    '" title="Open ' +
                    esc(ev.id) +
                    '" />'
                )
                .join('') +
              '</div>'
            : '') +
          '</div>' +
          '<div class="rec__time">' + (step.completedAt ? M.fmt.time(step.completedAt) : '—') + '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  /* ------------------------------------------------------------------------
     Evidence gallery
     ------------------------------------------------------------------------ */

  function evidenceCard(ev) {
    const step = (report.steps || []).find((s) => s.id === ev.stepId);
    const rejected = !ev.accepted;
    return (
      '<button class="evidence-card" data-evidence="' +
      ev.id +
      '" style="text-align:left;padding:0;background:transparent;font:inherit;color:inherit;' +
      (rejected ? 'border-color:var(--amber-line)' : '') +
      '">' +
      '<div class="thumb" style="border:0;border-bottom:1px solid var(--line);border-radius:0">' +
      '<img src="' +
      ev.url +
      '" alt="Frame ' +
      ev.id +
      '" />' +
      '<span class="thumb__tag" style="color:' +
      (rejected ? 'var(--amber)' : 'var(--mint)') +
      '">' +
      (rejected ? 'rejected' : 'accepted') +
      '</span></div>' +
      '<div class="evidence-card__body">' +
      '<div class="evidence-card__title">' +
      M.icon(rejected ? 'alert' : 'checkCircle', '', 11) +
      esc(step ? step.clause + ' · ' + step.title : ev.id) +
      '</div>' +
      '<div class="evidence-card__meta"><span>' +
      (rejected ? 'retake requested' : 'model ' + pct(ev.confidence)) +
      '</span><b>' +
      M.fmt.time(ev.ts) +
      '</b></div>' +
      '</div></button>'
    );
  }

  function renderEvidence() {
    const all = report.evidence || [];
    const accepted = all.filter((e) => e.accepted);
    const rejected = all.filter((e) => !e.accepted);

    if (!all.length) {
      return '<div class="empty" style="padding:20px 10px">' + M.icon('camera', '', 22) + 'No frames were attached to this task.</div>';
    }

    return (
      '<div class="mini-label" style="margin-top:0">Accepted · ' +
      accepted.length +
      '</div>' +
      '<div class="evidence-grid">' +
      accepted.map(evidenceCard).join('') +
      '</div>' +
      (rejected.length
        ? '<div class="mini-label" style="margin-top:16px;color:var(--amber)">Rejected · ' +
          rejected.length +
          ' <span style="text-transform:none;letter-spacing:0;font-weight:500;color:var(--dim)">kept in the record on purpose</span></div>' +
          '<div class="evidence-grid">' +
          rejected.map(evidenceCard).join('') +
          '</div>'
        : '') +
      '<p class="tiny dim" style="margin-top:10px">Rejected frames are shown to prove the gate refused to guess. They are never counted as evidence.</p>'
    );
  }

  /* ------------------------------------------------------------------------
     Deviations + escalations
     ------------------------------------------------------------------------ */

  function renderDeviations() {
    const deviations = report.deviations || [];
    const escalations = report.escalations || [];
    if (!deviations.length && !escalations.length) {
      return (
        '<div class="empty" style="padding:18px 10px">' +
        M.icon('shield', '', 22) +
        'No deviations, exceptions or escalations on this task.' +
        '</div>'
      );
    }

    const devCards = deviations
      .map(
        (d) =>
          '<div class="deviation-card' +
          (d.severity === 'major' ? ' deviation-card--red' : '') +
          '">' +
          '<div class="deviation-card__top">' +
          M.icon('flag', '', 12) +
          esc(d.title) +
          '</div>' +
          '<p>' +
          esc(d.detail) +
          '</p>' +
          (d.resolution ? '<p style="color:inherit;opacity:.8;margin-top:3px"><b>Resolution:</b> ' + esc(d.resolution) + '</p>' : '') +
          '<div class="deviation-card__meta">' +
          esc(d.clause) +
          ' · ' +
          M.fmt.time(d.ts) +
          '</div></div>'
      )
      .join('');

    const escCards = escalations
      .map(
        (e) =>
          '<div class="deviation-card deviation-card--red">' +
          '<div class="deviation-card__top">' +
          M.icon('help', '', 12) +
          'Escalation · ' +
          esc(e.type || 'Assistance') +
          '</div>' +
          '<p>' +
          esc(e.detail || e.title || '') +
          '</p>' +
          '<div class="deviation-card__meta">' +
          M.fmt.time(e.ts) +
          ' · ' +
          (e.resolvedAt ? 'resolved ' + M.fmt.time(e.resolvedAt) + (e.resolvedBy ? ' · ' + esc(e.resolvedBy) : '') : 'open at close-out') +
          '</div></div>'
      )
      .join('');

    return (
      (escalations.length ? '<div class="mini-label">Escalations</div>' + escCards : '') +
      (deviations.length ? '<div class="mini-label"' + (escalations.length ? ' style="margin-top:14px"' : '') + '>Deviations</div>' + devCards : '')
    );
  }

  /* ------------------------------------------------------------------------
     Timeline
     ------------------------------------------------------------------------ */

  function renderTimeline() {
    return (report.events || [])
      .slice()
      .reverse()
      .map((ev) => {
        const step = ev.stepId ? (report.steps || []).find((s) => s.id === ev.stepId) : null;
        return (
          '<div class="audit-item audit-item--' +
          (ev.tone || 'muted') +
          '">' +
          '<div class="audit-item__rail"><span class="audit-item__dot">' +
          M.icon(EVENT_ICON[ev.type] || 'activity', '', 10) +
          '</span></div>' +
          '<div class="audit-item__main">' +
          '<div class="audit-item__title">' +
          esc(ev.label) +
          '</div>' +
          '<div class="audit-item__meta"><span>' +
          esc(String(ev.type).replace(/_/g, ' ')) +
          '</span>' +
          (step ? '<span>' + esc(step.clause) + '</span>' : '') +
          '</div></div>' +
          '<div class="audit-item__time">' +
          M.fmt.time(ev.ts) +
          '</div></div>'
        );
      })
      .join('');
  }

  /* ------------------------------------------------------------------------
     Signature
     ------------------------------------------------------------------------ */

  function signatureBlock() {
    const sig = report.signature;
    if (!sig) {
      return (
        '<div class="signature">' +
        '<b>Awaiting supervisor</b>' +
        '<span>This report is complete but not signed. Sign-off is stored in this browser only.</span>' +
        '</div>'
      );
    }
    return (
      '<div class="signature">' +
      '<b>' +
      esc(sig.by || SUPERVISOR.name) +
      '</b>' +
      '<span>' +
      esc(sig.role || SUPERVISOR.role) +
      ' · ' +
      M.fmt.dateTime(sig.at) +
      '</span>' +
      (sig.note ? '<span style="color:var(--amber);margin-top:3px">“' + esc(sig.note) + '”</span>' : '') +
      '</div>'
    );
  }

  function saveSignature(sig) {
    report.signature = sig;
    M.reports.save(report);
    render();
    M.ui.toast(
      sig
        ? sig.status === 'approved'
          ? 'Report signed off. The signature is stored with the record.'
          : 'Report returned to the technician with a note.'
        : 'Sign-off cleared. The report is awaiting review again.',
      { type: sig && sig.status === 'returned' ? 'warn' : 'success', icon: sig ? 'badge' : 'refresh' }
    );
  }

  function openReturnModal() {
    M.ui.modal({
      kicker: 'Supervisor review',
      title: 'Return this report',
      subtitle: 'The note is stored with the report and shown to the technician.',
      size: 'narrow',
      body:
        '<div class="field"><label for="returnNote">What needs to change?</label>' +
        '<textarea class="textarea" id="returnNote" placeholder="e.g. Show the switch again — the current frame does not show the socket clearly."></textarea></div>' +
        '<div class="modal-note modal-note--amber" style="margin-top:10px">Returning does not delete evidence. It flags the record for rework and keeps the audit trail intact.</div>',
      actions: [
        { label: 'Cancel', tone: 'ghost' },
        {
          label: 'Return report',
          tone: 'danger',
          icon: 'arrowLeft',
          close: false,
          onClick: (modal, close) => {
            const note = modal.querySelector('#returnNote').value.trim();
            if (!note) {
              M.ui.toast('Add a short note so the return is actionable.', { type: 'warn', icon: 'flag' });
              modal.querySelector('#returnNote').focus();
              return;
            }
            close();
            saveSignature({
              status: 'returned',
              by: SUPERVISOR.name,
              role: SUPERVISOR.role,
              at: Date.now(),
              note: note,
            });
          },
        },
      ],
    });
  }

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */

  function render() {
    const sig = report.signature;
    const approved = sig && sig.status === 'approved';
    const returned = sig && sig.status === 'returned';

    root.innerHTML =
      /* Head ------------------------------------------------------------- */
      '<header class="report-head">' +
      '<div>' +
      '<div class="eyebrow">Service report · ' +
      esc(report.id) +
      ' · ' +
      esc(report.sop.id) +
      ' ' +
      esc(report.sop.version) +
      '</div>' +
      '<h1>' +
      esc(report.sop.title) +
      '</h1>' +
      '<div class="report-head__meta">' +
      '<span class="tag tag--mint">' +
      esc(report.workOrderId) +
      '</span>' +
      '<span>' +
      esc(report.device) +
      '</span><span class="sep">·</span>' +
      '<span>' +
      esc(report.customer) +
      '</span><span class="sep">·</span>' +
      '<span>' +
      esc(report.technician.name) +
      ' · ' +
      esc(report.technician.bay) +
      '</span><span class="sep">·</span>' +
      '<span>' +
      esc(M.fmt.dateTime(report.completedAt)) +
      '</span>' +
      (partial
        ? '<span class="tag tag--amber" style="margin-left:4px">' + M.icon('alert', '', 11) + 'Partial close</span>'
        : '<span class="tag tag--mint" style="margin-left:4px">' + M.icon('check', '', 11) + 'Complete</span>') +
      (approved
        ? '<span class="tag tag--blue" style="margin-left:4px">' + M.icon('badge', '', 11) + 'Signed off</span>'
        : returned
        ? '<span class="tag tag--amber" style="margin-left:4px">' + M.icon('refresh', '', 11) + 'Returned</span>'
        : '') +
      '</div></div>' +
      '<div class="report-head__actions no-print">' +
      '<button class="btn btn--ghost btn--sm" data-print data-icon="print">Print / PDF</button>' +
      '<button class="btn btn--ghost btn--sm" data-export data-icon="download">Export JSON</button>' +
      '<a class="btn btn--ghost btn--sm" href="workspace.html" data-icon="camera">Session</a>' +
      '</div></header>' +

      /* Hero ------------------------------------------------------------- */
      '<section class="report-hero">' +
      '<div>' +
      '<div class="eyebrow">Outcome</div>' +
      '<h2 style="font-size:20px;letter-spacing:-.02em;margin:4px 0 6px">' +
      esc(headline) +
      '</h2>' +
      '<p class="small" style="color:var(--text-2);max-width:620px">' +
      esc(summary) +
      '</p>' +
      '<div class="report-hero__facts">' +
      '<div class="fact"><span>Technician</span><b>' +
      esc(report.technician.name) +
      ' · L2</b></div>' +
      '<div class="fact"><span>Active time</span><b>' +
      duration(report.durationMs) +
      '</b></div>' +
      '<div class="fact"><span>Steps closed</span><b>' +
      (counts.closed || 0) +
      ' of ' +
      (counts.total || 0) +
      '</b></div>' +
      '<div class="fact"><span>Evidence</span><b>' +
      (counts.acceptedEvidence || 0) +
      ' accepted · ' +
      (counts.rejectedEvidence || 0) +
      ' rejected</b></div>' +
      '<div class="fact"><span>Deviations</span><b>' +
      (counts.deviations || 0) +
      '</b></div>' +
      '</div></div>' +
      '<div class="report-score">' +
      ring(compliance, 'Steps closed', partial ? 'amber' : null) +
      '<div class="report-score__text"><b>' +
      (partial ? 'Partial close' : 'Audit-ready') +
      '</b><span>' +
      (partial
        ? (counts.closed || 0) + ' of ' + (counts.total || 0) + ' steps closed. Held steps remain open work.'
        : 'All ' + (counts.total || 0) + ' steps closed with evidence or a recorded attestation.') +
      '</span></div></div></section>' +

      /* Grid ------------------------------------------------------------- */
      '<div class="report-grid">' +
      '<div class="report-col">' +

      '<section class="panel"><header class="panel__head">' +
      '<h2>Step record</h2>' +
      '<span class="tiny dim" style="margin-left:auto">' +
      (counts.total || 0) +
      ' steps · branch steps indented</span></header>' +
      '<div class="panel__body" style="padding:6px 18px 12px">' +
      renderSteps() +
      '</div></section>' +

      '<section class="panel"><header class="panel__head">' +
      '<h2>Evidence</h2>' +
      '<span class="tag tag--muted" style="margin-left:auto">' +
      (counts.acceptedEvidence || 0) +
      ' accepted · ' +
      (counts.rejectedEvidence || 0) +
      ' rejected</span></header>' +
      '<div class="panel__body" style="padding:14px 16px">' +
      renderEvidence() +
      '</div></section>' +

      '<section class="panel"><header class="panel__head">' +
      '<h2>Deviations &amp; escalations</h2>' +
      '<span class="tag ' +
      (report.deviations.length || report.escalations.length ? 'tag--amber' : 'tag--mint') +
      '" style="margin-left:auto">' +
      (report.deviations.length || 0) +
      ' deviation' +
      ((report.deviations.length || 0) === 1 ? '' : 's') +
      ' · ' +
      (report.escalations.length || 0) +
      ' escalation' +
      ((report.escalations.length || 0) === 1 ? '' : 's') +
      '</span></header>' +
      '<div class="panel__body" style="padding:14px 16px">' +
      renderDeviations() +
      '</div></section>' +

      '<section class="panel"><header class="panel__head">' +
      '<h2>Event timeline</h2>' +
      '<span class="tiny dim" style="margin-left:auto">Append-only · ' +
      (report.events || []).length +
      ' entries</span></header>' +
      '<div class="panel__body" style="padding:16px 18px;max-height:420px;overflow:auto">' +
      '<div class="timeline">' +
      renderTimeline() +
      '</div></div></section>' +

      '</div>' +

      /* Rail ------------------------------------------------------------- */
      '<aside class="report-rail report-col">' +

      '<section class="panel"><header class="panel__head">' +
      '<h2>Supervisor sign-off</h2>' +
      '<span class="signoff__stamp' +
      (approved ? ' is-approved' : '') +
      '" style="margin-left:auto">' +
      M.icon(approved ? 'badge' : returned ? 'refresh' : 'clock', '', 10) +
      (approved ? 'Approved' : returned ? 'Returned' : 'Awaiting') +
      '</span></header>' +
      '<div class="panel__body" style="padding:14px 16px">' +
      '<div class="signoff">' +
      signatureBlock() +
      '</div>' +
      '<div class="row no-print" style="gap:6px;margin-top:10px;flex-wrap:wrap">' +
      '<button class="btn btn--primary btn--sm grow" data-sign="approve" data-icon="check">' +
      (sig ? 'Sign again' : 'Approve') +
      '</button>' +
      '<button class="btn btn--ghost btn--sm grow" data-sign="return" data-icon="arrowLeft">' +
      'Return' +
      '</button>' +
      '</div>' +
      (sig
        ? '<button class="btn btn--quiet btn--sm btn--block no-print" data-sign="clear" style="margin-top:6px">Clear sign-off</button>'
        : '') +
      '<p class="tiny dim" style="margin-top:8px">Demo only — sign-off is stored in this browser, not sent anywhere.</p>' +
      '</div></section>' +

      '<section class="panel"><header class="panel__head">' +
      '<h2>Evidence balance</h2>' +
      '<span class="tiny dim" style="margin-left:auto">How each step closed</span></header>' +
      '<div class="panel__body" style="padding:8px 16px 12px">' +
      '<div class="integrity-row">' +
      M.icon('camera', '', 13) +
      'Verified by frame<b>' +
      (counts.verified || 0) +
      '</b></div>' +
      '<div class="integrity-row">' +
      M.icon('user', '', 13) +
      'Technician attested<b>' +
      (counts.attested || 0) +
      '</b></div>' +
      '<div class="integrity-row">' +
      M.icon('flag', '', 13) +
      'SOP exception<b>' +
      (counts.skipped || 0) +
      '</b></div>' +
      '<div class="integrity-row">' +
      M.icon('alert', '', 13) +
      'Held for review<b>' +
      (counts.review || 0) +
      '</b></div>' +
      '<div class="integrity-row">' +
      M.icon('key', '', 13) +
      'Manual overrides<b>' +
      (report.steps || []).filter((s) => s.manualOverride).length +
      '</b></div>' +
      '</div></section>' +

      '<section class="panel"><header class="panel__head">' +
      '<h2>Record integrity</h2>' +
      '<span class="tag tag--muted" style="margin-left:auto">Demo digest</span></header>' +
      '<div class="panel__body" style="padding:8px 16px 12px">' +
      '<div class="integrity-row">' +
      M.icon('file', '', 13) +
      'Report ID<b>' +
      esc(report.id) +
      '</b></div>' +
      '<div class="integrity-row">' +
      M.icon('layers', '', 13) +
      'SOP<b>' +
      esc(report.sop.id + ' ' + report.sop.version) +
      '</b></div>' +
      '<div class="integrity-row">' +
      M.icon('clock', '', 13) +
      'Generated<b>' +
      M.fmt.dateTime(report.completedAt) +
      '</b></div>' +
      '<div class="integrity-row">' +
      M.icon('hash', '', 13) +
      'Digest<b title="' +
      esc(report.hash) +
      '">' +
      esc(String(report.hash || '').slice(0, 20)) +
      '…</b></div>' +
      '<p class="tiny dim" style="margin-top:8px;line-height:1.5">FNV-1a demo digest over the step states, evidence verdicts and close-out time. Not cryptography — it demonstrates how a tamper-evident record would be anchored.</p>' +
      '</div></section>' +

      '<section class="panel"><header class="panel__head">' +
      '<h2>Controlled document</h2></header>' +
      '<div class="panel__body" style="padding:12px 16px">' +
      '<p class="small" style="color:var(--text-2)">This report cites <b>' +
      esc(report.sop.id + ' ' + report.sop.version) +
      '</b> without modification. The agent could explain a clause; it could not substitute a different procedure.</p>' +
      '<div class="row" style="gap:6px;margin-top:9px;flex-wrap:wrap">' +
      '<span class="tag tag--muted">' +
      esc(report.sop.owner) +
      '</span>' +
      '<span class="tag tag--mint">Scope unchanged</span>' +
      '</div></div></section>' +

      '</aside></div>' +

      /* Footer ----------------------------------------------------------- */
      '<footer class="report-foot">' +
      '<span>TARa · frontend prototype · agent, vision and sign-off are simulated. No data leaves this device.</span>' +
      '<span class="mono">' +
      esc(report.workOrderId + ' / ' + report.sop.id + ' / ' + String(report.hash || '').slice(0, 12)) +
      '</span></footer>';

    M.hydrateIcons(root);
    bind();
  }

  /* ------------------------------------------------------------------------
     Bindings
     ------------------------------------------------------------------------ */

  function bind() {
    const printBtn = root.querySelector('[data-print]');
    if (printBtn) printBtn.addEventListener('click', () => window.print());

    const exportBtn = root.querySelector('[data-export]');
    if (exportBtn) exportBtn.addEventListener('click', exportJson);

    root.querySelectorAll('[data-sign]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.sign;
        if (action === 'approve') {
          saveSignature({
            status: 'approved',
            by: SUPERVISOR.name,
            role: SUPERVISOR.role,
            at: Date.now(),
            note: null,
          });
        } else if (action === 'return') {
          openReturnModal();
        } else if (action === 'clear') {
          saveSignature(null);
        }
      });
    });

    root.querySelectorAll('[data-evidence]').forEach((node) => {
      node.addEventListener('click', () => {
        const ev = (report.evidence || []).find((e) => e.id === node.dataset.evidence);
        if (ev) openEvidence(ev);
      });
    });
  }

  function openEvidence(ev) {
    const step = (report.steps || []).find((s) => s.id === ev.stepId);
    const checks = (ev.checks || [])
      .map((c) => {
        const state = c.state === 'ok' ? 'ok' : c.state === 'warn' ? 'warn' : c.state === 'fail' ? 'fail' : 'pending';
        const ic = state === 'ok' ? 'checkCircle' : state === 'warn' ? 'alert' : state === 'fail' ? 'x' : 'clock';
        return (
          '<div class="check is-' +
          state +
          '">' +
          M.icon(ic, '', 12) +
          '<span>' +
          esc(c.label) +
          (c.note ? ' · <span class="dim">' + esc(c.note) + '</span>' : '') +
          '</span></div>'
        );
      })
      .join('');

    M.ui.modal({
      kicker: 'Evidence · ' + ev.id,
      title: step ? step.clause + ' · ' + step.title : 'Frame',
      size: 'wide',
      body:
        '<div class="thumb" style="border-radius:12px"><img src="' +
        ev.url +
        '" alt="Evidence frame ' +
        ev.id +
        '" /></div>' +
        '<div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap">' +
        '<span class="tag ' +
        (ev.accepted ? 'tag--mint' : 'tag--amber') +
        '">' +
        (ev.accepted ? 'Accepted' : 'Rejected') +
        '</span>' +
        '<span class="tag tag--muted">' +
        pct(ev.confidence) +
        ' confidence</span>' +
        '<span class="tag tag--muted">' +
        M.fmt.time(ev.ts) +
        '</span>' +
        '<span class="tag tag--muted">' +
        (ev.source === 'live' ? 'Webcam' : 'Simulated feed') +
        '</span>' +
        (ev.verdict ? '<span class="tag tag--muted">verdict · ' + esc(ev.verdict) + '</span>' : '') +
        '</div>' +
        (checks ? '<div class="criteria" style="margin-top:12px">' + checks + '</div>' : '') +
        (ev.note ? '<div class="modal-note" style="margin-top:12px">' + esc(ev.note) + '</div>' : ''),
      actions: [{ label: 'Close', tone: 'ghost' }],
    });
  }

  function exportJson() {
    const payload = Object.assign({}, report);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = report.id + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    M.ui.toast('Report exported as JSON — frames are embedded as data URLs.', {
      type: 'success',
      icon: 'download',
    });
  }

  /* ------------------------------------------------------------------------
     Go
     ------------------------------------------------------------------------ */

  render();
})();
