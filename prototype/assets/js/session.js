/* ==========================================================================
   TARa — live session controller
   Continuous video on the left, a grounded chat agent on the right.
   No backend: vision, search and speech are simulated or local.
   ========================================================================== */

(function () {
  const M = window.TARa;
  if (!M || !document.getElementById('chatInner')) return;

  const SOP = M.SOP;
  const LIVE = M.LIVE;
  const WO = M.WORK_ORDERS.find((w) => w.id === 'WO-1042');
  if (!WO) return;

  const el = {
    canvas: M.byId('demoCanvas'),
    video: M.byId('liveVideo'),
    camBtn: M.byId('camBtn'),
    modeChip: M.byId('modeChip'),
    recTime: M.byId('recTime'),
    visionLine: M.byId('visionLine'),
    stageStep: M.byId('stageStep'),
    stageTitle: M.byId('stageTitle'),
    stageSub: M.byId('stageSub'),
    scanHud: M.byId('scanHud'),
    savedBadge: M.byId('savedBadge'),
    lastFrame: M.byId('lastFrame'),
    orb: M.byId('orb'),
    agentState: M.byId('agentState'),
    progressBar: M.byId('progressBar'),
    progressText: M.byId('progressText'),
    auditChip: M.byId('auditChip'),
    chatScroll: M.byId('chatScroll'),
    chatInner: M.byId('chatInner'),
    composer: M.byId('composer'),
    input: M.byId('composerInput'),
    voicebar: M.byId('voicebar'),
    voiceState: M.byId('voiceState'),
  };

  const stored = M.session.get();
  const resumable =
    stored && stored.version === 2 && stored.workOrderId === WO.id && stored.status === 'active';

  let state = resumable ? stored : freshState();
  let busy = false;
  let camMode = 'demo';
  let tts = true;
  let speaking = false;
  let mediaStream = null;
  let scene = null;
  let captionTimer = 0;
  let recTimer = 0;
  let autoTimer = 0;
  let voice = {
    supported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    rec: null,
    listening: false,
    denied: false,
    restart: 0,
    token: 0,
  };

  const WEB_KEY = { s1: 'label', s2: 'switch', s3: 'swap', s4: 'double', s5: 'closeout' };
  const TOOL_LABEL = { web: 'Web search', images: 'Reference images', parts: 'Parts & tools' };
  const EVENT_ICON = {
    task_started: 'play',
    step_entered: 'chevronRight',
    step_verified: 'checkCircle',
    step_attested: 'user',
    evidence_captured: 'camera',
    evidence_rejected: 'alert',
    deviation_logged: 'flag',
    escalation_created: 'alert',
    tool_call: 'search',
    task_completed: 'flag',
  };

  function freshState() {
    const next = M.session.start(WO);
    next.version = 2;
    next.messages = [];
    next.research = [];
    M.session.save(next);
    return next;
  }

  function save() {
    M.session.save(state);
  }

  function currentDef() {
    return SOP.steps[state.currentStepId];
  }

  function stepNumber(id) {
    return state.stepOrder.indexOf(id) + 1;
  }

  function fmtText(text) {
    return M.esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  function say(text, opts) {
    const o = opts || {};
    state.messages.push({
      id: M.uid('msg'),
      role: 'agent',
      text: text,
      tag: o.tag || null,
      ts: Date.now(),
    });
    save();
    speak(text);
  }

  function push(role, data) {
    const msg = Object.assign({ id: M.uid('msg'), role: role, ts: Date.now() }, data);
    state.messages.push(msg);
    save();
    return msg;
  }

  function systemLine(text) {
    push('system', { text: text });
  }

  /* ------------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------------ */

  function renderAll() {
    el.chatInner.innerHTML = state.messages.map(renderMessage).join('');
    M.hydrateIcons(el.chatInner);
    updateHud();
    requestAnimationFrame(() => {
      // Structured cards anchor on the line before them so cue text and the
      // exchange that produced them stay visible; plain rows anchor on the bottom.
      const rows = el.chatInner.children;
      const last = rows[rows.length - 1];
      if (!last || !/stepmsg|toolcard|closecard|vcard/.test(last.className || '')) {
        el.chatScroll.scrollTop = el.chatScroll.scrollHeight;
        return;
      }
      let anchor = null;
      let fallback = null;
      for (let i = rows.length - 2; i >= 0 && i >= rows.length - 7; i--) {
        const cls = rows[i].className || '';
        if (/ububble/.test(cls)) {
          anchor = rows[i];
          break;
        }
        if (!fallback && /mrow/.test(cls)) fallback = rows[i];
      }
      anchor = anchor || fallback;
      const t = (anchor || last).getBoundingClientRect();
      const sc = el.chatScroll.getBoundingClientRect();
      el.chatScroll.scrollTop = Math.max(0, el.chatScroll.scrollTop + t.top - sc.top - 10);
      // If that hides the end of a long turn, follow the content to the bottom.
      if (last.getBoundingClientRect().bottom > el.chatScroll.getBoundingClientRect().bottom - 4) {
        el.chatScroll.scrollTop = el.chatScroll.scrollHeight;
      }
    });
  }

  function renderMessage(m) {
    switch (m.role) {
      case 'system':
        return '<div class="sysline">' + M.icon('activity') + M.esc(m.text) + '</div>';
      case 'user':
        return '<div class="ububble">' + fmtText(m.text) + '</div>';
      case 'agent':
        return (
          '<div class="mrow"><span class="mavatar">' +
          M.icon('spark') +
          '</span><div><div class="mtext">' +
          fmtText(m.text) +
          '</div>' +
          (m.tag ? '<div class="msrc">' + M.esc(m.tag) + '</div>' : '') +
          '</div></div>'
        );
      case 'step':
        return renderStep(m);
      case 'verify':
        return renderVerify(m);
      case 'tool':
        return renderTool(m);
      case 'close':
        return renderClose(m);
      case 'notice':
        return (
          '<div class="notice notice--' +
          (m.tone || 'muted') +
          '">' +
          M.icon(m.icon || 'info') +
          '<span>' +
          fmtText(m.text) +
          '</span></div>'
        );
      default:
        return '';
    }
  }

  function renderStep(m) {
    const def = SOP.steps[m.stepId];
    if (!def) return '';
    const cfg = LIVE.steps[m.stepId] || {};
    const st = state.steps[m.stepId];
    const active =
      state.status === 'active' &&
      state.currentStepId === m.stepId &&
      st.status === 'active' &&
      !busy;
    const total = state.stepOrder.length;
    const cue = active ? cfg.cue || '' : '';

    const status = M.STEP_STATUS[st.status] || M.STEP_STATUS.active;

    return (
      '<div class="stepmsg">' +
      '<div class="stepmsg__top">' +
      '<span class="clausechip">' +
      M.esc(def.clause) +
      '</span>' +
      '<span>Step ' +
      stepNumber(m.stepId) +
      ' of ' +
      total +
      ' · ' +
      M.esc(def.estimate || '') +
      '</span>' +
      '<span class="tag tag--' +
      status.tag +
      '">' +
      M.icon(status.icon, '', 9) +
      status.label +
      '</span>' +
      '</div>' +
      '<h3>' +
      M.esc(def.title) +
      '</h3>' +
      '<p>' +
      M.esc(def.instruction) +
      '</p>' +
      '<div class="criteria-row">' +
      def.criteria.map((c) => '<span>' + M.esc(c) + '</span>').join('') +
      '</div>' +
      (cue
        ? '<div class="stepmsg__cue">' + M.icon('mic') + '<span>' + M.esc(cue) + '</span></div>'
        : '') +
      '</div>'
    );
  }

  function renderVerify(m) {
    const ev = state.evidence.find((e) => e.id === m.evidenceId);
    if (!ev) return '';
    const pass = ev.accepted;
    const checks = (ev.checks || [])
      .map((c) => {
        const icon = c.state === 'ok' ? 'checkCircle' : c.state === 'warn' ? 'alert' : c.state === 'fail' ? 'x' : 'clock';
        return (
          '<span class="vcard__check is-' +
          (c.state || 'pending') +
          '">' +
          M.icon(icon) +
          '<span>' +
          M.esc(c.label) +
          (c.note ? ' · ' + M.esc(c.note) : '') +
          '</span></span>'
        );
      })
      .join('');

    return (
      '<div class="vcard' +
      (pass ? '' : ' is-warn') +
      '">' +
      '<div class="vcard__frame"><img src="' +
      M.esc(ev.url) +
      '" alt="Frame saved from the live feed" />' +
      '<span class="vcard__badge">' +
      (pass ? 'FRAME SAVED' : 'NOT USABLE') +
      '</span></div>' +
      '<div><div class="vcard__title">' +
      M.icon(pass ? 'checkCircle' : 'alert') +
      (pass ? 'Verified on live video' : 'Could not verify') +
      '<span class="vcard__conf">' +
      Math.round((ev.confidence || 0) * 100) +
      '%</span></div>' +
      '<p class="vcard__summary">' +
      M.esc(m.summary || ev.note || '') +
      '</p><div class="vcard__checks">' +
      checks +
      '</div><div class="vcard__meta">' +
      M.fmt.time(ev.ts) +
      ' · ' +
      (ev.source === 'live' ? 'webcam' : 'simulated feed') +
      ' · ' +
      M.esc(ev.id.slice(-6)) +
      '</div>' +
      (pass
        ? ''
        : '<div class="vcard__cue">' +
          M.icon('mic') +
          '<span>Say “check again” when the frame is ready.</span></div>') +
      '</div></div>'
    );
  }

  function renderTool(m) {
    const label = TOOL_LABEL[m.tool] || 'Tool';
    const def = SOP.steps[m.stepId];
    let body = '';

    if (!m.data) {
      body =
        '<div class="loading"><i></i><i></i><i></i><span>Searching · ' +
        M.esc(m.query || '') +
        '</span></div>';
    } else if (m.tool === 'images') {
      const howto = m.data.howto
        ? '<div class="howto"><b>How to</b><ol>' +
          m.data.howto.map((s) => '<li>' + M.esc(s) + '</li>').join('') +
          '</ol></div>'
        : '';
      body =
        howto +
        '<div class="imgrid">' +
        m.data.results
          .map(
            (r) =>
              '<div class="imgtile imgtile--' +
              (r.tone || 'mint') +
              '"><div class="imgtile__img">' +
              ((M.ART && M.ART[r.art]) || (r.icon ? M.icon(r.icon) : '')) +
              '</div><div class="imgtile__body"><b>' +
              M.esc(r.title) +
              '</b><span>' +
              M.esc(r.note) +
              '</span></div></div>'
          )
          .join('') +
        '</div>';
    } else if (m.tool === 'parts') {
      body = m.data.results
        .map(
          (r) =>
            '<div class="partrow"><div class="partrow__main"><b>' +
            M.esc(r.title) +
            '</b><span>' +
            M.esc(r.note) +
            '</span></div><div class="partrow__side"><b>' +
            M.esc(r.price) +
            '</b><span>' +
            M.esc(r.stock) +
            '</span></div></div>'
        )
        .join('');
    } else {
      body = m.data.results
        .map(
          (r) =>
            '<div class="result"><span class="result__fav">' +
            M.esc((r.site || '?').charAt(0).toUpperCase()) +
            '</span><div><div class="result__title">' +
            M.esc(r.title) +
            (r.tag ? '<span class="result__site">' + M.esc(r.tag) + '</span>' : '') +
            '<div class="result__site">' +
            M.esc(r.site) +
            '</div></div><div class="result__snip">' +
            M.esc(r.snippet) +
            '</div></div></div>'
        )
        .join('');
    }

    return (
      '<div class="toolcard"><div class="toolcard__head">' +
      M.icon(m.tool === 'web' ? 'search' : m.tool === 'images' ? 'eye' : 'tool') +
      '<b>' +
      label +
      '</b><span class="toolcard__query">' +
      M.esc(m.query || '') +
      '</span><span class="toolcard__state">' +
      (m.data ? (m.data.results.length + ' results') : 'searching…') +
      '</span></div><div class="toolcard__body">' +
      body +
      '</div><div class="toolcard__foot">Simulated · no network request · ' +
      M.esc(SOP.id + ' ' + (def ? def.clause : '')) +
      '</div></div>'
    );
  }

  function renderClose(m) {
    const verified = state.stepOrder.filter((id) => state.steps[id].status === 'verified').length;
    const attested = state.stepOrder.filter((id) => state.steps[id].status === 'attested').length;
    const partial = m.mode === 'partial';
    return (
      '<div class="closecard"><div class="stepmsg__top"><span class="clausechip">§5.1</span><span>Close-out</span></div>' +
      '<h3>' +
      (partial ? 'Job stays open' : 'Work complete — report ready') +
      '</h3><p>' +
      (partial
        ? 'The key test did not pass. I can close the session as a partial with the escalation attached, or you can re-seat the switch and test again.'
        : 'Every step is recorded. The report separates frame-verified checks from your attestations and keeps the rejected frame.') +
      '</p><div class="closecard__stats"><span><b>' +
      verified +
      '</b>frame-verified</span><span><b>' +
      attested +
      '</b>attested</span><span><b>' +
      state.evidence.filter((e) => !e.accepted).length +
      '</b>rejected frame</span><span><b>' +
      state.escalations.length +
      '</b>escalations</span></div>' +
      '<div class="closecard__cue">' +
      M.icon('mic') +
      '<span>' +
      (partial
        ? 'Say “re-test the key” to re-seat and try again, or “close as partial”.'
        : 'Say “generate the report” when you are ready.') +
      '</span></div></div>'
    );
  }

  /* ------------------------------------------------------------------------
     HUD, progress, stage
     ------------------------------------------------------------------------ */

  function updateHud() {
    const total = state.stepOrder.length;
    const closed = state.stepOrder.filter((id) =>
      ['verified', 'attested', 'skipped'].includes(state.steps[id].status)
    ).length;
    const idx = Math.max(
      1,
      Math.min(total, state.status === 'complete' ? total : state.stepOrder.indexOf(state.currentStepId) + 1)
    );

    el.progressBar.style.width = Math.round((closed / total) * 100) + '%';
    el.progressText.textContent =
      state.status === 'complete' ? 'Session complete' : 'Step ' + idx + ' of ' + total;
    el.auditChip.textContent = state.events.length + ' events';

    const def = currentDef();
    const cfg = LIVE.steps[state.currentStepId] || {};
    el.stageStep.textContent = 'Step ' + idx + '/' + total + ' · ' + (def ? def.clause : '');
    el.stageTitle.textContent = def ? def.title : 'Session';
    el.stageSub.textContent = def && def.evidence ? def.evidence.hint : def ? def.summary : '';

    if (scene) {
      scene.set({ focus: cfg.focus || 'device', zoom: cfg.zoom || null, fixed: !!cfg.fixed });
    }

    const last = state.evidence.filter((e) => e.accepted).slice(-1)[0];
    if (last) {
      el.lastFrame.hidden = false;
      const img = el.lastFrame.querySelector('img');
      if (img) img.src = last.url;
    } else {
      el.lastFrame.hidden = true;
    }

    el.orb.classList.toggle('is-working', busy);
    el.agentState.textContent = busy ? 'Analysing live feed' : 'Watching live';
    renderSavedBadge(state.evidence.filter((e) => e.accepted).slice(-1)[0]);
  }

  function renderSavedBadge(ev) {
    if (!ev || !ev.ts || Date.now() - ev.ts > 4000) {
      el.savedBadge.hidden = true;
      return;
    }
    el.savedBadge.textContent = 'Frame saved · ' + M.fmt.time(ev.ts);
    el.savedBadge.hidden = false;
  }

  function showScan(on) {
    el.scanHud.hidden = !on;
    if (on) el.visionLine.textContent = 'Analysing the live frame…';
  }

  function setVoiceState(kind, text) {
    if (!el.voicebar) return;
    el.voicebar.dataset.state = kind;
    if (el.voiceState) el.voiceState.textContent = text;
  }

  function refreshVoiceState() {
    if (busy) {
      setVoiceState('working', 'Checking the live frame…');
    } else if (speaking) {
      setVoiceState('speaking', 'TARa is replying…');
    } else if (!voice.supported) {
      setVoiceState('off', 'Voice unavailable — type below');
    } else if (voice.denied) {
      setVoiceState('off', 'Mic blocked — allow it or type below');
    } else if (voice.listening) {
      setVoiceState('listening', 'Listening — speak normally');
    } else {
      setVoiceState('idle', 'Mic idle — click anywhere or type below');
    }
  }

  function setBusy(value) {
    busy = !!value;
    el.orb.classList.toggle('is-working', busy);
    el.agentState.textContent = busy ? 'Analysing live feed' : 'Watching live';
    refreshVoiceState();
    renderAll();
  }

  function paintCaptions() {
    if (busy) return;
    const cfg = LIVE.steps[state.currentStepId];
    const list = state.status === 'complete' ? LIVE.idleCaptions : (cfg && cfg.captions) || LIVE.idleCaptions;
    const next = list[Math.floor(Math.random() * list.length)];
    el.visionLine.textContent = next;
  }

  function tickRec() {
    el.recTime.textContent = M.fmt.clock(M.session.elapsed(state));
    renderSavedBadge(state.evidence.filter((e) => e.accepted).slice(-1)[0]);
  }

  function captureFrame(cfg) {
    // A real webcam must supply the evidence frame, not the simulated canvas.
    if (camMode === 'live' && el.video.videoWidth) {
      const c = document.createElement('canvas');
      c.width = 760;
      c.height = 428;
      const ctx = c.getContext('2d');
      const scale = Math.max(c.width / el.video.videoWidth, c.height / el.video.videoHeight);
      const w = el.video.videoWidth * scale;
      const h = el.video.videoHeight * scale;
      ctx.drawImage(el.video, (c.width - w) / 2, (c.height - h) / 2, w, h);
      return c.toDataURL('image/jpeg', 0.74);
    }
    return (scene && scene.capture({ focus: cfg.focus, zoom: cfg.zoom, fixed: !!cfg.fixed, t: 8 })) || '';
  }

  /* ------------------------------------------------------------------------
     Flow helpers
     ------------------------------------------------------------------------ */

  function addStepCard(stepId) {
    if (state.messages.some((m) => m.role === 'step' && m.stepId === stepId)) return;
    push('step', { stepId: stepId });
  }

  function finishStep(stepId, status, note) {
    const st = state.steps[stepId];
    const def = SOP.steps[stepId];
    st.status = status;
    st.note = note || st.note;
    st.completedAt = Date.now();
    st.verification = status === 'attested' ? { mode: 'attestation' } : st.verification;
    M.session.log(
      state,
      status === 'attested' ? 'step_attested' : 'step_verified',
      'Step ' + stepNumber(stepId) + ' ' + (status === 'attested' ? 'attested' : 'verified') + ' · ' + def.title,
      status === 'attested' ? 'blue' : 'mint',
      { stepId: stepId }
    );
    save();
  }

  function advanceFrom(stepId) {
    const idx = state.stepOrder.indexOf(stepId);
    const next = state.stepOrder[idx + 1];
    if (!next) {
      addCloseCard('complete');
      return;
    }
    state.currentStepId = next;
    state.steps[next].status = 'active';
    M.session.log(state, 'step_entered', 'Step ' + stepNumber(next) + ' opened · ' + SOP.steps[next].title, 'muted', {
      stepId: next,
    });
    save();
    say(SOP.steps[next].agentIntro, { tag: SOP.id + ' ' + SOP.steps[next].clause });
    addStepCard(next);
    if (SOP.steps[next].kind === 'evidence' || SOP.steps[next].kind === 'finalize') {
      scheduleAutoScan(next, next === 's2' ? 1900 : 2100);
    }
  }

  function addCloseCard(mode) {
    if (state.messages.some((m) => m.role === 'close' && m.mode === mode)) return;
    push('close', { mode: mode || 'complete' });
  }

  function scheduleAutoScan(stepId, delay) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      if (busy || state.status !== 'active' || state.currentStepId !== stepId) return;
      if (state.steps[stepId].status !== 'active') return;
      runScan(stepId).catch((e) =>
        console.error('runScan ' + stepId + ' failed:', e && e.stack ? e.stack : e)
      );
    }, delay);
  }

  async function runScan(stepId) {
    if (busy) return;
    const def = SOP.steps[stepId];
    if (!def || state.status !== 'active' || state.currentStepId !== stepId) return;
    if (state.steps[stepId].status !== 'active') return;

    const cfg = LIVE.steps[stepId] || {};
    const st = state.steps[stepId];
    const script = (def.evidence && def.evidence.script) || [];
    if (!script.length) return;
    const result = script[Math.min(st.attempts, script.length - 1)];
    st.attempts += 1;

    setBusy(true);
    showScan(true);
    el.scanHud.querySelector('.stage__scanlabel').textContent = cfg.scanning || 'Analysing live video…';
    await M.wait(1500);

    let url = '';
    try {
      const view =
        stepId === 's2' && st.attempts > 1
          ? Object.assign({}, cfg, { focus: 'switch', zoom: 4.6 })
          : cfg;
      url = captureFrame(view);
    } catch (e) {
      url = '';
    }

    const ev = {
      id: M.uid('EV'),
      stepId: stepId,
      url: url,
      verdict: result.verdict,
      confidence: result.confidence,
      accepted: result.verdict === 'pass',
      source: camMode,
      ts: Date.now(),
      checks: result.checks,
      note: result.summary,
    };
    state.evidence.push(ev);
    showScan(false);

    if (ev.accepted) {
      st.evidenceIds.push(ev.id);
      st.verification = { mode: 'evidence', confidence: result.confidence };
      M.session.log(state, 'evidence_captured', 'Frame accepted · ' + def.title, 'mint', {
        stepId: stepId,
        evidenceId: ev.id,
      });
      push('verify', { stepId: stepId, evidenceId: ev.id, summary: result.summary });
      say(cfg.passLine || def.agentDone, { tag: SOP.id + ' ' + def.clause });
      finishStep(stepId, 'verified', result.summary);

      if (stepId === 's2') {
        await runTool('images', stepId, {
          line: 'Reference frames from the simulated image search — the 3-pin switch, its hot-swap socket and the puller.',
        });
      }

      if (stepId === 's5') {
        addCloseCard('complete');
      } else {
        advanceFrom(stepId);
      }
    } else {
      M.session.log(state, 'evidence_rejected', 'Frame rejected · ' + def.title, 'amber', {
        stepId: stepId,
        evidenceId: ev.id,
      });
      push('verify', { stepId: stepId, evidenceId: ev.id, summary: result.summary });
      say(result.summary);
    }

    save();
    busy = false;
    el.orb.classList.remove('is-working');
    el.agentState.textContent = 'Watching live';
    refreshVoiceState();
    paintCaptions();
    renderAll();
  }

  function choose(stepId, choiceId, opts) {
    if (busy || state.status !== 'active' || state.currentStepId !== stepId) return;
    const echo = !(opts && opts.echo === false);
    const def = SOP.steps[stepId];
    if (!def || state.steps[stepId].status !== 'active') return;
    const cfg = LIVE.steps[stepId] || {};

    if (def.kind === 'attest') {
      const opt = def.attest.options.find((o) => o.id === choiceId);
      if (!opt) return;
      if (echo) push('user', { text: opt.label });
      if (choiceId === 'tight') {
        say(cfg.tightLine || 'If it will not seat, do not force it. Pull the switch and show me the pins.');
        renderAll();
        return;
      }
      say(cfg.seatedLine || opt.label + ' — attested.', { tag: SOP.id + ' ' + def.clause });
      finishStep(stepId, 'attested', opt.label);
      advanceFrom(stepId);
      renderAll();
      return;
    }

    if (def.kind === 'choice') {
      const choice = def.choices.find((c) => c.id === choiceId);
      if (!choice) return;
      if (echo) push('user', { text: choice.label });
      say(choice.agent, { tag: SOP.id + ' ' + def.clause });

      if (choiceId === 'pass') {
        finishStep(stepId, 'attested', choice.note);
        advanceFrom(stepId);
      } else {
        const now = Date.now();
        state.steps[stepId].status = 'review';
        state.steps[stepId].note = choice.note;
        state.steps[stepId].completedAt = now;
        state.deviations.push({
          id: M.uid('DEV'),
          ts: now,
          severity: 'major',
          clause: def.clause,
          title: choice.label,
          detail: choice.note + ' The repair cannot be closed on this result.',
          resolution: null,
        });
        state.escalations.push({
          id: M.uid('ESC'),
          ts: now,
          type: 'Key still failing',
          title: 'E key did not pass the five-press test',
          detail: 'Swap did not restore reliable registration. Re-seat or escalate rather than closing.',
          resolvedAt: null,
          resolvedBy: null,
        });
        M.session.log(state, 'deviation_logged', 'Deviation · key test failed', 'amber', { stepId: stepId });
        M.session.log(state, 'escalation_created', 'Escalation · key test failed', 'red', { stepId: stepId });
        addCloseCard('partial');
      }
      save();
      renderAll();
    }
  }

  function finish(outcome) {
    if (busy) return;
    if (state.status === 'complete') {
      const existing = M.reports.find();
      if (existing) location.href = 'report.html?id=' + encodeURIComponent(existing.id);
      return;
    }
    if (outcome === 'complete' && !state.steps.s5.evidenceIds.length) {
      say('I still need the final condition frame. Show me the whole board and say “check again”.', {
        tag: SOP.id + ' §5.1',
      });
      renderAll();
      return;
    }
    busy = true;
    M.session.complete(state, outcome);
    const report = M.reports.build(state);
    M.reports.save(report);
    M.ui.toast(
      'Report ' +
        report.id +
        ' generated · ' +
        (outcome === 'partial' ? 'closed partial with escalation.' : 'all steps recorded.'),
      { type: outcome === 'partial' ? 'warn' : 'success', icon: 'file', duration: 1400 }
    );
    renderAll();
    setTimeout(() => {
      location.href = 'report.html?id=' + encodeURIComponent(report.id);
    }, 700);
  }

  function retest() {
    if (busy || state.status !== 'active') return;
    state.messages = state.messages.filter((m) => m.role !== 'close');
    state.deviations.forEach((d) => {
      if (!d.resolution) d.resolution = 'Switch re-seated; key re-tested.';
    });
    state.escalations.forEach((e) => {
      if (!e.resolvedAt) {
        e.resolvedAt = Date.now();
        e.resolvedBy = 'Technician · retest';
      }
    });
    state.steps.s4.status = 'active';
    state.steps.s4.completedAt = null;
    state.currentStepId = 's4';
    state.status = 'active';
    M.session.log(state, 'step_entered', 'Step 4 reopened · test the key', 'muted', { stepId: 's4' });
    save();
    say('Re-seat the switch, then test E five times again.', { tag: SOP.id + ' §4.1' });
    renderAll();
  }

  /* ------------------------------------------------------------------------
     Agent tools
     ------------------------------------------------------------------------ */

  async function runTool(tool, stepId, opts) {
    const o = opts || {};
    const id = stepId || state.currentStepId;
    let data;
    if (tool === 'parts') {
      data = M.RESEARCH.parts;
    } else if (tool === 'images') {
      const cfg = LIVE.steps[id] || {};
      const topic = o.topic || cfg.images || 'switch';
      data = M.RESEARCH.images[topic] || M.RESEARCH.images.switch;
    } else {
      data = M.RESEARCH.web[WEB_KEY[id] || 'default'] || M.RESEARCH.web.default;
    }
    if (!data) return;

    const msg = push('tool', { tool: tool, stepId: id, query: data.query, data: null });
    renderAll();
    await M.wait(900);
    msg.data = data;
    state.research.push({ tool: tool, query: data.query, stepId: id, ts: Date.now() });
    M.session.log(state, 'tool_call', 'Agent used ' + TOOL_LABEL[tool] + ' · ' + data.query, 'blue', {
      stepId: id,
      tool: tool,
    });
    save();
    renderAll();
    if (o.line) {
      say(o.line, { tag: 'Simulated search · ' + data.results.length + ' results' });
      renderAll();
    }
    return data;
  }

  /* ------------------------------------------------------------------------
     Chat intents
     ------------------------------------------------------------------------ */

  function reference(topic) {
    const line = {
      keycap:
        'A keycap is the plastic cap you press. To take it off, hook the wire puller under two opposite corners and pull straight up — never lever it. Here are reference images and the steps.',
      switch:
        'The switch is the unit under the keycap. This board uses a 3-pin hot-swap switch: cross stem on top, two pins underneath. Here are the switch, the pins and the socket.',
      tools:
        'Use the wire keycap puller for the cap, then the switch puller for the switch. Hooks under, straight up, never twist. No metal tweezers near the socket. Here are the references.',
    }[topic];
    say(line, { tag: 'Simulated image search · ' + currentDef().clause });
    runTool('images', state.currentStepId, { topic: topic });
  }

  function send(text) {
    const value = String(text || '').trim();
    if (!value) return;
    if (state.status !== 'active') {
      if (/report/i.test(value)) {
        const report = M.reports.find();
        if (report) location.href = 'report.html?id=' + encodeURIComponent(report.id);
      }
      return;
    }

    push('user', { text: value });
    save();
    const low = value.toLowerCase().replace(/[’]/g, "'");
    const def = currentDef();
    const id = state.currentStepId;

    // Reference questions: "what does a keycap look like", "what tool do I need?"
    if (/\b(tool|tools|puller)\b/.test(low) && /\b(what|which|how|use|need|take|remove|pull)\b/.test(low)) {
      renderAll();
      reference('tools');
      return;
    }
    if (
      /(key ?cap|keycap)/.test(low) &&
      /\b(what|how|look like|looks like|reference|remove|take off|pull off|underneath|underside)\b/.test(low)
    ) {
      renderAll();
      reference('keycap');
      return;
    }
    if (
      /\bswitch(es)?\b/.test(low) &&
      /\b(what|how|look like|looks like|reference|identify|pins?|underneath|inside)\b/.test(low)
    ) {
      renderAll();
      reference('switch');
      return;
    }

    // The flow is answered by voice.
    if (id === 's3') {
      if (/(won't seat|wont seat|can't seat|cant seat|not seat|stuck|too tight|needs force)/.test(low)) {
        renderAll();
        choose('s3', 'tight', { echo: false });
        return;
      }
      if (/(seated|seats|flush|snapped in|it's in|its in|all the way in|in place)/.test(low)) {
        renderAll();
        choose('s3', 'seated', { echo: false });
        return;
      }
    }
    if (id === 's4') {
      if (/(double|twice|two (characters|letters)|repeats|repeat)/.test(low)) {
        renderAll();
        choose('s4', 'double', { echo: false });
        return;
      }
      if (/(no response|dead|nothing|doesn't register|does not register|no character|not working)/.test(low)) {
        renderAll();
        choose('s4', 'dead', { echo: false });
        return;
      }
      if (/(register|clean press|every press|5 of 5|five of five|works|fixed|single character|types once|pass)/.test(low)) {
        renderAll();
        choose('s4', 'pass', { echo: false });
        return;
      }
    }

    if (
      (def.kind === 'evidence' || def.kind === 'finalize') &&
      /(check again|look again|retake|scan|ready|read (the )?label|key ?cap('s| is)? off|cap is off|pulled (the|it)|removed (the|it)|try again|show you)/.test(low)
    ) {
      renderAll();
      runScan(id).catch((e) => console.error('runScan failed:', e && e.stack ? e.stack : e));
      return;
    }

    if (/(close|finish).*(partial|open)|partial.*(close|finish)|close it open/.test(low)) {
      renderAll();
      finish('partial');
      return;
    }
    if (
      /(generate|make|open|create|build).*(the )?report|report.*(ready|now)|finish (the )?job|close (the )?job/.test(low)
    ) {
      renderAll();
      finish('complete');
      return;
    }
    if (/(re.?test|test.*again|re.?seat)/.test(low) && state.messages.some((m) => m.role === 'close')) {
      renderAll();
      retest();
      return;
    }

    if (/why|matter|reason/.test(low)) {
      say(def.why, { tag: SOP.id + ' ' + def.clause });
      renderAll();
      return;
    }
    if (/reference|image|photo|picture/.test(low)) {
      renderAll();
      runTool('images', id);
      return;
    }
    if (/parts|price|stock|which switch|which brush/.test(low)) {
      renderAll();
      runTool('parts', id);
      return;
    }
    if (/sop|clause|procedure/.test(low)) {
      renderAll();
      openSop();
      return;
    }
    if (/audit|activity|events|history/.test(low)) {
      renderAll();
      openActivity();
      return;
    }
    if (/second opinion|escalat|supervisor/.test(low)) {
      escalate();
      renderAll();
      return;
    }
    if (/search|look up|web|google/.test(low)) {
      renderAll();
      runTool('web', id);
      return;
    }
    if (/(webcam|live camera|camera mode)|use (my|the) camera/.test(low)) {
      renderAll();
      setCamera('live');
      return;
    }
    if (/(simulated|demo) (feed|camera)|turn off.*(webcam|camera)/.test(low)) {
      renderAll();
      setCamera('demo');
      return;
    }
    if (/(mute|stop talking|be quiet|silence)/.test(low)) {
      tts = false;
      say('Voice replies off. I am still listening.', { tag: 'Voice' });
      refreshVoiceState();
      renderAll();
      return;
    }
    if (/(unmute|voice on|talk to me|speak up)/.test(low)) {
      tts = true;
      say('Voice replies on.', { tag: 'Voice' });
      renderAll();
      return;
    }
    if (/help|what can you do/.test(low)) {
      renderAll();
      openHelp();
      return;
    }
    if (/skip/.test(low)) {
      say(
        'I cannot skip a gated step. ' +
          def.clause +
          ' is required before the next step opens — if it cannot be completed, I can escalate or close the job as partial.',
        { tag: SOP.id + ' ' + def.clause }
      );
      renderAll();
      return;
    }
    if (/worn|unreadable/.test(low)) {
      say(
        'Do not guess the serial. If the label is unreadable, stop intake and escalate — SOP §1.2 needs a confirmed identity, not a best effort.',
        { tag: SOP.id + ' §1.2' }
      );
      renderAll();
      return;
    }
    if (/soldered|hot.?swap/.test(low)) {
      say(
        'The socket in the last frame is a hot-swap socket — two contact openings, no solder. That is what makes this a Level 1 swap.',
        { tag: SOP.id + ' §2.3' }
      );
      renderAll();
      return;
    }
    if (/which app|text field/.test(low)) {
      say('Any text field works. Open the notes app, press E five times, and count the characters.');
      renderAll();
      return;
    }
    if (/where.*label|find the label/.test(low)) {
      say('On the underside of the case, next to the cable. The sticker lists model, serial and layout — that is the identity source in §1.2.');
      renderAll();
      return;
    }
    if (/what am i looking at|what.*looking at|what is that/.test(low)) {
      say('That is the exposed hot-swap socket. Two contact openings, no solder — the switch pulls straight out. Check the pins and socket edge before seating the replacement.');
      renderAll();
      return;
    }
    if (/what goes in/.test(low)) {
      say('Each step with its clause, every accepted and rejected frame, your two attestations, any deviation or escalation, and the full event trail. A supervisor can approve or return it from the report page.');
      renderAll();
      return;
    }
    if (/customer|copy|pdf/.test(low)) {
      say('Yes. The report page prints to PDF and exports JSON, with every frame embedded.');
      renderAll();
      return;
    }

    say(
      'I can stay grounded on ' +
        def.clause +
        '. Ask me why the step matters, what a keycap or switch looks like, check the SOP, or look up a part — I will not invent a procedure.',
      { tag: SOP.id + ' ' + def.clause }
    );
    renderAll();
  }

  function escalate() {
    const def = currentDef();
    const now = Date.now();
    state.escalations.push({
      id: M.uid('ESC'),
      ts: now,
      type: 'Second opinion',
      title: 'Technician requested a senior check',
      detail: 'Live session at ' + def.clause + ' · ' + def.title + '.',
      resolvedAt: null,
      resolvedBy: null,
    });
    M.session.log(state, 'escalation_created', 'Escalation · second opinion requested', 'red', {
      stepId: state.currentStepId,
    });
    save();
    say('Flagged for a supervisor. The escalation is attached to this step and will appear in the report.', {
      tag: 'Escalation open',
    });
  }

  /* ------------------------------------------------------------------------
     SOP, activity, help
     ------------------------------------------------------------------------ */

  function openSop() {
    const current = currentDef();
    M.session.log(state, 'tool_call', 'Agent opened ' + SOP.id + ' ' + SOP.version + ' · ' + current.clause, 'blue', {
      stepId: state.currentStepId,
      tool: 'sop',
    });
    save();
    const clauses = SOP.clauses
      .map(
        (c) =>
          '<div class="sop-section' +
          (current && c.id === current.clauseId ? ' is-current' : '') +
          '"><div class="sop-section__head"><span class="sop-section__id">' +
          M.esc(c.ref) +
          '</span><h3>' +
          M.esc(c.title) +
          '</h3></div><p>' +
          M.esc(c.body) +
          '</p></div>'
      )
      .join('');
    M.ui.drawer({
      kicker: 'Controlled document',
      title: SOP.title,
      subtitle: SOP.id + ' ' + SOP.version + ' · owner ' + SOP.owner,
      body:
        '<div class="sop-doc"><div class="sop-doc__meta"><span class="tag tag--mint">' +
        M.esc(SOP.id + ' ' + SOP.version) +
        '</span><span class="tag tag--muted">Effective ' +
        M.esc(SOP.effective) +
        '</span><span class="tag tag--muted">Review ' +
        M.esc(SOP.review) +
        '</span></div><div class="sop-section" style="border-top:0"><h3>Scope</h3><p>' +
        M.esc(SOP.scope) +
        '</p></div><div class="sop-section"><h3>Before you start</h3><ul class="small muted" style="margin:6px 0 0 16px;line-height:1.6">' +
        SOP.prerequisites.map((p) => '<li>' + M.esc(p) + '</li>').join('') +
        '</ul></div>' +
        clauses +
        '</div>',
    });
  }

  function openActivity() {
    const items = state.events
      .slice()
      .reverse()
      .map((ev) => {
        const tone = ev.tone || 'muted';
        return (
          '<div class="audit-item audit-item--' +
          tone +
          '"><div class="audit-item__rail"><span class="audit-item__dot">' +
          M.icon(EVENT_ICON[ev.type] || 'activity', '', 10) +
          '</span></div><div class="audit-item__main"><div class="audit-item__title">' +
          M.esc(ev.label) +
          '</div><div class="audit-item__meta">' +
          M.esc(ev.type.replace(/_/g, ' ')) +
          (ev.stepId ? ' · ' + M.esc(ev.stepId) : '') +
          '</div></div><div class="audit-item__time">' +
          M.fmt.time(ev.ts) +
          '</div></div>'
        );
      })
      .join('');
    M.ui.drawer({
      kicker: 'Audit trail',
      title: state.events.length + ' recorded events',
      subtitle: 'Session ' + state.id + ' · every gate, rejection, tool call and attestation.',
      body: '<div class="timeline">' + items + '</div>',
    });
  }

  function openHelp() {
    M.ui.modal({
      kicker: 'Live session',
      title: 'What TARa can do here',
      body:
        '<div class="pillar"><span class="pillar__ic">' +
        M.icon('eye') +
        '</span><div><b>It watches the live feed</b><p>There is no photo button. When a step needs evidence, the agent checks the current frame and keeps it. If the frame is unusable it asks you to show it again.</p></div></div>' +
        '<div class="pillar"><span class="pillar__ic">' +
        M.icon('layers') +
        '</span><div><b>It stays inside the SOP</b><p>The agent can explain a clause or escalate, but it cannot skip a gate or invent a procedure.</p></div></div>' +
        '<div class="pillar"><span class="pillar__ic">' +
        M.icon('search') +
        '</span><div><b>It can look things up</b><p>Ask “what does a keycap look like?” or “what tool do I need?” and it pulls simulated reference images plus the steps. Every lookup is logged in the audit trail.</p></div></div>' +
        '<div class="modal-note modal-note--mint" style="margin-top:14px"><b>Hands-free demo (about 2 minutes):</b><br />' +
        '1. The intake frame checks itself.<br />2. The first switch check is rejected because the keycap is on; say “the keycap is off” to check again.<br />' +
        '3. Say “seated”, then “registers every press”.<br />4. The finished board checks itself; say “generate the report”.<br />' +
        '<span style="opacity:.75">No buttons. Allow the microphone once; typing and Enter still work as a fallback.</span></div>' +
        '<div class="modal-note" style="margin-top:8px">Everything runs in the browser. Search results, vision and timings are simulated for the prototype.</div>',
      actions: [{ label: 'Back to the bench', tone: 'primary' }],
    });
  }

  /* ------------------------------------------------------------------------
     Voice — always-on listening, no buttons
     ------------------------------------------------------------------------ */

  function stopVoice() {
    clearTimeout(voice.restart);
    if (voice.rec) {
      voice.rec.onend = null;
      voice.rec.onresult = null;
      try {
        voice.rec.abort();
      } catch (e) {
        /* already stopped */
      }
      voice.rec = null;
    }
    voice.listening = false;
  }

  function startVoice() {
    if (!voice.supported || voice.denied || speaking || voice.rec) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec;
    try {
      rec = new SR();
    } catch (e) {
      voice.denied = true;
      refreshVoiceState();
      return;
    }
    voice.rec = rec;
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      voice.listening = true;
      refreshVoiceState();
    };
    rec.onresult = function (e) {
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += ' ' + e.results[i][0].transcript;
      }
      if (finalText.trim()) send(finalText.trim());
    };
    rec.onerror = function (e) {
      voice.listening = false;
      if (e.error === 'network') {
        voice.denied = true;
        setVoiceState('off', 'Voice needs a connection — type below');
        return;
      }
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        voice.denied = true;
      }
      refreshVoiceState();
    };
    rec.onend = function () {
      voice.listening = false;
      voice.rec = null;
      refreshVoiceState();
      if (voice.denied || speaking) return;
      voice.restart = setTimeout(startVoice, 450);
    };
    try {
      rec.start();
    } catch (e) {
      voice.rec = null;
      voice.denied = true;
      refreshVoiceState();
    }
  }

  function speak(text) {
    if (!tts || !window.speechSynthesis) return;
    voice.token += 1;
    const token = voice.token;
    speaking = true;
    stopVoice();
    refreshVoiceState();

    // Always release the mic when the reply ends, even if the browser never fires onend.
    const done = function () {
      if (token !== voice.token) return;
      speaking = false;
      refreshVoiceState();
      voice.restart = setTimeout(startVoice, 350);
    };
    try {
      const utter = new SpeechSynthesisUtterance(String(text).replace(/\*\*/g, ''));
      utter.rate = 1.03;
      utter.pitch = 0.96;
      utter.onend = done;
      utter.onerror = done;
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
      setTimeout(done, Math.min(20000, 1400 + String(text).length * 55));
    } catch (e) {
      done();
    }
  }

  function initVoice() {
    document.addEventListener('pointerdown', function () {
      if (!voice.supported || voice.denied || voice.rec || speaking) return;
      startVoice();
    });
    if (!voice.supported) {
      setVoiceState('off', 'Voice unavailable — type below');
      return;
    }
    setVoiceState('idle', 'Starting microphone…');
    setTimeout(startVoice, 800);
  }

  async function setCamera(mode) {
    if (mode === camMode) return;
    if (mode === 'live') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        M.ui.toast('Webcam is not available here — staying on the simulated feed.', { type: 'warn' });
        return;
      }
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        el.video.srcObject = mediaStream;
        el.video.hidden = false;
        el.canvas.style.visibility = 'hidden';
        camMode = 'live';
        el.modeChip.textContent = 'Webcam';
        el.camBtn.innerHTML = M.icon('camera') + 'Use simulated feed';
        if (scene) scene.setPaused(true);
        el.visionLine.textContent = 'Webcam live · tracking locally';
        M.ui.toast('Webcam connected. Nothing is uploaded.', { type: 'success', duration: 2200 });
      } catch (e) {
        M.ui.toast('Camera permission denied — staying on the simulated feed.', { type: 'warn' });
      }
      return;
    }
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    el.video.srcObject = null;
    el.video.hidden = true;
    el.canvas.style.visibility = 'visible';
    camMode = 'demo';
    el.modeChip.textContent = 'Simulated feed';
    el.camBtn.innerHTML = M.icon('camera') + 'Use webcam';
    if (scene) scene.setPaused(false);
    el.visionLine.textContent = 'Simulated feed · tracking the bench';
  }

  function initCamera() {
    initScene();
    el.camBtn.addEventListener('click', () => setCamera(camMode === 'demo' ? 'live' : 'demo'));
  }

  function initScene() {
    if (!el.canvas || !M.scene) return;
    try {
      scene = M.scene.create(el.canvas);
      scene.set({ focus: 'label', zoom: 1.9 });
    } catch (e) {
      scene = null;
    }
  }

  /* ------------------------------------------------------------------------
     Events
     ------------------------------------------------------------------------ */

  el.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.input.value;
    el.input.value = '';
    send(text);
  });

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  function boot() {
    M.hydrateIcons();

    if (!state.messages.length) {
      systemLine('Live session · ' + SOP.id + ' ' + SOP.version + ' · ' + WO.id);
      say(LIVE.intro, { tag: SOP.id + ' ' + SOP.steps.s1.clause });
      addStepCard('s1');
      scheduleAutoScan('s1', 2400);
    } else if (!state.messages.some((m) => m.role === 'step' && m.stepId === state.currentStepId)) {
      addStepCard(state.currentStepId);
    }

    initCamera();
    initVoice();
    renderAll();
    refreshVoiceState();
    tickRec();
    recTimer = setInterval(tickRec, 1000);
    captionTimer = setInterval(paintCaptions, 3400);
    paintCaptions();
  }

  window.addEventListener('beforeunload', () => {
    clearInterval(recTimer);
    clearInterval(captionTimer);
    clearTimeout(autoTimer);
    clearTimeout(voice.restart);
    stopVoice();
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    if (scene) scene.destroy();
  });

  boot();
})();
