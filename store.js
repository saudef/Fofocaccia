// FoFocaccia Tracker — the shared live store (Supabase, no accounts: anyone with the link can read and write).
// Exposes window.FofoStore = { configured, connect() }. connect() resolves with a tiny
// document-store API (doc / collection, get / set / delete / onSnapshot) that the tracker uses.
(() => {
"use strict";
const cfg = window.FOFO_CONFIG || {};
const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);
let sb = null;
const client = () => sb || (sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY));

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

// ---------- connect: no accounts, the link is the key ----------
async function connect(){ return { db: makeDb() }; }
const FofoStore = { configured, connect };
window.FofoStore = FofoStore;
})();
