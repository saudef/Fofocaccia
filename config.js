// FoFocaccia Tracker — connection settings.
// Fill these in from your Supabase project: Project settings → API.
// The anon key is meant to be public; the database rules (supabase/schema.sql) decide what signed-in users may do.
window.FOFO_CONFIG = {
  SUPABASE_URL: "https://zzczkxxpwdijnqfkuerk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_o2EMWaarGMMVbj3VVbUdJw_b6XUese7",  // the publishable (public) key
  ALLOW_SIGNUP: true,     // false hides the "Create account" form; also turn off sign-ups in Supabase → Authentication → Providers → Email
  BUSINESS: "FoFocaccia"
};
