// ==================================================================
// unscheduled.js — أداة "الزيارات غير المجدولة": الحفظ، التعديل، الجلب، التصدير
// يحتاج: xlsx-lite.js للتصدير
// ==================================================================

const UNSCHEDULED_REASONS = {
  citizen_report: "بلاغ مواطن",
  transaction: "معاملة",
  campaign: "حملة",
  periodic_cancelled: "زيارة دورية رخصة ملغية",
  other: "أخرى",
};

function unscheduledReasonText(r) {
  if (r.visit_reason === "other") return r.visit_reason_other ? `أخرى: ${r.visit_reason_other}` : "أخرى";
  return UNSCHEDULED_REASONS[r.visit_reason] || "";
}

function unscheduledAuthor(r) {
  return (r.author && (r.author.full_name || r.author.email)) || "";
}

function unscheduledTime(value) {
  const d = new Date(value);
  if (isNaN(d)) return "";
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
}

async function fetchUnscheduledVisit(id) {
  const { data, error } = await supabaseClient
    .from("unscheduled_visits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// filters: { userId, from, to } — التواريخ "YYYY-MM-DD" على تاريخ الزيارة
async function fetchUnscheduledVisits({ userId = null, from = null, to = null } = {}) {
  let q = supabaseClient
    .from("unscheduled_visits")
    .select("*, author:profiles(full_name, email)")
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3000);
  if (userId) q = q.eq("created_by", userId);
  if (from) q = q.gte("visit_date", from);
  if (to) q = q.lte("visit_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// عدد الزيارات المسجلة بنفس الرقم عند جميع المفتشين (للتنبيه فقط، لا يمنع الحفظ)
async function countUnscheduledByNumber(visitNumber, excludeId = null) {
  const { data, error } = await supabaseClient.rpc("unscheduled_visit_count", {
    p_visit_number: visitNumber,
    p_exclude: excludeId,
  });
  if (error) throw error;
  return Number(data) || 0;
}

async function saveUnscheduledVisit(values, id = null) {
  if (id) {
    const { error } = await supabaseClient.from("unscheduled_visits").update(values).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabaseClient.from("unscheduled_visits").insert(values).select("id").single();
  if (error) throw error;
  return data.id;
}

async function deleteUnscheduledVisit(id) {
  const { error } = await supabaseClient.from("unscheduled_visits").delete().eq("id", id);
  if (error) throw error;
}

// -------------------------------------------------
// التصدير لإكسل: ورقة "الملخص" (عدد الزيارات لكل سبب) + ورقة التفاصيل
// -------------------------------------------------
function unscheduledSummarySheet(rows) {
  const keys = Object.keys(UNSCHEDULED_REASONS);
  const body = keys.map((k) => ({
    height: 26,
    cells: [UNSCHEDULED_REASONS[k], rows.filter((r) => r.visit_reason === k).length],
  }));
  body.push({ total: true, height: 28, cells: ["المجموع", rows.length] });
  return {
    name: "الملخص",
    rowHeight: 26,
    columns: [
      { header: "سبب فتح الزيارة", width: 28 },
      { header: "عدد الزيارات", width: 14 },
    ],
    rows: body,
  };
}

function unscheduledDetailSheet(rows) {
  return {
    name: "الزيارات غير المجدولة",
    rowHeight: 26,
    columns: [
      { header: "م", width: 6 },
      { header: "رقم الزيارة", width: 18 },
      { header: "التاريخ", width: 12 },
      { header: "الوقت", width: 11 },
      { header: "المفتش", width: 24 },
      { header: "سبب فتح الزيارة", width: 30 },
      { header: "رقم الزيارة السابقة أو البلاغ", width: 26 },
    ],
    rows: rows.map((r, i) => ({
      height: 26,
      cells: [
        i + 1,
        r.visit_number || "",
        (r.visit_date || "").split("-").join("/"),
        unscheduledTime(r.created_at),
        unscheduledAuthor(r),
        unscheduledReasonText(r),
        r.previous_number || "",
      ],
    })),
  };
}

async function exportUnscheduledXlsx(rows) {
  return buildXlsx({ sheets: [unscheduledSummarySheet(rows), unscheduledDetailSheet(rows)] });
}
