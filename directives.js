// ==================================================================
// directives.js — التوجيهات وتتبّع المقروء
// ==================================================================

async function fetchDirectives() {
  const { data, error } = await supabaseClient
    .from("directives")
    .select("id, title, content, created_at")
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
