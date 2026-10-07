// ==================================================================
// content.js — قراءة المحتوى التفتيشي
// مجموعات الأنشطة ← الأنشطة ← الاشتراطات ← البنود (+ صور البند)
// (دوال الكتابة للمشرف تنضاف بمرحلة صفحات الإشراف)
// ==================================================================

const ITEM_IMAGES_BUCKET = "item-images";

// ترتيب موحّد: sort_order ثم الأقدم أولًا
function bySortOrder(a, b) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    String(a.created_at || "").localeCompare(String(b.created_at || ""));
}

async function fetchActivityGroups() {
  const { data, error } = await supabaseClient
    .from("activity_groups")
    .select("id, name, icon_type, icon_value, sort_order, created_at");
  if (error) throw error;
  return data.sort(bySortOrder);
}

async function fetchActivities() {
  const { data, error } = await supabaseClient
    .from("activities")
    .select("id, group_id, name, icon_type, icon_value, sort_order, created_at");
  if (error) throw error;
  return data.sort(bySortOrder);
}

async function fetchActivity(id) {
  const { data, error } = await supabaseClient
    .from("activities")
    .select("id, group_id, name, icon_type, icon_value")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// اشتراطات النشاط مع بنودها (طلب واحد)
async function fetchRequirementsWithItems(activityId) {
  const { data, error } = await supabaseClient
    .from("requirements")
    .select("id, name, sort_order, created_at, items(id, title, description, is_suspended, sort_order, created_at)")
    .eq("activity_id", activityId);
  if (error) throw error;
  data.sort(bySortOrder);
  data.forEach((r) => (r.items || []).sort(bySortOrder));
  return data;
}

// البند مع اشتراطه ونشاطه وصوره
async function fetchItem(id) {
  const { data, error } = await supabaseClient
    .from("items")
    .select(`
      id, title, description, notes, is_suspended, requirement_id,
      requirement:requirements(id, name, activity:activities(id, name)),
      images:item_images(id, storage_path, sort_order, created_at)
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (data && data.images) data.images.sort(bySortOrder);
  return data;
}

function itemImageUrl(path) {
  return publicFileUrl(ITEM_IMAGES_BUCKET, path);
}

// -------------------------------------------------
// بطاقة نشاط (تُستخدم بالرئيسية وصفحة الأنشطة)
// -------------------------------------------------
function activityTileHtml(activity) {
  return `
    <a class="tile" href="activity.html?id=${encodeURIComponent(activity.id)}">
      <span class="tile-icon">${renderEntityIcon(activity)}</span>
      <span class="tile-name">${escapeHtml(activity.name)}</span>
    </a>`;
}
