(function(){
  const $ = (id) => document.getElementById(id);

  // IDs that match current index.html
  const elElapsed = $("elElapsed");       // live timer text
  const elMeta    = $("currentMeta");     // small meta line (optional)
  const btnBig    = $("bigTap");
  const lblBig    = $("bigTapLabel");
  const btnEnd    = $("btnEnd");
  const btnCsv    = $("btnCsv");
  const btnReset  = $("btnReset");
  const list      = $("rows");

  let currentStart = null;
  let currentPhase = null; // "contraction" | "rest" | null
  let lastStart    = null;
  // rows = contractions; when a rest ends we attach restMs & cycleMs to rows[0]
  let rows = []; // { id, start, end, durationMs, restMs?, cycleMs? }
  let tick = null;

  function load() {
    try {
      const raw = localStorage.getItem("retro-ctracker:v1");
      if (raw) {
        const data = JSON.parse(raw);
        rows         = Array.isArray(data.rows) ? data.rows : [];
        currentStart = typeof data.currentStart === "number" ? data.currentStart : null;
        lastStart    = typeof data.lastStart === "number" ? data.lastStart : null;
      }
    } catch(e){}
  }
  function save() {
    localStorage.setItem("retro-ctracker:v1", JSON.stringify({ rows, currentStart, lastStart }));
  }

  function vibrate(p){ try{ navigator.vibrate && navigator.vibrate(p || [12,80,12]); }catch(e){} }

  function fmt(ms){
    if (ms == null) return "—";
    const s  = Math.floor(ms/1000);
    const mm = Math.floor(s/60);
    const ss = s % 60;
    return mm + ":" + String(ss).padStart(2,"0");
  }

function flashIndicator(ok) {
  const btn = document.getElementById('bigTap');
  if (!btn) return;

  // add ring (green for ≥1:00, amber for <1:00)
  btn.classList.remove('ring-ok','ring-warn'); // reset
  void btn.offsetWidth;                         // restart animation
  btn.classList.add(ok ? 'ring-ok' : 'ring-warn');

  // haptics
  try {
    if (navigator.vibrate) {
      ok ? navigator.vibrate([30,70,30]) : navigator.vibrate([12,50,12]);
    }
  } catch(e){}

  // clear after 1s
  setTimeout(() => btn.classList.remove('ring-ok','ring-warn'), 1000);
}
  
function isFiveOneOne(rows) {
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const MIN1 = 60 * 1000;
  const MIN5 = 5 * 60 * 1000;

  // Consider only contractions that have a completed rest (i.e., have cycleMs)
  const recent = rows.filter(r => r.cycleMs != null && r.end >= (now - HOUR));
  if (recent.length < 6) return false; // need enough density to be confident

  const avgContraction = recent.reduce((a,r)=>a+r.durationMs,0) / recent.length;
  const avgCycle       = recent.reduce((a,r)=>a+r.cycleMs,0) / recent.length;

  // 5-1-1: contractions average >= 1 min AND cycle average <= 5 min over the past hour
  return avgContraction >= MIN1 && avgCycle <= MIN5;
}
  // --- 5-1-1 overlay (exposed globally) ---
window.showFiveOneOneAlert = function () {
  const overlay = document.getElementById('alertOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  // Haptics + confetti
  try { navigator.vibrate && navigator.vibrate([60,160,60,160,60]); } catch(e){}
  try {
    const defaults = { spread: 80, origin: { y: 0.7 } };
    confetti(Object.assign({}, defaults, { particleCount: 180, startVelocity: 55 }));
  } catch(e){}
};

window.hideFiveOneOneAlert = function () {
  const overlay = document.getElementById('alertOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
};

  function render() {
  // Button label + meta
  if (currentStart) {
    if (currentPhase === "contraction") {
      lblBig.textContent = "End Contraction → Start Rest";
    } else {
      lblBig.textContent = "End Rest → Start Contraction";
    }
    if (elMeta) elMeta.textContent =
      (currentPhase || "—") + " started " + new Date(currentStart).toLocaleTimeString();
  } else {
    lblBig.textContent = "Start Contraction";
    if (elMeta) elMeta.textContent = "Not running";
    if (elElapsed) elElapsed.textContent = "—";
  }

  // History list (DOM API—no template strings)
  if (!list) return;
  list.innerHTML = "";

  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "glass rounded-xl p-3 flex items-center justify-between";

    // Left: Start time
    const left = document.createElement("div");
    const leftLbl = document.createElement("div");
    leftLbl.className = "text-xs opacity-70";
    leftLbl.textContent = "Start";
    const leftVal = document.createElement("div");
    leftVal.className = "text-sm tabular-nums";
    leftVal.textContent = new Date(r.start).toLocaleTimeString();
    left.appendChild(leftLbl);
    left.appendChild(leftVal);

    // Center: Duration
    const mid = document.createElement("div");
    mid.className = "text-center";
    const midLbl = document.createElement("div");
    midLbl.className = "text-xs opacity-70";
    midLbl.textContent = "Duration";
    const midVal = document.createElement("div");
    midVal.className = "text-lg font-semibold tabular-nums";
    midVal.textContent = fmt(r.durationMs);
    mid.appendChild(midLbl);
    mid.appendChild(midVal);

    // Right: Rest + Cycle
    const right = document.createElement("div");
    right.className = "text-right";
    const rightLbl = document.createElement("div");
    rightLbl.className = "text-xs opacity-70";
    rightLbl.textContent = "Rest";
    const rightVal = document.createElement("div");
    rightVal.className = "text-sm tabular-nums";
    rightVal.textContent = (r.restMs == null ? "—" : fmt(r.restMs));
    const cycle = document.createElement("div");
    cycle.className = "text-[10px] opacity-70 mt-1";
    cycle.textContent = "Cycle: " + (r.cycleMs == null ? "—" : fmt(r.cycleMs));

    right.appendChild(rightLbl);
    right.appendChild(rightVal);
    right.appendChild(cycle);

    row.appendChild(left);
    row.appendChild(mid);
    row.appendChild(right);

     list.appendChild(row);
  });
}

  function startTicker(){
    if (tick) clearInterval(tick);
    if (!currentStart) return;
  tick = setInterval(()=>{
  const now = Date.now();
  if (elElapsed) elElapsed.textContent = fmt(now - currentStart);
}, 200);
  }

function handleBigTap(){
  const t = Date.now();

  // A) First ever tap: start a contraction
  if (!currentStart || !currentPhase) {
    currentPhase = "contraction";
    currentStart = t;
    lastStart = t; // not used for logic anymore, but fine to keep
    vibrate([10,40,10]);
    save(); render(); startTicker();
    return;
  }

  // B) If we're in a contraction: end it, log it as a row, then start REST
  if (currentPhase === "contraction") {
    const end = t;
    const durationMs = end - currentStart;

    rows = [{
      id: (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()),
      start: currentStart,
      end,
      durationMs,
      restMs: null,
      cycleMs: null
    }, ...rows];

    // flash based on contraction length
    flashIndicator(durationMs >= 60 * 1000);

    // immediately start REST phase
    currentPhase = "rest";
    currentStart = t;

    vibrate([12,40,12]);
    save(); render(); startTicker();
    return;
  }

  // C) If we're in REST: end it, attach restMs+cycleMs to the most recent contraction, then start a new contraction
  if (currentPhase === "rest") {
    const end = t;
    const restMs = end - currentStart;

    if (rows.length > 0) {
      rows[0].restMs = restMs;
      rows[0].cycleMs = rows[0].durationMs + restMs;
    }

    // Now start a new contraction
    currentPhase = "contraction";
    currentStart = t;

    vibrate([15,60,15]);
    save(); render(); startTicker();

    // 5-1-1 safety check runs when we complete a cycle (i.e., after rest)
    if (isFiveOneOne(rows)) showFiveOneOneAlert();
    return;
  }
}  
  function endCurrent(){
  if (!currentStart || !currentPhase) return;

  const t = Date.now();

  if (currentPhase === "contraction") {
    const durationMs = t - currentStart;
    rows = [{
      id: (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()),
      start: currentStart,
      end: t,
      durationMs,
      restMs: null,
      cycleMs: null
    }, ...rows];

    // flash on contraction end
    flashIndicator(durationMs >= 60 * 1000);
  } else {
    // ending rest without starting a contraction
    const restMs = t - currentStart;
    if (rows.length > 0) {
      rows[0].restMs = restMs;
      rows[0].cycleMs = rows[0].durationMs + restMs;
    }
    // a completed cycle means: check 5-1-1
    if (isFiveOneOne(rows)) showFiveOneOneAlert();
  }

  currentStart = null;
  currentPhase = null;

  vibrate([8,40,8]);
  save(); render(); startTicker();
}
// ---- Help modal wiring (simple & reliable) ----
(function wireHelpOnce(){
  function setup() {
    const modal = document.getElementById('helpModal');
    const open = document.getElementById('openHelp');
    const close = document.getElementById('closeHelp');
    const backdrop = document.getElementById('helpBackdrop');
    if (!modal) return;

    const show = () => {
      modal.classList.remove('hidden');
      close && close.focus();
    };
    const hide = () => modal.classList.add('hidden');

    open  && open.addEventListener('click', (e) => { e.preventDefault(); show(); });
    close && close.addEventListener('click', (e) => { e.preventDefault(); hide(); });
    backdrop && backdrop.addEventListener('click', (e) => { e.preventDefault(); hide(); });

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) hide();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

  // About modal
  const openAbout  = document.getElementById('openAbout');
  const aboutModal = document.getElementById('aboutModal');
  const closeAbout = document.getElementById('closeAbout');
  const aboutBackdrop = document.getElementById('aboutBackdrop');

  if (openAbout && aboutModal) {
    const show = (e)=>{ e && e.preventDefault(); aboutModal.classList.remove('hidden'); };
    const hide = (e)=>{ e && e.preventDefault(); aboutModal.classList.add('hidden'); };

    openAbout.addEventListener('click', show);
    openAbout.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') show(e); });
    closeAbout && closeAbout.addEventListener('click', hide);
    aboutBackdrop && aboutBackdrop.addEventListener('click', hide);
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && !aboutModal.classList.contains('hidden')) hide(e); });
  }
  
  function resetAll(){
    rows = []; currentStart = null; lastStart = null;
    vibrate(25);
    save(); render(); startTicker();
  }

function toCsv(){
  // Columns match the data we actually keep
  const headers = [
    "Start (local)",
    "End (local)",
    "Contraction (mm:ss)",
    "Rest (mm:ss)",             // end of rest -> filled after next tap
    "Cycle (mm:ss)",            // contraction + rest
    "Start→Start (mm:ss)"       // purely informative (prev start to this start)
  ];

  // Make a chronological copy (oldest → newest)
  const chrono = rows.slice().reverse();

  const lines = chrono.map((r, i) => {
    const startLocal = new Date(r.start).toLocaleString();
    const endLocal   = new Date(r.end).toLocaleString();

    // Start→Start uses the previous row's start (chronologically)
    let startToStart = "";
    if (i > 0) {
      const prev = chrono[i - 1];
      const delta = r.start - prev.start; // ms
      startToStart = fmt(delta);
    }

    return [
      startLocal,
      endLocal,
      fmt(r.durationMs),
      r.restMs  == null ? "" : fmt(r.restMs),
      r.cycleMs == null ? "" : fmt(r.cycleMs),
      startToStart
    ];
  });

  // RFC4180-safe quoting for commas/quotes/newlines
  const csv = [headers, ...lines]
    .map(arr =>
      arr.map(v => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",")
    )
    .join("\n");

  // Download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  a.href = url;
  a.download = `nestling-cc_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
// ===== Core listeners (elements that already exist above the scripts) =====
btnBig   && btnBig.addEventListener("click", handleBigTap);
btnEnd   && btnEnd.addEventListener("click", endCurrent);
btnCsv   && btnCsv.addEventListener("click", toCsv);
btnReset && btnReset.addEventListener("click", resetAll);

// ===== Wire elements that are defined below the scripts (overlay + force + about) =====
function wireLateElements() {
  // 5-1-1 overlay controls
  const dismissBtn    = document.getElementById('alertDismiss');
  const alertBackdrop = document.getElementById('alertBackdrop');
  if (dismissBtn)    dismissBtn.addEventListener('click', window.hideFiveOneOneAlert);
  if (alertBackdrop) alertBackdrop.addEventListener('click', window.hideFiveOneOneAlert);

  // Force button (testing)
  const forceBtn = document.getElementById('force511');
  if (forceBtn) {
    forceBtn.addEventListener('click', () => {
      console.log('[force511] click');
      window.showFiveOneOneAlert();
    });
  }

  // About modal (logo)
  const openAbout     = document.getElementById('openAbout');
  const aboutModal    = document.getElementById('aboutModal');
  const closeAbout    = document.getElementById('closeAbout');
  const aboutBackdrop = document.getElementById('aboutBackdrop');
  if (openAbout && aboutModal) {
    const show = (e)=>{ e && e.preventDefault(); aboutModal.classList.remove('hidden'); };
    const hide = (e)=>{ e && e.preventDefault(); aboutModal.classList.add('hidden'); };
    openAbout.addEventListener('click', show);
    openAbout.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') show(e); });
    if (closeAbout)    closeAbout.addEventListener('click', hide);
    if (aboutBackdrop) aboutBackdrop.addEventListener('click', hide);
    document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && !aboutModal.classList.contains('hidden')) hide(e); });
  }
}

// Try now and on DOM ready
wireLateElements();
document.addEventListener('DOMContentLoaded', wireLateElements);

// Initial state
load();
render();
startTicker();
})();
