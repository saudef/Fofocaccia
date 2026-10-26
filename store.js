// FoFocaccia Tracker — sign-in and the shared live store (Supabase).
// Exposes window.FofoStore = { configured, connect(), signOut(), email }.
// connect() shows the sign-in screen until someone signs in, then resolves with a tiny
// document-store API (doc / collection, get / set / delete / onSnapshot) that the tracker uses.
(() => {
"use strict";
const cfg = window.FOFO_CONFIG || {};
const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);
let sb = null;
const client = () => sb || (sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY));
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// ---------- document store on one table: docs(path, collection, data) ----------
function makeDb(){
  const db = client();
  const docCbs = new Map();   // path -> Set(cb)
  const colls  = new Map();   // collection -> {rows: Map(id -> data), cbs: Set(cb)}
  const splitPath = p => { const i = p.indexOf("/"); return [p.slice(0, i), p.slice(i + 1)]; };
  const snap = (path, data) => ({ exists: data != null, id: splitPath(path)[1], data: () => data });
  const emitColl = name => { const c = colls.get(name); if (!c) return; const docs = [...c.rows].map(([id, data]) => ({ id, data: () => data })); c.cbs.forEach(cb => cb({ docs })); };
  const apply = (path, data) => { // update local mirrors and tell listeners
    (docCbs.get(path) || []).forEach(cb => cb(snap(path, data)));
    const [name, id] = splitPath(path); const c = colls.get(name);
    if (c){ if (data == null) c.rows.delete(id); else c.rows.set(id, data); emitColl(name); } };
  let live = false;
  const goLive = () => { if (live) return; live = true;
    db.channel("docs-live").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
      const row = p.eventType === "DELETE" ? p.old : p.new; if (!row || !row.path) return;
      apply(row.path, p.eventType === "DELETE" ? null : row.data);
    }).subscribe(); };
  const doc = path => ({
    async get(){ const { data, error } = await db.from("docs").select("data").eq("path", path).maybeSingle(); if (error) throw error; return snap(path, data ? data.data : null); },
    async set(body){ const { error } = await db.from("docs").upsert({ path, data: body }, { onConflict: "path" }); if (error) throw error; apply(path, body); },
    async delete(){ const { error } = await db.from("docs").delete().eq("path", path); if (error) throw error; apply(path, null); },
    onSnapshot(cb, onErr){ goLive(); if (!docCbs.has(path)) docCbs.set(path, new Set()); docCbs.get(path).add(cb);
      this.get().then(cb).catch(onErr || console.warn); return () => docCbs.get(path).delete(cb); }
  });
  const collection = name => ({
    doc: id => doc(name + "/" + id),
    onSnapshot(cb, onErr){ goLive(); let c = colls.get(name); if (!c){ c = { rows: new Map(), cbs: new Set() }; colls.set(name, c); } c.cbs.add(cb);
      db.from("docs").select("path,data").eq("collection", name).then(({ data, error }) => { if (error){ (onErr || console.warn)(error); return; }
        c.rows = new Map(data.map(r => [splitPath(r.path)[1], r.data])); emitColl(name); });
      return () => c.cbs.delete(cb); }
  });
  return { doc, collection };
}

