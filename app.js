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
    if (!currentStart) {
      currentStart = t;
      lastStart = t;
      fire(1); vibrate([10,40,10]);
      save(); render(); startTicker();
      return;
    }
    const end = t;
    const durationMs = end - currentStart;
    const intervalMs = lastStart ? t - lastStart : null;
    rows = [{ id: (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()),
              start: currentStart, end, durationMs, intervalMs }, ...rows];
    currentStart = t;
    lastStart = t;
    fire(1); vibrate([15,60,15]);
    save(); render(); startTicker();
  }

  function endCurrent(){
    if (!currentStart) return;
    const t = Date.now();
    rows = [{ id: (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()),
              start: currentStart, end: t, durationMs: t-currentStart,
              intervalMs: lastStart ? currentStart - lastStart : null }, ...rows];
    currentStart = null;
    fire(.8); vibrate([8,40,8]);
    save(); render(); startTicker();
  }

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

  btnBig.addEventListener("click", handleBigTap);
  btnEnd.addEventListener("click", endCurrent);
  btnCsv.addEventListener("click", toCsv);
  btnReset.addEventListener("click", resetAll);

  load(); render(); startTicker();
})();