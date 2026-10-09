// ==================================================================
// directives.js — التوجيهات وتتبّع المقروء
// ==================================================================

const DIRECTIVE_IMAGES_BUCKET = "directive-images";
const MAX_DIRECTIVE_IMAGES = 2;

function directiveImageUrl(path) {
  return publicFileUrl(DIRECTIVE_IMAGES_BUCKET, path);
}

// صور التوجيه (مخفية لين ينفتح التوجيه كامل)
function directivePhotosHtml(d) {
  const imgs = d.images || [];
  if (!imgs.length) return "";
  return `<div class="photo-row directive-photos hidden">${imgs.map((p) => {
    const url = directiveImageUrl(p);
    return `<button data-src="${escapeHtml(url)}" aria-label="عرض الصورة"><img src="${escapeHtml(url)}" alt="" loading="lazy" /></button>`;
  }).join("")}</div>`;
}

async function fetchDirectives() {
  const { data, error } = await supabaseClient
    .from("directives")
    .select("id, title, content, images, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchMyReadDirectiveIds() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return new Set();
  const { data, error } = await supabaseClient
    .from("directive_reads")
    .select("directive_id")
    .eq("user_id", user.id);
  if (error) throw error;
  return new Set(data.map((r) => r.directive_id));
}

async function countUnreadDirectives() {
  const [{ count, error }, readIds] = await Promise.all([
    supabaseClient.from("directives").select("id", { count: "exact", head: true }),
    fetchMyReadDirectiveIds(),
  ]);
  if (error) throw error;
  return Math.max(0, (count || 0) - readIds.size);
}

async function markDirectivesRead(ids) {
  if (!ids.length) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  const rows = ids.map((id) => ({ directive_id: id, user_id: user.id }));
  const { error } = await supabaseClient
    .from("directive_reads")
    .upsert(rows, { onConflict: "directive_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
}
