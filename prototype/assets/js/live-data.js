/* ==========================================================================
   TARa — live session copy and simulated research results
   All content is fictional; tool results never leave the browser.
   ========================================================================== */

window.TARa = window.TARa || {};

TARa.LIVE = {
  intro:
    "I'm watching the bench live — no buttons, just talk to me. WO-1042 is the Keychron K2 with a double-typing E key. Show me the label underneath and I'll confirm intake. If you're unsure what a keycap or switch looks like, ask me and I'll pull reference images.",

  steps: {
    s1: {
      focus: 'label',
      zoom: 1.9,
      scanLabel: 'Read the label from live video',
      scanning: 'Reading the label…',
      cue: 'The camera check starts automatically. If I ask for another look, say “check again”.',
      captions: [
        'Label detected · reading model and serial',
        'Text sharpening · hold the board steady',
        'Model K2-A3 · cross-checking WO-1042',
      ],
      passLine: 'Intake matches WO-1042 — Keychron K2, serial ending 8214. We can pull the keycap now.',
      web: 'keychron k2 serial number label location',
    },

    s2: {
      focus: 'device',
      zoom: 1.1,
      scanLabel: 'Inspect the switch on live video',
      scanning: 'Inspecting the switch…',
      cue: 'Keycap off, switch close to the lens. Then say “the keycap’s off” or “check again”.',
      captions: [
        'Keyboard detected · looking for the exposed switch',
        'E keycap still fitted — pull it before the check',
        'Tracking socket and pins',
      ],
      passLine:
        'Hot-swap socket, 3-pin Gateron Brown, no corrosion. Safe to pull — a soldered board would have stopped us here.',
      images: 'switch',
      web: 'hot-swap keyboard switch socket inspection',
    },

    s3: {
      focus: 'switch',
      zoom: 4.6,
      cue: 'Say “seated” when it sits flush, or “it won’t seat” if it needs force.',
      captions: [
        'Watching the socket · switch out of frame',
        'Pins aligned · no force needed',
        'New switch flush with the plate',
      ],
      seatedLine: 'Seated and attested. Keycap on, then five presses in a text field.',
      tightLine:
        'Stop there. If it will not seat with light pressure, a pin is probably bent. Pull it and show me the pins before trying again.',
      images: 'tools',
      web: 'hot-swap keyboard switch replacement technique',
    },

    s4: {
      focus: 'device',
      zoom: 1.05,
      cue: 'Say “registers every press”, “double types”, or “no response”.',
      captions: [
        'Watching the keyboard · waiting for the key test',
        'E keycap fitted · check alignment',
        'Five presses · one character each',
      ],
      web: 'keyboard key double typing after switch replacement',
    },

    s5: {
      focus: 'device',
      zoom: 1.05,
      fixed: true,
      scanLabel: 'Check the final condition',
      scanning: 'Checking final condition…',
      cue: 'The final camera check is automatic. Then say “generate the report”.',
      captions: [
        'Whole board in frame · comparing to intake',
        'E keycap seated · no new damage',
        'Final condition · ready for close-out',
      ],
      passLine: 'Final condition matches intake apart from the replaced switch. The report is ready when you are.',
      web: 'service close-out report evidence requirements',
    },
  },

  idleCaptions: [
    'Live feed · tracking the work area',
    'Lighting stable · frame clear',
    'Recording locally · nothing uploaded',
  ],
};

