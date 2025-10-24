(function(){
  const $ = sel => document.querySelector(sel);
  const elElapsed = $("#currentElapsed");
  const elMeta = $("#currentMeta");
  const btnBig = $("#bigTap");
  const lblBig = $("#bigTapLabel");
  const btnEnd = $("#endCurrent");
  const btnCsv = $("#exportCsv");
  const btnReset = $("#resetAll");
  const list = $("#history");

  let currentStart = null;
  let lastStart = null;
  let rows = []; // {id, start, end, durationMs, intervalMs}
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

  // rows are most-recent-first; look at the last hour
  const windowRows = rows.filter(r => r.end >= (now - HOUR));
  if (windowRows.length < 6) return false; // not enough density to call it

  let meets = 0;
  windowRows.forEach(r => {
    const okDuration = r.durationMs >= MIN1;
    const okInterval = (r.intervalMs != null) && (r.intervalMs <= MIN5);
    if (okDuration && okInterval) meets++;
  });

  const ratio = meets / windowRows.length;
  return ratio >= 0.8; // 80% of last-hour entries meet both conditions
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
    if (currentStart) {
      lblBig.textContent = "Next Contraction";
      elMeta.textContent = "Started " + new Date(currentStart).toLocaleTimeString();
    } else {
      lblBig.textContent = "Start Contraction";
      elMeta.textContent = "Not running";
      elElapsed.textContent = "—";
    }
    list.innerHTML = "";
    rows.forEach(r => {
      const row = document.createElement("div");
      row.className = "glass rounded-xl p-3 flex items-center justify-between";
      row.innerHTML = `
        <div>
          <div class="text-xs opacity-70">Start</div>
          <div class="text-sm tabular-nums">${new Date(r.start).toLocaleTimeString()}</div>
        </div>
        <div class="text-center">
          <div class="text-xs opacity-70">Duration</div>
          <div class="text-lg font-semibold tabular-nums">${fmt(r.durationMs)}</div>
        </div>
        <div class="text-right">
          <div class="text-xs opacity-70">Interval</div>
          <div class="text-sm tabular-nums">${r.intervalMs==null ? "—" : fmt(r.intervalMs)}</div>
        </div>`;
      list.appendChild(row);
    });
  }

  function startTicker(){
    if (tick) clearInterval(tick);
    if (!currentStart) return;
    tick = setInterval(()=>{
      const now = Date.now();
      elElapsed.textContent = fmt(now - currentStart);
    }, 200);
  }

  function handleBigTap(){
  const t = Date.now();

  // A) Start first contraction (no flashing here—nothing ended yet)
  if (!currentStart) {
    currentStart = t;
    lastStart = t;
    fire(1); vibrate([10,40,10]);
    save(); render(); startTicker();
    return;
  }

  // B) End current and immediately start a new contraction
  const end = t;
  const durationMs = end - currentStart;
  const intervalMs = lastStart ? t - lastStart : null;

  rows = [{
    id: (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()),
    start: currentStart,
    end,
    durationMs,
    intervalMs
  }, ...rows];

  // start the next one right away
  currentStart = t;
  lastStart = t;

  fire(1); vibrate([15,60,15]);
  save(); render(); startTicker();

  // ✅ 1-second glow + haptics based on the duration we just ended
  flashIndicator(durationMs >= 60 * 1000);

  // safety nudge check
  if (isFiveOneOne(rows)) showFiveOneOneAlert();
}
 function endCurrent(){
  if (!currentStart) return;
  const t = Date.now();
  const durationMs = t - currentStart;

  rows = [{
    id: (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()),
    start: currentStart,
    end: t,
    durationMs,
    intervalMs: lastStart ? currentStart - lastStart : null
  }, ...rows];

  currentStart = null;

  fire(.8); vibrate([8,40,8]);
  save(); render(); startTicker();

  // ✅ flash after ending
  flashIndicator(durationMs >= 60 * 1000);

  if (isFiveOneOne(rows)) showFiveOneOneAlert();
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
