// ==================================================================
// report-templates.js — قوالب المحاضر: حقول النموذج + أماكن الكتابة على القالب
//
// كل الإحداثيات بنقاط PDF (A4 = 595.32 × 841.92) من أعلى يسار الصفحة،
// مأخوذة من ملفات القوالب الأصلية. x للنص = الحافة اليمنى (الكتابة عربية).
//
// أنواع الحقول بالنموذج:
//   text | date | time | textarea | checkbox | checklist | products | signature | entities
// ==================================================================

const PAGE_W = 595.32;
const PAGE_H = 841.92;

// ----------------------------------------------------------------
// 1) إشعار ضبط وإتلاف
// ----------------------------------------------------------------
const SEIZURE_ROWS = [132.5, 152.2, 172.0, 191.7]; // أعلى كل صف ببيانات المحل (ارتفاع ~19.3)
const SEIZURE_PRODUCT_ROWS = [265.2, 286.2, 307.2, 328.2, 349.2]; // ارتفاع ~20.6
const SEIZURE_COLS = {
  name: [439.8, 566.2],
  qty: [340.5, 439.3],
  weight: [269.4, 339.9],
  expiry: [148.9, 269.0],
  source: [28.6, 148.5],
};
const PRODUCTS_PER_PAGE = 5;

const TPL_SEIZURE = {
  key: "seizure",
  title: "إشعار ضبط وإتلاف",
  image: "template-seizure.jpg",
  shopKey: "shop_name",

  sections: [
    {
      title: "بيانات المحل",
      fields: [
        { type: "text", key: "shop_name", label: "اسم المنشأة", required: true },
        { type: "text", key: "cr_number", label: "رقم السجل التجاري", inputmode: "numeric" },
        { type: "text", key: "license_number", label: "رقم الرخصة", inputmode: "numeric" },
        { type: "text", key: "visit_number", label: "رقم الزيارة", inputmode: "numeric" },
        { type: "date", key: "visit_date", label: "تاريخ الزيارة", required: true, defaultToday: true },
        { type: "text", key: "district", label: "الحي" },
        { type: "text", key: "street", label: "الشارع" },
        { type: "text", key: "municipality", label: "البلدية" },
      ],
    },
    {
      title: "بيانات المنتج",
      fields: [
        {
          type: "products",
          key: "products",
          columns: [
            { key: "name", label: "اسم المنتج", required: true },
            { key: "qty", label: "الكمية", inputmode: "decimal" },
            { key: "weight", label: "الوزن" },
            { key: "expiry", label: "تاريخ انتهاء المنتج" },
            { key: "source", label: "مصدر المنتج" },
          ],
        },
      ],
    },
    {
      title: "أسباب الضبط والإتلاف",
      fields: [
        {
          type: "checklist",
          key: "reasons",
          items: [
            { id: "expired", label: "المنتج منتهي الصلاحية" },
            { id: "damaged", label: "المنتج يظهر عليه علامات التلف" },
            { id: "pests", label: "وجود قوارض وحشرات على المنتج" },
          ],
        },
        { type: "text", key: "other_reason", label: "أخرى" },
        { type: "text", key: "destroyed_at", label: "تم إتلاف المنتج في" },
      ],
    },
    {
      title: "المراقب",
      fields: [
        { type: "text", key: "inspector_name", label: "الاسم", required: true, fromProfile: true },
        { type: "signature", key: "inspector_sig", label: "توقيع المراقب", required: true },
      ],
    },
    {
      title: "صاحب المنشأة أو من ينوب عنه",
      fields: [
        { type: "text", key: "owner_name", label: "الاسم" },
        { type: "text", key: "owner_id", label: "رقم الهوية", inputmode: "numeric" },
        { type: "checkbox", key: "owner_refused", label: "رفض التوقيع" },
        { type: "signature", key: "owner_sig", label: "توقيع صاحب المنشأة", hiddenWhen: "owner_refused" },
      ],
    },
  ],

  pageCount(data) {
    const n = (data.products || []).length;
    return Math.max(1, Math.ceil(n / PRODUCTS_PER_PAGE));
  },

  render(R, d, sig, page) {
    const cell = (value, [x0, x1], top, h) => R.center(value, x0, x1, top, top + h, { size: 9.5 });
    const right = [277.4, 462.8];
    const left = [29.8, 207.1];

    cell(d.shop_name, right, SEIZURE_ROWS[0], 19.2);
    cell(d.cr_number, right, SEIZURE_ROWS[1], 19.2);
    cell(d.visit_number, right, SEIZURE_ROWS[2], 19.2);
    cell(formatDate(d.visit_date), right, SEIZURE_ROWS[3], 19.2);
    cell(d.district, left, SEIZURE_ROWS[0], 19.2);
    cell(d.street, left, SEIZURE_ROWS[1], 19.2);
    cell(d.municipality, left, SEIZURE_ROWS[2], 19.2);
    cell(d.license_number, left, SEIZURE_ROWS[3], 19.2);

    const rows = (d.products || []).slice(page * PRODUCTS_PER_PAGE, (page + 1) * PRODUCTS_PER_PAGE);
    rows.forEach((p, i) => {
      const top = SEIZURE_PRODUCT_ROWS[i];
      for (const k of Object.keys(SEIZURE_COLS)) {
        R.center(p[k], SEIZURE_COLS[k][0] + 2, SEIZURE_COLS[k][1] - 2, top, top + 20.6, { size: 9 });
      }
    });

    const r = d.reasons || {};
    if (r.expired) R.check(548.2, 470.2);
    if (r.damaged) R.check(395.4, 470.2);
    if (r.pests) R.check(211.2, 470.2);
    if (d.other_reason) {
      R.check(549.8, 505.4);
      R.text(d.other_reason, 498, 504, { size: 9.5, maxWidth: 445 });
    }
    if (d.destroyed_at) R.text(d.destroyed_at, 383, 544.5, { size: 9.5, maxWidth: 335 });

    R.text(d.inspector_name, 503, 649, { size: 10, maxWidth: 175 });
    R.sign(sig.inspector_sig, 335, 680, 495, 706);

    R.text(d.owner_name, 234, 648, { size: 10, maxWidth: 175 });
    R.text(d.owner_id, 214, 674.5, { size: 10, maxWidth: 155 });
    if (d.owner_refused) R.check(128, 727.5, 1.2);
    else R.sign(sig.owner_sig, 62, 685, 228, 705);

    if (this.pageCount(d) > 1) {
      R.text(`صفحة ${page + 1} من ${this.pageCount(d)}`, 566, 800, { size: 8, color: "#555" });
    }
  },
};

