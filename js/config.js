import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cole aqui os dados do seu projeto Supabase.
// Use a URL do projeto e a chave publicável (anon/publishable).
// Nunca coloque a chave service_role neste arquivo.
const SUPABASE_URL = "https://lxufquezsamzdgfmurly.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dlKyaG80iXc1A2OeZTNaBA_QNAIH_pS";

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("COLE_AQUI") &&
  !SUPABASE_ANON_KEY.includes("COLE_AQUI");

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
