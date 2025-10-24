(function(){
const $ = (id) => document.getElementById(id);

// IDs that match your current index.html template
const elElapsed = $("elElapsed");       // was #currentElapsed
const elMeta    = $("currentMeta");     // optional: we'll add this small div in HTML below
const btnBig    = $("bigTap");
const lblBig    = $("bigTapLabel");
const btnEnd    = $("btnEnd");          // was #endCurrent
const btnCsv    = $("btnCsv");          // was #exportCsv
const btnReset  = $("btnReset");        // was #resetAll
const list      = $("rows");            // was #history

let currentStart = null;
let currentPhase = null; // "contraction" | "rest" | null
let lastStart = null;    // keep if you want, not required now
// rows: contraction entries only; when the next rest ends, we attach restMs + cycleMs to rows[0]
let rows = []; // {id, start, end, durationMs, restMs?, cycleMs?}
let tick = null;

  function load() {
    try {
      const raw = localStorage.getItem("retro-ctracker:v1");
      if (raw) {
        const data = JSON.parse(raw);
        rows = Array.isArray(data.rows) ? data.rows : [];
        currentStart = typeof data.currentStart === "number" ? data.currentStart : null;
        lastStart = typeof data.lastStart === "number" ? data.lastStart : null;
      }
    } catch(e){}
  }
  function save() {
    localStorage.setItem("retro-ctracker:v1", JSON.stringify({rows, currentStart, lastStart}));
  }

  function vibrate(p){ try{ navigator.vibrate && navigator.vibrate(p || [12,80,12]); }catch(e){} }
  function fire(power){
    try {
      const count = Math.floor(200 * (power||0.7));
      const defaults = { spread: 70, origin: { y: 0.6 } };
      confetti(Object.assign({}, defaults, { particleCount: Math.floor(count*0.35), startVelocity: 45, scalar: .8 }));
      confetti(Object.assign({}, defaults, { particleCount: Math.floor(count*0.25), angle: 60, spread: 55, origin: { x: 0 }, scalar: .9 }));
      confetti(Object.assign({}, defaults, { particleCount: Math.floor(count*0.25), angle: 120, spread: 55, origin: { x: 1 }, scalar: .9 }));
    } catch(e){}
  }

  function fmt(ms){
    if (ms == null) return "—";
    const s = Math.floor(ms/1000);
    const mm = Math.floor(s/60);
    const ss = s % 60;
    return mm + ":" + String(ss).padStart(2,"0");
  }
// Flash the big button for 1s: green (ok=true) or yellow (ok=false)
// Includes distinct haptics for colorblind-friendly feedback
function flashIndicator(ok) {
  const btn = document.getElementById('bigTap');
  if (!btn) return;

  btn.classList.remove('flash-ok', 'flash-warn');
  void btn.offsetWidth; // reflow so re-adding class retriggers

  btn.classList.add(ok ? 'flash-ok' : 'flash-warn');

  // Haptics: OK = longer pattern, WARN = shorter
  try {
    if (navigator.vibrate) {
      ok ? navigator.vibrate([30, 70, 30]) : navigator.vibrate([12, 50, 12]);
    }
  } catch {}

  setTimeout(() => {
    btn.classList.remove('flash-ok', 'flash-warn');
  }, 1000);
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
function showFiveOneOneAlert() {
  const overlay = document.getElementById('alertOverlay');
  if (!overlay) return;               // safe-guard if HTML not present
  overlay.classList.remove('hidden'); // show overlay

  // Haptics + a little celebration
  try { navigator.vibrate && navigator.vibrate([60,160,60,160,60]); } catch(e){}
  try {
    const defaults = { spread: 80, origin: { y: 0.7 } };
    confetti(Object.assign({}, defaults, { particleCount: 150, startVelocity: 55 }));
  } catch(e){}
}

function hideFiveOneOneAlert() {
  const overlay = document.getElementById('alertOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
}

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
    fire(1); vibrate([10,40,10]);
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

    fire(0.6); vibrate([12,40,12]);
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

    fire(1); vibrate([15,60,15]);
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

  fire(.8); vibrate([8,40,8]);
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
  
  function resetAll(){
    rows = []; currentStart = null; lastStart = null;
    fire(.5); vibrate(25);
    save(); render(); startTicker();
  }

  function toCsv(){
    const headers = ["Start","End","Duration (mm:ss)","Interval Since Prior Start (mm:ss)"];
    const lines = rows.slice().reverse().map(r => [
      new Date(r.start).toLocaleString(),
      new Date(r.end).toLocaleString(),
      fmt(r.durationMs),
      r.intervalMs==null ? "" : fmt(r.intervalMs)
    ]);
    const csv = [headers, ...lines]
      .map(arr => arr.map(v => /[,\n"]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v).join(","))
      .join("\n");
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contractions-" + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

// Existing core listeners (these target elements that already exist above the scripts)
btnBig.addEventListener("click", handleBigTap);
btnEnd.addEventListener("click", endCurrent);
btnCsv.addEventListener("click", toCsv);
btnReset.addEventListener("click", resetAll);

// 🔧 Wire elements that are defined *below* the scripts (overlay + force button)
function wireLateElements() {
  const dismissBtn = document.getElementById('alertDismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', hideFiveOneOneAlert);
  }

  const forceBtn = document.getElementById('force511');
  if (forceBtn) {
    forceBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showFiveOneOneAlert();
    });
  }
}

// Try now (in case DOM is already ready), and also after DOM is ready
wireLateElements();
document.addEventListener('DOMContentLoaded', wireLateElements);

load(); 
render(); 
startTicker();
})();