// ----------------------------------------------------------------
// ترويسة مشتركة لمحضري إثبات الحالة
// ----------------------------------------------------------------
function renderCaseHeader(R, d) {
  const h = hijriParts(d.date);
  const g = d.date ? d.date.split("-") : null;

  R.white(336, 70, 463, 95);
  if (h) R.text(`${h.year}/${h.month}/${h.day} هـ`, 461, 89, { size: 11 });
  R.white(336, 98, 461, 121);
  if (g) R.text(`${g[0]}/${g[1]}/${g[2]} م`, 459, 115.5, { size: 11 });

  R.text(d.inspector_name, 412, 167.5, { size: 11, maxWidth: 300 });

  R.white(200, 173, 409, 191);
  if (d.time) R.text(formatTime12(d.time), 405, 186.5, { size: 11 });

  R.text(d.shop_name, 403, 205, { size: 11, maxWidth: 300 });
  R.text(d.license_number, 404, 223.5, { size: 11, maxWidth: 300 });
}

function renderCaseItems(R, d, items) {
  const chosen = d.items || {};
  for (const it of items) {
    const v = chosen[it.id];
    if (!v || !v.on) continue;
    R.check(it.bullet[0], it.bullet[1]);
    if (it.count && v.count) R.center(String(v.count), it.count[0] - 6, it.count[0] + 6, it.count[1] - 10, it.count[1] + 1, { size: 9, color: "#b00020" });
  }
}

function renderCaseFooter(R, d, sig, lines, signBaseline) {
  R.wrap(d.explanation, 463, 372, lines.map((b) => b - 8), { size: 10 });
  R.text(d.inspector_name, 421, signBaseline - 1, { size: 10.5, maxWidth: 205 });
  R.sign(sig.inspector_sig, 45, signBaseline - 26, 158, signBaseline + 4);
}

