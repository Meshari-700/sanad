// ==================================================================
// recent.js — آخر الأنشطة المفتوحة (محفوظة محليًا على الجهاز فقط)
// تُخزَّن المعرّفات فقط؛ الأسماء والأيقونات تُجلب حيّة عشان التعديلات تنعكس
// ==================================================================

const RECENT_KEY = "sanad_recent_activities";
const RECENT_MAX = 6;

function getRecentActivityIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch (e) {
    return [];
  }
}

function pushRecentActivity(id) {
  if (!id) return;
  const ids = [id, ...getRecentActivityIds().filter((x) => x !== id)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); } catch (e) { /* تخزين ممتلئ أو ممنوع */ }
}

// تنظيف أي معرّف لنشاط محذوف
function pruneRecentActivities(existingIds) {
  const set = new Set(existingIds);
  const ids = getRecentActivityIds().filter((x) => set.has(x));
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); } catch (e) {}
  return ids;
}
