// ⚙️ KONFIGURACE CLOUDU (majitel appky) — sem doplň údaje svého Supabase projektu.
//
// Tyto hodnoty jsou "zapečené" do appky. anon key je PUBLIC klíč určený
// pro klienty (není tajný), takže ho lze bezpečně mít v binárce. Skutečná
// data jsou stejně end-to-end šifrovaná klíčem odvozeným z hesla uživatele.
//
// Kde to najdeš v Supabase: Project Settings → API → Project URL a anon public key.

pub const SUPABASE_URL: &str = "https://mzfpmywzozleptvgjedz.supabase.co";
pub const SUPABASE_ANON_KEY: &str = "sb_publishable_16pYZYq916rwFxJlSnisFg__JqrxY-l";
pub const STORAGE_BUCKET: &str = "vaults";

/// Je cloud nakonfigurovaný (vyplněné placeholdery)?
pub fn is_configured() -> bool {
    !SUPABASE_URL.contains("YOUR-PROJECT") && !SUPABASE_ANON_KEY.contains("YOUR-ANON")
}