const CASE_COMMON_TOP = {
  title: "بيانات المحضر",
  fields: [
    { type: "date", key: "date", label: "التاريخ", required: true, defaultToday: true, hijriHint: true },
    { type: "time", key: "time", label: "الساعة", required: true, defaultNow: true },
    { type: "text", key: "inspector_name", label: "المراقب", required: true, fromProfile: true },
    { type: "text", key: "shop_name", label: "المنشأة", required: true },
    { type: "text", key: "license_number", label: "رقم الرخصة", inputmode: "numeric" },
  ],
};

const CASE_COMMON_BOTTOM = {
  title: "شرح المراقب للحالة",
  fields: [
    { type: "textarea", key: "explanation", label: "الشرح", rows: 6 },
    { type: "signature", key: "inspector_sig", label: "توقيع المراقب", required: true },
  ],
};

// ----------------------------------------------------------------
// 2) محضر إثبات حالة — عام
// ----------------------------------------------------------------
const GENERAL_ITEMS = [
  { id: "g1", label: "هروب العمالة أثناء عمليات الرقابة والتفتيش عن المحل أثناء التفتيش (الهيئة)", count: [126.9, 250.6], bullet: [444.6, 244.5] },
  { id: "g2", label: "هروب العمالة أثناء عملية الرقابة والتفتيش عن المحل أو المنشأة (الوزارة)", count: [144.2, 268.9], bullet: [444.6, 262.6] },
  { id: "g3", label: "عدم السماح أو إعاقة عمل القائمين بأعمال الرقابة الصحية (الهيئة)", bullet: [444.6, 280.7] },
  { id: "g4", label: "قيام المسؤول عن المنشأة الغذائية أو من يمثله بمساعدة العمالة المخالفة على الهرب أثناء التفتيش (الهيئة)", count: [234.8, 323.4], bullet: [444.6, 298.8] },
  { id: "g5", label: "قيام المسؤول عن المحل أو من يمثله بمساعدة العمالة المخالفة على الهرب، أو عدم السماح أو إعاقة عمل القائمين بالرقابة (الوزارة)", count: [309.1, 377.7], bullet: [444.6, 335.4] },
  { id: "g6", label: "قيام بعض العاملين بارتداء المتعلقات الشخصية أثناء العمل (الهيئة)", count: [234.3, 414.1], bullet: [444.6, 389.7] },
  { id: "g7", label: "وجود عمال تظهر عليهم أعراض مرضية أو بهم جروح أو بثور (اللائحتين)", count: [98.3, 432.2], bullet: [444.6, 426.3] },
  { id: "g8", label: "عدم ارتداء الزي الموحد المخصص للعمل مع غطاء الرأس والقفازات أو عدم نظافته (الهيئة)", count: [227.2, 468.6], bullet: [444.6, 444.4] },
  { id: "g9", label: "عدم ارتداء العاملين القفازات والكمامات وغطاء الشعر والزي الموحد أثناء العمل (الوزارة)", count: [320.7, 504.8], bullet: [444.6, 480.5] },
];

const TPL_CASE_GENERAL = {
  key: "case_general",
  title: "محضر إثبات حالة (عام)",
  image: "template-case-general.jpg",
  shopKey: "shop_name",
  sections: [
    CASE_COMMON_TOP,
    {
      title: "المخالفات",
      fields: [
        { type: "checklist", key: "items", withCount: true, items: GENERAL_ITEMS },
        { type: "text", key: "extra1", label: "مخالفة أخرى" },
        { type: "text", key: "extra2", label: "مخالفة أخرى" },
      ],
    },
    CASE_COMMON_BOTTOM,
  ],
  pageCount: () => 1,
  render(R, d, sig) {
    renderCaseHeader(R, d);
    renderCaseItems(R, d, GENERAL_ITEMS);
    if (d.extra1) { R.check(444.6, 516.7); R.text(d.extra1, 428, 520.5, { size: 9.5, maxWidth: 340 }); }
    if (d.extra2) { R.check(444.6, 535.3); R.text(d.extra2, 428, 539, { size: 9.5, maxWidth: 340 }); }
    renderCaseFooter(R, d, sig, [580.9, 598.0, 615.3, 632.6, 649.9, 667.1, 684.3, 701.6], 720.9);
  },
};

