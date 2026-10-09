// ==================================================================
// daterange.js — خانة وحدة تفتح تقويم يتحدد فيه من ← إلى
//
// const picker = createDateRangeField(document.getElementById("range"), {
//   onChange: ({ from, to }) => ...   // "YYYY-MM-DD" أو null = كل التواريخ
// });
// picker.value → { from, to }
// ==================================================================

const DR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DR_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

function drIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function drParse(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function drLabel(iso) {
  return iso.split("-").join("/");
}

function createDateRangeField(container, { onChange = () => {}, placeholder = "كل التواريخ" } = {}) {
  let value = { from: null, to: null };

  container.classList.add("dr-field");
  container.innerHTML = `
    <button type="button" class="dr-btn">${svgIcon("clock", "icon-sm")}<span class="dr-text"></span></button>
    <button type="button" class="dr-clear hidden" aria-label="مسح التاريخ">${svgIcon("x", "icon-sm")}</button>`;
  const text = container.querySelector(".dr-text");
  const clearBtn = container.querySelector(".dr-clear");

  function paint() {
    if (!value.from) text.textContent = placeholder;
    else if (value.from === value.to) text.textContent = drLabel(value.from);
    else text.textContent = `${drLabel(value.from)} ← ${drLabel(value.to)}`;
    text.classList.toggle("is-empty", !value.from);
    clearBtn.classList.toggle("hidden", !value.from);
  }

  function set(v, notify = true) {
    value = { from: v.from || null, to: v.to || v.from || null };
    paint();
    if (notify) onChange({ ...value });
  }

  clearBtn.addEventListener("click", () => set({ from: null, to: null }));
  container.querySelector(".dr-btn").addEventListener("click", () => openDialog());

  function openDialog() {
    let start = value.from;
    let end = value.to;
    const base = start ? drParse(start) : new Date();
    let viewY = base.getFullYear();
    let viewM = base.getMonth();
    const today = drIso(new Date());

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box dr-box" role="dialog" aria-modal="true" aria-label="اختيار الفترة">
        <div class="dr-presets">
          <button type="button" data-p="today">اليوم</button>
          <button type="button" data-p="yesterday">أمس</button>
          <button type="button" data-p="week">آخر 7 أيام</button>
          <button type="button" data-p="month">هذا الشهر</button>
          <button type="button" data-p="lastmonth">الشهر الماضي</button>
        </div>
        <div class="dr-head">
          <button type="button" class="mini-btn" data-nav="-1" aria-label="الشهر السابق">${svgIcon("chevron")}</button>
          <strong class="dr-title"></strong>
          <button type="button" class="mini-btn" data-nav="1" aria-label="الشهر التالي"><span style="display:grid;transform:scaleX(-1)">${svgIcon("chevron")}</span></button>
        </div>
        <div class="dr-grid dr-week">${DR_DAYS.map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="dr-grid dr-days"></div>
        <p class="dr-hint"></p>
        <div class="modal-actions">
          <button type="button" class="btn" data-apply>تطبيق</button>
          <button type="button" class="btn secondary" data-cancel>إلغاء</button>
        </div>
      </div>`;
    const days = overlay.querySelector(".dr-days");
    const hint = overlay.querySelector(".dr-hint");

    function draw() {
      overlay.querySelector(".dr-title").textContent = `${DR_MONTHS[viewM]} ${viewY}`;
      const first = new Date(viewY, viewM, 1);
      const count = new Date(viewY, viewM + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < first.getDay(); i++) cells.push(`<span></span>`);
      for (let d = 1; d <= count; d++) {
        const iso = drIso(new Date(viewY, viewM, d));
        const inRange = start && end && iso >= start && iso <= end;
        const cls = [
          "dr-day",
          iso === today ? "is-today" : "",
          inRange ? "in-range" : "",
          iso === start ? "is-start" : "",
          iso === (end || start) ? "is-end" : "",
        ].join(" ");
        cells.push(`<button type="button" class="${cls}" data-d="${iso}">${d}</button>`);
      }
      days.innerHTML = cells.join("");
      hint.textContent = !start ? "اختر بداية الفترة" : !end ? `من ${drLabel(start)}، اختر النهاية` : start === end ? drLabel(start) : `${drLabel(start)} ← ${drLabel(end)}`;
    }

    function preset(p) {
      const t = new Date();
      const d = (y, m, dd) => drIso(new Date(y, m, dd));
      const Y = t.getFullYear(), M = t.getMonth(), D = t.getDate();
      if (p === "today") [start, end] = [d(Y, M, D), d(Y, M, D)];
      if (p === "yesterday") [start, end] = [d(Y, M, D - 1), d(Y, M, D - 1)];
      if (p === "week") [start, end] = [d(Y, M, D - 6), d(Y, M, D)];
      if (p === "month") [start, end] = [d(Y, M, 1), d(Y, M + 1, 0)];
      if (p === "lastmonth") [start, end] = [d(Y, M - 1, 1), d(Y, M, 0)];
      const s = drParse(start);
      viewY = s.getFullYear();
      viewM = s.getMonth();
      draw();
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-cancel]")) return overlay.remove();
      const nav = e.target.closest("[data-nav]");
      if (nav) {
        viewM += Number(nav.dataset.nav);
        if (viewM < 0) { viewM = 11; viewY--; }
        if (viewM > 11) { viewM = 0; viewY++; }
        return draw();
      }
      const p = e.target.closest("[data-p]");
      if (p) return preset(p.dataset.p);
      const day = e.target.closest("[data-d]");
      if (day) {
        const iso = day.dataset.d;
        if (!start || end) { start = iso; end = null; }
        else if (iso < start) { start = iso; }
        else end = iso;
        return draw();
      }
      if (e.target.closest("[data-apply]")) {
        overlay.remove();
        set({ from: start, to: end || start });
      }
    });

    draw();
    document.body.appendChild(overlay);
  }

  paint();
  return {
    get value() { return { ...value }; },
    set: (v) => set(v, false),
  };
}
