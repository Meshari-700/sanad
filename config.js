// ==================================================================
// config.js — اتصال مشروع Supabase الخاص بـ "سند"
// المفتاح publishable عام بطبيعته، والحماية الفعلية من سياسات RLS بالسكيما
// ==================================================================

const SUPABASE_URL = "https://cttooytoziipdcasliah.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gROBYh4lXXsrrmuryaRslA_ICSc3zBr";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