// ----------------------------------------------------------------
// 3) محضر إثبات حالة — كروت صحية
// ----------------------------------------------------------------
const CARDS_ITEMS = [
  { id: "c1", label: "عدم استخراج رخصة ممارسة العمل في الأنشطة المتعلقة بالغذاء لأي عامل يستوجب عمله حصوله عليها (الهيئة)", count: [180.9, 324.7], bullet: [444.35, 279.4] },
  { id: "c2", label: "عدم استخراج شهادة صحية لأي عامل يستوجب عمله حصوله عليها (الوزارة)", count: [313.2, 383.2], bullet: [444.35, 338.0] },
  { id: "c3", label: "عدم وجود رخصة ممارسة العمل في الأنشطة المتعلقة بالغذاء للعاملين بالمنشأة أثناء زيارة المفتش (الهيئة)", count: [334.7, 422.4], bullet: [444.35, 396.7] },
  { id: "c4", label: "عدم تجديد رخصة ممارسة العمل في الأنشطة المتعلقة بالغذاء لأي عامل يستوجب عمله حصوله عليها (الهيئة)", count: [222.1, 481.1], bullet: [444.35, 435.8] },
  { id: "c5", label: "عدم تجديد الشهادة الصحية لأي عامل يستوجب عمله حصوله عليها (الوزارة)", count: [313.2, 539.7], bullet: [444.35, 494.5] },
];

const TPL_CASE_CARDS = {
  key: "case_cards",
  title: "محضر إثبات حالة (كروت صحية)",
  image: "template-case-cards.jpg",
  shopKey: "shop_name",
  sections: [
    CASE_COMMON_TOP,
    {
      title: "المخالفات",
      note: "اذكر اسم العامل ورقم هويته في الشرح عند رفضه إبراز الهوية أو التصوير",
      fields: [{ type: "checklist", key: "items", withCount: true, items: CARDS_ITEMS }],
    },
    CASE_COMMON_BOTTOM,
  ],
  pageCount: () => 1,
  render(R, d, sig) {
    renderCaseHeader(R, d);
    renderCaseItems(R, d, CARDS_ITEMS);
    renderCaseFooter(R, d, sig, [599.0, 616.3, 633.5, 650.7, 668.0, 685.3, 702.5, 719.7, 737.0], 756.3);
  },
};


// ----------------------------------------------------------------
// 4) محضر الحملة النهائي
// ----------------------------------------------------------------
// خانات الأيام (☐ قبل اسم اليوم) — getDay(): 0 الأحد ... 5 الجمعة (السبت مو بالقالب)
const CAMPAIGN_DAY_BOXES = { 0: 428.75, 1: 389.35, 2: 345.85, 3: 300.65, 4: 251.25, 5: 203.15 };
const CAMPAIGN_ROW_TOPS = [419.3, 438.5, 457.6, 476.7, 495.9, 515.0, 534.1, 553.3, 572.3, 591.4, 610.6]; // ارتفاع ~18.7
const CAMPAIGN_MUNI_TOP = 665.0; // أول سطر بجدول البلدية (ارتفاع ~14.4)

const CAMPAIGN_ENTITIES = [
  { id: "emirate", label: "إمارة المنطقة" },
  { id: "amanah", label: "الأمانة" },
  { id: "sub_muni", label: "البلدية الفرعية" },
  { id: "security", label: "الأمن العام" },
  { id: "transport", label: "هيئة النقل العام" },
  { id: "sfda", label: "هيئة الغذاء والدواء" },
  { id: "civil_defense", label: "المديرية العامة للدفاع المدني" },
  { id: "commerce", label: "وزارة التجارة" },
  { id: "health", label: "وزارة الصحة" },
  { id: "hrsd", label: "وزارة الموارد البشرية والتنمية الاجتماعية" },
  { id: "other", label: "أخرى", custom: true },
];

