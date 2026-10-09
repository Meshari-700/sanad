// ==================================================================
// daily.js — أداة "تقرير الزيارات اليومية": الحفظ، التعديل، الجلب، التصدير
// يحتاج: xlsx-lite.js للتصدير
// ==================================================================

const MUNICIPALITIES = ["الجامعة", "العزيزية", "أم السلم", "الجنوب", "بريمان", "المطار", "جدة الجديدة", "أبحر", "طيبة", "ذهبان"];

const CONTROL_TYPES = {
  commercial: "تجاري",
  health: "صحي",
  transactions: "معاملات",
  complaints: "بلاغات",
};

const DAILY_COUNTS = [
  { key: "present", label: "موجود" },
  { key: "absent", label: "غير موجود" },
  { key: "closed", label: "مغلق" },
];

const DAILY_EXTRA_COUNTS = [
  { key: "closures_count", label: "عدد الإغلاقات" },
  { key: "complaints_count", label: "عدد البلاغات" },
  { key: "out_of_scope", label: "عدم اختصاص" },
  { key: "after_midnight", label: "منشآت تمت زيارتها بعد الساعة 12 ص" },
];

const LAST_MUNI_KEY = "sanad_last_municipality";

function controlTypesText(arr) {
  return (arr || []).map((k) => CONTROL_TYPES[k]).filter(Boolean).join("، ");
}

function dailyVisits(r) {
  return (r.present || 0) + (r.absent || 0) + (r.closed || 0);
}

async function fetchDailyReport(id) {
  const { data, error } = await supabaseClient
    .from("daily_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// filters: { userId, municipality, from, to } — التواريخ "YYYY-MM-DD" على تاريخ التقرير
async function fetchDailyReports({ userId = null, municipality = null, from = null, to = null } = {}) {
  let q = supabaseClient
    .from("daily_reports")
    .select("*, author:profiles(full_name, email)")
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3000);
  if (userId) q = q.eq("created_by", userId);
  if (municipality) q = q.eq("municipality", municipality);
  if (from) q = q.gte("report_date", from);
  if (to) q = q.lte("report_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function saveDailyReport(values, id = null) {
  if (id) {
    const { error } = await supabaseClient.from("daily_reports").update(values).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabaseClient.from("daily_reports").insert(values).select("id").single();
  if (error) throw error;
  return data.id;
}

async function deleteDailyReport(id) {
  const { error } = await supabaseClient.from("daily_reports").delete().eq("id", id);
  if (error) throw error;
}

// -------------------------------------------------
// التصدير لإكسل
// - بلدية وحدة بالفلتر: ورقة وحدة
// - كل البلديات: ورقة "الملخص" (سطر لكل بلدية) + ورقة لكل بلدية لها تقارير
// كل ورقة تنتهي بصف المجاميع
// -------------------------------------------------
const DAILY_SUM_KEYS = ["present", "absent", "closed", "closures_count", "complaints_count", "out_of_scope", "after_midnight"];

function dailySums(rows) {
  const out = { reports: rows.length, visits: 0 };
  DAILY_SUM_KEYS.forEach((k) => (out[k] = 0));
  rows.forEach((r) => {
    out.visits += dailyVisits(r);
    DAILY_SUM_KEYS.forEach((k) => (out[k] += Number(r[k]) || 0));
  });
  return out;
}

function dailyDetailSheet(name, rows) {
  const t = dailySums(rows);
  const body = rows.map((r, i) => ({
    height: 30,
    cells: [
      i + 1,
      (r.report_date || "").split("-").join("/"),
      r.inspector_name || (r.author && (r.author.full_name || r.author.email)) || "",
      r.municipality || "",
      controlTypesText(r.control_types),
      dailyVisits(r),
      ...DAILY_SUM_KEYS.map((k) => Number(r[k]) || 0),
      r.shortage_reason || "",
      r.notes || "",
    ],
  }));
  body.push({
    total: true,
    height: 28,
    cells: ["", "المجموع", `${rows.length} تقرير`, "", "", t.visits, ...DAILY_SUM_KEYS.map((k) => t[k]), "", ""],
  });
  return {
    name,
    rowHeight: 30,
    columns: [
      { header: "م", width: 6 },
      { header: "التاريخ", width: 12 },
      { header: "الاسم", width: 24 },
      { header: "البلدية", width: 13 },
      { header: "نوع الرقابة", width: 20 },
      { header: "عدد الزيارات", width: 11 },
      { header: "موجود", width: 9 },
      { header: "غير موجود", width: 10 },
      { header: "مغلق", width: 9 },
      { header: "الإغلاقات", width: 10 },
      { header: "البلاغات", width: 10 },
      { header: "عدم اختصاص", width: 11 },
      { header: "بعد 12 ص", width: 10 },
      { header: "سبب النقص", width: 26 },
      { header: "ملاحظات", width: 30 },
    ],
    rows: body,
  };
}

function dailySummarySheet(groups, allRows) {
  const line = (label, t) => [label, t.reports, t.visits, ...DAILY_SUM_KEYS.map((k) => t[k])];
  const rows = groups.map((g) => ({ height: 26, cells: line(g.name, dailySums(g.rows)) }));
  rows.push({ total: true, height: 28, cells: line("المجموع", dailySums(allRows)) });
  return {
    name: "الملخص",
    rowHeight: 26,
    columns: [
      { header: "البلدية", width: 16 },
      { header: "عدد التقارير", width: 12 },
      { header: "عدد الزيارات", width: 12 },
      { header: "موجود", width: 9 },
      { header: "غير موجود", width: 10 },
      { header: "مغلق", width: 9 },
      { header: "الإغلاقات", width: 10 },
      { header: "البلاغات", width: 10 },
      { header: "عدم اختصاص", width: 11 },
      { header: "بعد 12 ص", width: 10 },
    ],
    rows,
  };
}

async function exportDailyXlsx(rows, { splitByMunicipality = false } = {}) {
  if (!splitByMunicipality) {
    return buildXlsx({ sheets: [dailyDetailSheet("الزيارات اليومية", rows)] });
  }
  // نفس ترتيب قائمة البلديات، ونتخطى اللي ما لها تقارير
  const groups = MUNICIPALITIES
    .map((m) => ({ name: m, rows: rows.filter((r) => r.municipality === m) }))
    .filter((g) => g.rows.length);
  const others = rows.filter((r) => !MUNICIPALITIES.includes(r.municipality));
  if (others.length) groups.push({ name: "أخرى", rows: others });

  return buildXlsx({
    sheets: [dailySummarySheet(groups, rows), ...groups.map((g) => dailyDetailSheet(g.name, g.rows))],
  });
}
