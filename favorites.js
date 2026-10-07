// ==================================================================
// favorites.js — مفضلة البنود (محفوظة بحساب المستخدم)
// ==================================================================

async function fetchFavorites(limit = null) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return [];
  let query = supabaseClient
    .from("favorites")
    .select(`
      created_at,
      item:items(id, title, is_suspended,
        requirement:requirements(name, activity:activities(id, name)))
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data.filter((f) => f.item); // بند محذوف = يختفي
}

async function isFavorite(itemId) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabaseClient
    .from("favorites")
    .select("item_id")
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function addFavorite(itemId) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient
    .from("favorites")
    .upsert({ user_id: user.id, item_id: itemId }, { onConflict: "user_id,item_id", ignoreDuplicates: true });
  if (error) throw error;
}

async function removeFavorite(itemId) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("item_id", itemId);
  if (error) throw error;
}