const TPL_CAMPAIGN = {
  key: "campaign",
  title: "محضر الحملة النهائي",
  image: "template-campaign.jpg",
  shopKey: "scope",
  sections: [
    {
      title: "بيانات الجولة",
      fields: [
        { type: "date", key: "date", label: "التاريخ", required: true, defaultToday: true, weekdayHint: true },
        { type: "time", key: "time", label: "الساعة", required: true, defaultNow: true },
        { type: "text", key: "scope", label: "النطاق", required: true },
      ],
    },
    {
      title: "الإنجاز",
      fields: [
        { type: "text", key: "visits", label: "عدد الزيارات", inputmode: "numeric" },
        { type: "text", key: "closures", label: "عدد الإغلاقات", inputmode: "numeric" },
        { type: "text", key: "destructions", label: "عدد الإتلافات", inputmode: "numeric" },
      ],
    },
    {
      title: "الجهات المشاركة",
      fields: [{ type: "entities", key: "entities", items: CAMPAIGN_ENTITIES }],
    },
    {
      title: "البلدية",
      fields: [
        { type: "text", key: "municipality", label: "البلدية" },
        { type: "text", key: "inspector_name", label: "اسم المراقب", required: true, fromProfile: true },
        { type: "signature", key: "inspector_sig", label: "توقيع المراقب", required: true },
      ],
    },
    {
      title: "ملاحظة",
      fields: [{ type: "textarea", key: "notes", label: "ملاحظة (اختياري)", rows: 4 }],
    },
  ],
  pageCount: () => 1,
  validate: () => "",
  render(R, d, sig) {
    // اليوم
    if (d.date) {
      const [y, m, dd] = d.date.split("-").map(Number);
      const box = CAMPAIGN_DAY_BOXES[new Date(y, m - 1, dd, 12).getDay()];
      if (box) R.check(box, 218.7);
      const g = d.date.split("-");
      R.white(380, 227, 433, 240);
      R.text(`${g[2]}/${g[1]}/${g[0]}`, 431, 237, { size: 10.5 });
    }
    // الساعة + صباحًا/مساءً
    if (d.time) {
      let [h, mi] = d.time.split(":").map(Number);
      R.check(h < 12 ? 374.65 : 413.45, 249.1);
      h = h % 12 || 12;
      R.white(419.5, 244, 434, 256);
      R.text(`${h}:${String(mi).padStart(2, "0")}`, 470, 253, { size: 10.5, maxWidth: 36 });
    }
    // النطاق
    R.white(419, 258, 434, 270);
    R.text(d.scope, 433, 267, { size: 10.5, maxWidth: 330 });

    // الأعداد
    [[d.visits, 322.4], [d.closures, 336.0], [d.destructions, 349.7]].forEach(([v, top]) =>
      R.center(v, 396, 431, top, top + 11, { size: 10, weight: 700 })
    );

    // الجهات المشاركة
    const ents = d.entities || {};
    CAMPAIGN_ENTITIES.forEach((e, i) => {
      const v = ents[e.id];
      if (!v || !v.on) return;
      const top = CAMPAIGN_ROW_TOPS[i];
      R.check(493.35, top + 9.6, 0.85);
      if (e.custom && v.label) R.text(v.label, 443, top + 13.5, { size: 9.5, maxWidth: 115 });
      R.center(v.name, 196, 321, top, top + 18.7, { size: 9 });
      R.sign(sig["ent_" + e.id], 96, top + 1.5, 188, top + 17.5);
    });

    // البلدية (أول سطر)
    const mt = CAMPAIGN_MUNI_TOP;
    R.center(d.municipality, 325, 503, mt, mt + 14.4, { size: 9 });
    R.center(d.inspector_name, 196, 321, mt, mt + 14.4, { size: 9 });
    R.sign(sig.inspector_sig, 96, mt + 0.8, 188, mt + 13.8);

    // الملاحظة بالفراغ آخر الصفحة
    if (d.notes) {
      R.text("ملاحظة:", 504, 738, { size: 11, weight: 700, color: "#111" });
      R.wrap(d.notes, 504, 414, [756, 772, 788, 804], { size: 10 });
    }
  },
};

const REPORT_TEMPLATES = [TPL_SEIZURE, TPL_CASE_GENERAL, TPL_CASE_CARDS, TPL_CAMPAIGN];

function getReportTemplate(key) {
  return REPORT_TEMPLATES.find((t) => t.key === key) || null;
}

// ----------------------------------------------------------------
// أدوات التاريخ والوقت
// ----------------------------------------------------------------
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// التاريخ الهجري بتقويم أم القرى (أرقام إنجليزية مثل باقي المحضر)
function hijriParts(iso) {
  if (!iso) return null;
  const [y, m, dd] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, dd, 12);
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
    return { year: get("year").replace(/\D/g, ""), month: get("month"), day: get("day") };
  } catch (e) {
    return null;
  }
}

function formatTime12(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "صباحًا" : "مساءً";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${period}`;
}
