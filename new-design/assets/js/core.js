/* ==========================================================================
   TARa — core utilities
   Icons, formatting, localStorage, session model, overlays.
   ========================================================================== */

window.TARa = window.TARa || {};

(function () {
  const M = window.TARa;

  /* ------------------------------------------------------------------------
     Icon
     ------------------------------------------------------------------------ */

  M.icon = function (name, className, size) {
    const paths = M.ICON[name] || '';
    const s = size || 16;
    return (
      '<svg class="ic ' +
      (className || '') +
      '" width="' +
      s +
      '" height="' +
      s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths +
      '</svg>'
    );
  };

  /* ------------------------------------------------------------------------
     Formatting / helpers
     ------------------------------------------------------------------------ */

  const pad = (n) => String(n).padStart(2, '0');

  M.fmt = {
    time(ts) {
      const d = new Date(ts);
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    },

    dateTime(ts) {
      const d = new Date(ts);
      return (
        d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
        ' · ' +
        pad(d.getHours()) +
        ':' +
        pad(d.getMinutes())
      );
    },

    clock(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return pad(m) + ':' + pad(s);
    },

    duration(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return m + 'm ' + pad(s) + 's';
    },

    ago(ts) {
      const diff = Math.max(0, Date.now() - ts);
      const min = Math.floor(diff / 60000);
      if (min < 1) return 'just now';
      if (min < 60) return min + ' min ago';
      const h = Math.floor(min / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    },

    pct(n) {
      return Math.round(n * 100) + '%';
    },
  };

  M.esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  M.uid = function (prefix) {
    const rand =
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(16).slice(2, 10);
    return (prefix || 'id') + '_' + rand;
  };

  M.hash = function (input) {
    // FNV-1a based demo digest. Not cryptography — clearly labelled in the UI.
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    const str = String(input);
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822519);
    }
    const part = (n) => (n >>> 0).toString(16).padStart(8, '0');
    return part(h1) + part(h2) + part(h1 ^ h2) + part(Math.imul(h1, h2));
  };

  M.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  M.debounce = function (fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  M.byId = (id) => document.getElementById(id);

  M.hydrateIcons = function (root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      if (el.dataset.iconDone) return;
      el.insertAdjacentHTML('afterbegin', M.icon(el.dataset.icon));
      el.dataset.iconDone = '1';
    });
  };

  /* ------------------------------------------------------------------------
     Storage
     ------------------------------------------------------------------------ */

  const memoryStore = {};

  const storageWorks = (function () {
    try {
      const k = '__memora_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (err) {
      return false;
    }
  })();

  M.store = {
    available: storageWorks,

    get(key, fallback) {
      try {
        const raw = storageWorks ? window.localStorage.getItem(key) : memoryStore[key];
        return raw ? JSON.parse(raw) : fallback;
      } catch (err) {
        return fallback;
      }
    },

    set(key, value) {
      const raw = JSON.stringify(value);
      try {
        if (storageWorks) window.localStorage.setItem(key, raw);
        else memoryStore[key] = raw;
      } catch (err) {
        memoryStore[key] = raw;
        console.warn('[TARa] storage quota reached, kept in memory only', err);
      }
    },

    remove(key) {
      try {
        if (storageWorks) window.localStorage.removeItem(key);
        else delete memoryStore[key];
      } catch (err) {
        delete memoryStore[key];
      }
    },
  };

  /* ------------------------------------------------------------------------
     Session model
     ------------------------------------------------------------------------ */

  const KEY_SESSION = 'memora.field.session.v1';
  const KEY_REPORTS = 'memora.field.reports.v1';

  M.session = {
    KEY: KEY_SESSION,

    get() {
      const state = M.store.get(KEY_SESSION, null);
      if (!state || !state.stepOrder) return null;
      return state;
    },

    save(state) {
      M.store.set(KEY_SESSION, state);
    },

    clear() {
      M.store.remove(KEY_SESSION);
    },

    start(workOrder) {
      const now = Date.now();
      const sop = M.SOP;
      const order = sop.order.slice();

      const steps = {};
      order.forEach((id) => {
        steps[id] = {
          status: 'locked',
          attempts: 0,
          evidenceIds: [],
          verification: null,
          completedAt: null,
          note: null,
          manualOverride: false,
        };
      });
      steps.s1.status = 'active';

      const first = sop.steps.s1;

      const state = {
        id: M.uid('SES'),
        workOrderId: workOrder.id,
        device: workOrder.device,
        customer: workOrder.customer,
        sopId: sop.id,
        sopVersion: sop.version,
        status: 'active', // active | paused | complete
        startedAt: now,
        totalPaused: 0,
        pauseStartedAt: null,
        completedAt: null,
        outcome: null,
        currentStepId: 's1',
        stepOrder: order,
        steps: steps,
        evidence: [],
        events: [],
        messages: [
          {
            id: M.uid('msg'),
            role: 'system',
            text: 'Session started · ' + sop.id + ' ' + sop.version + ' · Bay 3',
            ts: now,
          },
          {
            id: M.uid('msg'),
            role: 'agent',
            text: first.agentIntro,
            tag: sop.id + ' ' + first.clause,
            ts: now + 1,
          },
        ],
        deviations: [],
        escalations: [],
        demo: true,
      };

      this.log(state, 'task_started', 'Task started · ' + workOrder.id, 'mint', {
        device: workOrder.device,
      });
      this.log(state, 'step_entered', 'Step 1 opened · ' + first.title, 'muted', {
        stepId: 's1',
      });

      this.save(state);
      return state;
    },

    log(state, type, label, tone, meta) {
      state.events.push({
        id: M.uid('evt'),
        ts: Date.now(),
        type: type,
        label: label,
        tone: tone || 'muted',
        stepId: (meta && meta.stepId) || state.currentStepId || null,
        meta: meta || null,
      });
    },

    push(state, role, text, tag) {
      state.messages.push({
        id: M.uid('msg'),
        role: role,
        text: text,
        tag: tag || null,
        ts: Date.now(),
      });
    },

    elapsed(state) {
      if (!state) return 0;
      const end = state.status === 'paused' && state.pauseStartedAt ? state.pauseStartedAt : state.completedAt || Date.now();
      const paused = state.totalPaused + (state.status === 'paused' && state.pauseStartedAt ? Date.now() - state.pauseStartedAt : 0);
      return Math.max(0, end - state.startedAt - paused);
    },

    pause(state) {
      if (state.status !== 'active') return;
      state.status = 'paused';
      state.pauseStartedAt = Date.now();
      this.log(state, 'task_paused', 'Task paused by technician', 'amber');
    },

    resume(state) {
      if (state.status !== 'paused') return;
      if (state.pauseStartedAt) {
        state.totalPaused += Date.now() - state.pauseStartedAt;
        state.pauseStartedAt = null;
      }
      state.status = 'active';
      this.log(state, 'task_resumed', 'Task resumed', 'mint');
    },

    complete(state, outcome) {
      state.status = 'complete';
      state.completedAt = Date.now();
      state.outcome = outcome || 'complete';
      state.pauseStartedAt = null;
      this.log(
        state,
        'task_completed',
        outcome === 'partial' ? 'Task closed as partial · escalated' : 'Task completed · report generated',
        outcome === 'partial' ? 'amber' : 'mint'
      );
      this.save(state);
    },
  };

  /* ------------------------------------------------------------------------
     Report model
     ------------------------------------------------------------------------ */

  M.reports = {
    KEY: KEY_REPORTS,

    list() {
      const list = M.store.get(KEY_REPORTS, []);
      return Array.isArray(list) ? list : [];
    },

    save(report) {
      const list = this.list().filter((r) => r.id !== report.id);
      list.unshift(report);
      M.store.set(KEY_REPORTS, list.slice(0, 8));
      return report;
    },

    find(id) {
      const list = this.list();
      if (!id) return list[0] || null;
      return list.find((r) => r.id === id) || null;
    },

    build(state) {
      const sop = M.SOP;
      const steps = state.stepOrder.map((id) => {
        const def = sop.steps[id];
        const st = state.steps[id];
        return {
          id: id,
          title: def.title,
          clause: def.clause,
          branch: !!def.branch,
          status: st.status,
          note: st.note || null,
          verification: st.verification || null,
          completedAt: st.completedAt || null,
          manualOverride: !!st.manualOverride,
          evidenceIds: st.evidenceIds.slice(),
        };
      });

      const closed = steps.filter((s) => ['verified', 'attested', 'skipped'].includes(s.status)).length;
      const verified = steps.filter((s) => s.status === 'verified').length;
      const attested = steps.filter((s) => s.status === 'attested').length;
      const skipped = steps.filter((s) => s.status === 'skipped').length;
      const review = steps.filter((s) => s.status === 'review').length;
      const hasEvidence = steps.filter((s) => s.evidenceIds.length > 0).length;

      const accepted = state.evidence.filter((e) => e.accepted);
      const rejected = state.evidence.filter((e) => !e.accepted);

      const durationMs =
        (state.completedAt || Date.now()) - state.startedAt - (state.totalPaused || 0);

      const report = {
        id: 'RPT-' + String(state.workOrderId).replace(/[^0-9]/g, ''),
        workOrderId: state.workOrderId,
        device: state.device,
        customer: state.customer,
        technician: M.TECH,
        sop: {
          id: sop.id,
          title: sop.title,
          version: sop.version,
          owner: sop.owner,
        },
        startedAt: state.startedAt,
        completedAt: state.completedAt || Date.now(),
        durationMs: durationMs,
        outcome: state.outcome || 'complete',
        steps: steps,
        evidence: state.evidence,
        events: state.events,
        deviations: state.deviations,
        escalations: state.escalations,
        counts: {
          total: steps.length,
          closed: closed,
          verified: verified,
          attested: attested,
          skipped: skipped,
          review: review,
          evidenceSteps: hasEvidence,
          acceptedEvidence: accepted.length,
          rejectedEvidence: rejected.length,
          deviations: state.deviations.length,
          escalations: state.escalations.length,
        },
        signature: null,
        demo: true,
      };

      report.compliance = steps.length ? closed / steps.length : 0;
      report.hash = M.hash(
        JSON.stringify({
          id: report.id,
          wo: report.workOrderId,
          steps: steps.map((s) => [s.id, s.status, s.completedAt]),
          evidence: state.evidence.map((e) => [e.id, e.verdict, e.accepted]),
          completedAt: report.completedAt,
        })
      );

      return report;
    },
  };

  /* ------------------------------------------------------------------------
     Overlays: toasts, drawers, modals
     ------------------------------------------------------------------------ */

  let activeOverlay = null;

  function ensureToastHost() {
    let host = document.querySelector('.toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toasts';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    return host;
  }

  function closeOverlay() {
    if (!activeOverlay) return;
    const node = activeOverlay;
    activeOverlay = null;
    node.scrim.style.animation = 'fadeIn 0.16s ease reverse forwards';
    node.root.style.animation = 'modalIn 0.16s ease reverse forwards';
    setTimeout(() => {
      node.scrim.remove();
      node.root.remove();
    }, 150);
    if (node.onClose) node.onClose();
    document.removeEventListener('keydown', onOverlayKeydown);
  }

  function onOverlayKeydown(e) {
    if (e.key === 'Escape' && activeOverlay && activeOverlay.dismissible) {
      e.stopPropagation();
      closeOverlay();
    }
  }

  function mountOverlay({ root, scrim, dismissible, onClose }) {
    if (activeOverlay) closeOverlay();
    activeOverlay = { root, scrim, dismissible, onClose };
    document.body.appendChild(scrim);
    document.body.appendChild(root);
    document.addEventListener('keydown', onOverlayKeydown);

    if (dismissible) {
      scrim.addEventListener('click', closeOverlay);
      const closeBtn = root.querySelector('[data-close]');
      if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    }
  }

  M.ui = {
    toast(message, options) {
      const opts = options || {};
      const type = opts.type || 'info';
      const iconName =
        opts.icon ||
        (type === 'success' ? 'checkCircle' : type === 'warn' ? 'alert' : type === 'error' ? 'alert' : 'info');
      const host = ensureToastHost();
      const node = document.createElement('div');
      node.className = 'toast toast--' + type;
      node.innerHTML = M.icon(iconName) + '<div>' + message + '</div>';
      host.appendChild(node);
      const life = opts.duration || 4200;
      setTimeout(() => {
        node.classList.add('is-out');
        setTimeout(() => node.remove(), 240);
      }, life);
      return node;
    },

    drawer(options) {
      const scrim = document.createElement('div');
      scrim.className = 'scrim';
      const root = document.createElement('aside');
      root.className = 'drawer';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.innerHTML =
        '<div class="drawer__head">' +
        '<div class="grow">' +
        (options.kicker
          ? '<div class="eyebrow" style="margin-bottom:4px">' + options.kicker + '</div>'
          : '') +
        '<h2>' +
        options.title +
        '</h2>' +
        (options.subtitle ? '<div class="small muted" style="margin-top:3px">' + options.subtitle + '</div>' : '') +
        '</div>' +
        '<button class="icon-btn" data-close aria-label="Close">' +
        M.icon('x', '', 17) +
        '</button>' +
        '</div>' +
        '<div class="drawer__body">' +
        options.body +
        '</div>' +
        (options.footer ? '<div class="drawer__foot">' + options.footer + '</div>' : '');

      mountOverlay({
        root: root,
        scrim: scrim,
        dismissible: true,
        onClose: options.onClose,
      });

      if (options.onMount) options.onMount(root);
      return root;
    },

    modal(options) {
      const scrim = document.createElement('div');
      scrim.className = 'scrim scrim--modal';
      const root = document.createElement('div');
      root.className =
        'modal' + (options.size === 'wide' ? ' modal--wide' : options.size === 'narrow' ? ' modal--narrow' : '');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');

      const actions = (options.actions || [])
        .map((a, i) => {
          return (
            '<button class="btn ' +
            (a.tone ? 'btn--' + a.tone : 'btn--ghost') +
            '" data-modal-action="' +
            i +
            '">' +
            (a.icon ? M.icon(a.icon) : '') +
            M.esc(a.label) +
            '</button>'
          );
        })
        .join('');

      root.innerHTML =
        '<div class="modal__head">' +
        '<div class="grow">' +
        (options.kicker ? '<div class="eyebrow" style="margin-bottom:5px">' + options.kicker + '</div>' : '') +
        '<h2>' +
        options.title +
        '</h2>' +
        (options.subtitle ? '<p class="small muted" style="margin-top:4px">' + options.subtitle + '</p>' : '') +
        '</div>' +
        (options.dismissible === false
          ? ''
          : '<button class="icon-btn" data-close aria-label="Close">' + M.icon('x', '', 17) + '</button>') +
        '</div>' +
        '<div class="modal__body">' +
        options.body +
        '</div>' +
        (actions ? '<div class="modal__foot">' + actions + '</div>' : '');

      mountOverlay({
        root: root,
        scrim: scrim,
        dismissible: options.dismissible !== false,
        onClose: options.onClose,
      });

      root.querySelectorAll('[data-modal-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = (options.actions || [])[Number(btn.dataset.modalAction)];
          if (!action) return;
          if (action.onClick) action.onClick(root, closeOverlay);
          if (action.close !== false) closeOverlay();
        });
      });

      if (options.onMount) options.onMount(root);
      return root;
    },

    close: closeOverlay,

    closeAll() {
          closeOverlay();
    },
  };
})();