/* Simulated reference diagrams. Inline SVG so the demo stays network-free. */
TARa.ART = {
  keycap:
    '<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
    '<defs><linearGradient id="artKcFace" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3f4955"/><stop offset="1" stop-color="#232b33"/></linearGradient></defs>' +
    '<rect width="160" height="100" fill="#0a0f14"/>' +
    '<ellipse cx="80" cy="84" rx="40" ry="5" fill="#000" opacity=".4"/>' +
    '<path d="M49 36 60 22h40l11 14-8 42H57Z" fill="url(#artKcFace)" stroke="#66717e" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M60 36h40" stroke="#fff" stroke-opacity=".12"/>' +
    '<text x="80" y="56" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="20" font-weight="600" fill="#e8f0f6" opacity=".88">E</text>' +
    '<path d="M74 78v8h12v-8" fill="none" stroke="#7c8794" stroke-width="1.2"/>' +
    '<path d="M78 82h4M80 79v6" stroke="#c9d4de" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>',

  keycapStem:
    '<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
    '<rect width="160" height="100" fill="#0a0f14"/>' +
    '<path d="M34 52 54 30h52l20 22-18 18H52Z" fill="#2b333c" stroke="#66717e" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M54 52h52" stroke="#fff" stroke-opacity=".08"/>' +
    '<rect x="73" y="60" width="14" height="18" rx="2" fill="#c9d4de"/>' +
    '<path d="M76 64h8M80 61v11" stroke="#2b333c" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M52 72h9M99 72h9" stroke="#4a5561" stroke-width="1.4"/>' +
    '</svg>',

  keycapPuller:
    '<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
    '<rect width="160" height="100" fill="#0a0f14"/>' +
    '<rect x="52" y="22" width="56" height="34" rx="7" fill="#2f3842" stroke="#66717e" stroke-width="1.2"/>' +
    '<text x="80" y="45" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="15" fill="#e8f0f6" opacity=".85">E</text>' +
    '<path d="M46 56c0 22 14 30 34 30s34-8 34-30" fill="none" stroke="#cfd8e1" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M46 56 40 32M114 56l6-24" fill="none" stroke="#cfd8e1" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M30 66V44M24 50l6-6 6 6" fill="none" stroke="#6ff0c1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M130 66V44M124 50l6-6 6 6" fill="none" stroke="#6ff0c1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>',

  switch:
    '<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
    '<rect width="160" height="100" fill="#0a0f14"/>' +
    '<ellipse cx="80" cy="86" rx="32" ry="4" fill="#000" opacity=".4"/>' +
    '<rect x="57" y="24" width="46" height="46" rx="4" fill="#3a434d" stroke="#6b7683" stroke-width="1.2"/>' +
    '<rect x="72" y="31" width="16" height="32" rx="2" fill="#232b33"/>' +
    '<path d="M80 35v21M73 43h14" stroke="#d8e2ea" stroke-width="4.4" stroke-linecap="round"/>' +
    '<path d="M71 70v9M89 70v9" stroke="#c8b06a" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="80" cy="84" r="2.4" fill="#c8b06a"/>' +
    '</svg>',

  socket:
    '<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
    '<rect width="160" height="100" fill="#0a0f14"/>' +
    '<rect x="32" y="24" width="96" height="52" rx="4" fill="#101c17" stroke="#2d4a3e" stroke-width="1.2"/>' +
    '<circle cx="62" cy="50" r="8" fill="#c8b06a" opacity=".85"/><circle cx="62" cy="50" r="3.4" fill="#0a0f14"/>' +
    '<circle cx="98" cy="50" r="8" fill="#c8b06a" opacity=".85"/><circle cx="98" cy="50" r="3.4" fill="#0a0f14"/>' +
    '<circle cx="80" cy="34" r="4" fill="#0a0f14" stroke="#4f6459"/>' +
    '<path d="M62 60v9M98 60v9" stroke="#3f5a4d" stroke-width="1.6"/>' +
    '</svg>',

  switchPuller:
    '<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
    '<rect width="160" height="100" fill="#0a0f14"/>' +
    '<rect x="60" y="34" width="40" height="40" rx="4" fill="#3a434d" stroke="#6b7683" stroke-width="1.2"/>' +
    '<path d="M80 38v18M74 46h12" stroke="#d8e2ea" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M64 48V20h32v28" fill="none" stroke="#cfd8e1" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M56 20h8M96 20h8" stroke="#cfd8e1" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M80 6v11M74 12l6-6 6 6" fill="none" stroke="#6ff0c1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>',

  tweezers:
    '<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
    '<rect width="160" height="100" fill="#0a0f14"/>' +
    '<rect x="58" y="54" width="44" height="28" rx="3" fill="#1a241f" stroke="#2d4a3e"/>' +
    '<circle cx="70" cy="68" r="5" fill="#c8b06a" opacity=".8"/><circle cx="90" cy="68" r="5" fill="#c8b06a" opacity=".8"/>' +
    '<path d="M50 86 78 34M110 86 82 34" fill="none" stroke="#cfd8e1" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M78 34 74 24M82 34l4-10" fill="none" stroke="#cfd8e1" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M66 52l28 28M94 52 66 80" stroke="#ff6b6b" stroke-width="2.6" stroke-linecap="round"/>' +
    '</svg>',
};