// ---------- sign-in screen ----------
function loginHtml(mode, msg, bad){
  const biz = esc(cfg.BUSINESS || "FoFocaccia");
  const field = (id, label, type, extra="") => `<label style="display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)">${label}<input class="in" id="${id}" type="${type}" ${extra} style="width:100%;font-size:15px;padding:9px 10px"></label>`;
  const body = mode === "recover"
    ? `<p class="note">Choose a new password for your account.</p>${field("pw", "New password", "password", 'autocomplete="new-password" minlength="6" required')}<button class="btn" type="submit" style="font-size:15px;padding:10px">Save password</button>`
    : mode === "reset"
    ? `<p class="note">We will email you a link to set a new password.</p>${field("em", "Email", "email", 'autocomplete="email" required')}<button class="btn" type="submit" style="font-size:15px;padding:10px">Send reset link</button><button class="btn sec" type="button" data-mode="in">Back to sign in</button>`
    : `${field("em", "Email", "email", 'autocomplete="email" required')}${field("pw", "Password", "password", `autocomplete="${mode === "up" ? "new-password" : "current-password"}" minlength="6" required`)}
       <button class="btn" type="submit" style="font-size:15px;padding:10px">${mode === "up" ? "Create account" : "Sign in"}</button>
       <div class="row" style="justify-content:space-between;font-size:13px">${cfg.ALLOW_SIGNUP === false ? "<span></span>" : `<button class="btn sec" type="button" data-mode="${mode === "up" ? "in" : "up"}">${mode === "up" ? "I already have an account" : "Create an account"}</button>`}<button class="btn sec" type="button" data-mode="reset">Forgot password?</button></div>`;
  return `<div style="max-width:380px;margin:40px auto"><div class="panel"><h2 style="font-size:22px;margin-bottom:4px">${mode === "up" ? "Create your account" : mode === "recover" ? "New password" : mode === "reset" ? "Reset password" : "Sign in"}</h2>
    <p class="note" style="margin:0 0 12px">${biz} books. Everyone who signs in works on the same live numbers.</p>
    <form id="loginForm" style="display:grid;gap:10px">${body}</form>
    <p id="loginMsg" class="note" style="margin:10px 0 0;min-height:1.2em;${bad ? "color:var(--red)" : ""}">${esc(msg || "")}</p></div></div>`;
}
function connect(){
  return new Promise(resolve => {
    const db = client();
    let mode = "in", done = false;
    const finish = session => { if (done || !session) return; done = true; FofoStore.email = session.user.email; resolve({ db: makeDb(), email: session.user.email }); };
    const show = (msg, bad) => { const keep = ($("#em") || {}).value || ""; $("#view").innerHTML = loginHtml(mode, msg, bad); if ($("#em")) $("#em").value = keep; const st = $("#status"); if (st) st.textContent = "sign in to continue";
      $("#loginForm").addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (!b) return; mode = b.dataset.mode; show(); });
      $("#loginForm").addEventListener("submit", submit); const f = $("#em") || $("#pw"); if (f) f.focus(); };
    const submit = async e => { e.preventDefault(); const em = ($("#em") || {}).value, pw = ($("#pw") || {}).value; const btn = e.target.querySelector("[type=submit]"); btn.disabled = true; $("#loginMsg").textContent = "…";
      try {
        if (mode === "in"){ const { error } = await db.auth.signInWithPassword({ email: em, password: pw }); if (error) throw error; }
        else if (mode === "up"){ const { data, error } = await db.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: location.origin + location.pathname } }); if (error) throw error;
          if (!data.session){ mode = "in"; show("Account created. Check your email for the confirmation link, then sign in.", false); return; } }
        else if (mode === "reset"){ const { error } = await db.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname }); if (error) throw error; mode = "in"; show("If that address has an account, a reset link is on its way.", false); return; }
        else if (mode === "recover"){ const { error } = await db.auth.updateUser({ password: pw }); if (error) throw error; const { data } = await db.auth.getSession(); finish(data.session); return; }
      } catch (err){ show(err.message || String(err), true); return; }
    };
    db.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY"){ mode = "recover"; show("", false); return; }
      if (event === "SIGNED_OUT"){ if (done) location.reload(); return; }
      if (session) finish(session);
    });
    db.auth.getSession().then(({ data }) => { if (data.session) finish(data.session); else if (!done && mode !== "recover") show(); });
  });
}
async function signOut(){ try { await client().auth.signOut(); } catch (e){} location.reload(); }
const FofoStore = { configured, connect, signOut, email: null };
window.FofoStore = FofoStore;
})();