TARa.RESEARCH = {
  web: {
    label: {
      query: 'Keychron K2 — where is the serial number?',
      results: [
        {
          title: 'Where to find the serial number on a Keychron keyboard',
          site: 'keychron.com',
          snippet:
            'The model and serial are printed on the sticker on the underside of the case. Match them to the work order before removing any keycaps.',
          tag: 'Official',
        },
        {
          title: 'Keychron K2 — model identifiers',
          site: 'support.keychron.com',
          snippet:
            'K2-A3 is the hot-swap 65% variant. Serial numbers start with K2A. The layout and switch type are listed on the same label.',
          tag: 'Spec',
        },
        {
          title: 'Intake mistakes that cost the most',
          site: 'service-ops.internal',
          snippet:
            'Identity mismatches are the most expensive intake defect. Record the label before any diagnostic step.',
          tag: 'Internal',
        },
      ],
    },
    switch: {
      query: 'Hot-swap keyboard — switch and socket inspection',
      results: [
        {
          title: 'How to tell if a keyboard is hot-swap',
          site: 'keychron.com',
          snippet:
            'Look for the socket opening on the PCB under the switch. Hot-swap boards accept 3-pin and 5-pin switches; soldered boards need desoldering.',
          tag: 'Guide',
        },
        {
          title: 'Inspecting a switch socket without damage',
          site: 'repairbench.dev',
          snippet:
            'Power off first. Check for corrosion, lifted pads and bent pins. A damaged socket is board-level work — stop at Level 1.',
          tag: 'Field note',
        },
        {
          title: 'Gateron Brown — 3-pin specification',
          site: 'gateron.com',
          snippet:
            'Standard 3-pin plate-mount switch, 4.0 mm travel, 55 gf actuation. Matches the K2 hot-swap plate.',
          tag: 'Spec',
        },
      ],
    },
    swap: {
      query: 'Hot-swap switch replacement — safe technique',
      results: [
        {
          title: 'How to replace a hot-swap switch',
          site: 'keychron.com',
          snippet:
            'Use a switch puller, pull straight up, align the pins with the socket, then press until the switch is flush. Never force it.',
          tag: 'Guide',
        },
        {
          title: 'Bent pins — the expensive shortcut',
          site: 'repairbench.dev',
          snippet:
            'A bent pin can damage the socket and turn a two-minute swap into board work. If the switch needs force, stop and inspect.',
          tag: 'Field note',
        },
        {
          title: 'SOP-KBD-01 §3.2 — seat without force',
          site: 'SOP-KBD-01',
          snippet:
            'The replacement must drop in with light pressure and sit flush with the plate. Forcing the switch is a stop condition.',
          tag: 'SOP',
        },
      ],
    },
    double: {
      query: 'Key double-types after a switch replacement',
      results: [
        {
          title: 'A key registers twice — what to check first',
          site: 'repairbench.dev',
          snippet:
            'Re-seat the switch, check for bent pins and test in a different app. If a known-good switch also doubles, the socket or PCB is suspect.',
          tag: 'Field note',
        },
        {
          title: 'Switch chatter and debounce',
          site: 'keyboard.builders',
          snippet:
            'Chatter is usually the switch, not the firmware. Swap the suspect switch into another socket to isolate it.',
          tag: 'Guide',
        },
        {
          title: 'SOP-KBD-01 §4.1 — five clean presses',
          site: 'SOP-KBD-01',
          snippet:
            'A double type or dead key means the repair stays open and is escalated. Do not close on feel alone.',
          tag: 'SOP',
        },
      ],
    },
    closeout: {
      query: 'Service close-out — evidence and handoff',
      results: [
        {
          title: 'What a supervisor needs from a repair record',
          site: 'service-ops.internal',
          snippet:
            'Separate frame-verified evidence from technician attestation. Keep rejected frames. Every deviation needs a resolution or an open escalation.',
          tag: 'Internal',
        },
        {
          title: 'Traceable service records',
          site: 'quality.internal',
          snippet:
            'A close-out is auditable when each claim maps to a clause, a frame or an attestation — and the exceptions are visible.',
          tag: 'QA',
        },
      ],
    },
    default: {
      query: 'Mechanical keyboard switch service — technician references',
      results: [
        {
          title: 'Level 1 keyboard service — first-pass checklist',
          site: 'repairbench.dev',
          snippet:
            'Confirm identity, isolate the key, inspect the socket, then replace. Do not clean or reflow anything outside the SOP scope.',
          tag: 'Field note',
        },
        {
          title: 'Keycap and switch pullers — safe use',
          site: 'keychron.com',
          snippet:
            'Pull keycaps evenly with a wire puller. Pull switches straight up. Keep metal tools away from the socket.',
          tag: 'Guide',
        },
      ],
    },
  },

  images: {
    keycap: {
      query: 'mechanical keyboard keycap — what it looks like and how to remove it',
      howto: [
        'Power off and unplug the board first.',
        'Hook the wire puller under two opposite corners of the cap.',
        'Pull straight up with even pressure — never lever with a screwdriver.',
        'Keep the cap face-up; the stem and spring stay in the switch.',
      ],
      results: [
        {
          title: 'Keycap, fitted',
          note: 'The plastic cap you press. The switch stem sits inside it.',
          art: 'keycap',
          tone: 'mint',
        },
        {
          title: 'Underside · cross stem',
          note: 'The cross socket grips the switch stem. No glue, no solder.',
          art: 'keycapStem',
        },
        {
          title: 'Wire keycap puller',
          note: 'Two hooks under the cap, lift straight up.',
          art: 'keycapPuller',
          tone: 'mint',
        },
      ],
    },
    switch: {
      query: 'hot-swap keyboard switch — identification and pins',
      howto: [
        'Keycap off, board flat under the camera.',
        'A 3-pin switch has one centre peg and two metal pins.',
        'Pins must be straight before it goes back in.',
        'It should drop in with light pressure and sit flush.',
      ],
      results: [
        {
          title: '3-pin switch',
          note: 'Cross stem on top, two pins underneath. Gateron Brown here.',
          art: 'switch',
          tone: 'mint',
        },
        {
          title: 'Hot-swap socket',
          note: 'Two contact openings, no solder. This is what makes the swap possible.',
          art: 'socket',
          tone: 'mint',
        },
        {
          title: 'Switch puller',
          note: 'Hooks grip the housing. Pull straight up, never twist.',
          art: 'switchPuller',
        },
      ],
    },
    tools: {
      query: 'keycap and switch pullers — safe removal',
      howto: [
        'Caps: wire keycap puller under two corners, straight up.',
        'Switch: puller hooks under the housing, straight up.',
        'No metal tweezers near the socket — they can bridge contacts.',
      ],
      results: [
        {
          title: 'Keycap puller',
          note: 'Even pressure on both hooks. Do not lever against the case.',
          art: 'keycapPuller',
          tone: 'mint',
        },
        {
          title: 'Switch puller',
          note: 'For the switch housing, after the cap is off.',
          art: 'switchPuller',
          tone: 'mint',
        },
        {
          title: 'Metal tweezers',
          note: 'Not approved near the socket. Use the plastic spudger instead.',
          art: 'tweezers',
          tone: 'red',
        },
      ],
    },
  },

  parts: {
    query: 'Keychron K2 — switch replacement parts',
    results: [
      {
        title: 'Gateron Brown switch · 3-pin',
        sku: 'GAT-BRN-3P',
        price: '$0.40',
        stock: 'In stock · consumables',
        note: 'Matched replacement for this board.',
      },
      {
        title: 'Switch puller · stainless',
        sku: 'TOOL-SWP-01',
        price: 'Bench tool',
        stock: 'Checked out · Bay 3',
        note: 'Required for §3.1.',
      },
      {
        title: 'Keycap puller · wire',
        sku: 'TOOL-KCP-02',
        price: 'Bench tool',
        stock: 'In stock · Bay 3',
        note: 'Used at §2.3 and §4.1.',
      },
    ],
  },
};
