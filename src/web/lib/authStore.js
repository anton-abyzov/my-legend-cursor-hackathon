/**
 * Supabase Auth access layer for the web app.
 *
 * Enabled when SUPABASE_URL + SUPABASE_ANON_KEY are present. Provides
 * email/password sign-in & sign-up, bearer-token verification, refresh, and a
 * server-initiated Google OAuth (PKCE) start/exchange pair. When the env vars
 * are absent, `enabled()` is false and server.js falls back to the legacy
 * password gate.
 */

let singleton = null;
let disabled = false;

function config() {
  return {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  };
}

function enabled() {
  const { url, anonKey } = config();
  return Boolean(url && anonKey) && !disabled;
}

function googleEnabled() {
  if (!enabled()) return false;
  // Default on when Supabase auth is configured (Option A reuses a project with
  // Google already wired). Explicitly disable with LEGEND_GOOGLE_OAUTH=0.
  return process.env.LEGEND_GOOGLE_OAUTH !== "0";
}

function createClient(extraAuth = {}) {
  const { url, anonKey } = config();
  const { createClient: create } = require("@supabase/supabase-js");
  return create(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      ...extraAuth
    }
  });
}

/** Shared client for stateless calls (sign-in, sign-up, getUser, refresh). */
function client() {
  if (!enabled()) return null;
  if (singleton) return singleton;
  try {
    singleton = createClient();
    return singleton;
  } catch {
    disabled = true;
    return null;
  }
}

/** In-memory Web Storage shim backed by a plain object (for PKCE verifier). */
function memStorage(obj) {
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : null;
    },
    setItem(key, value) {
      obj[key] = value;
    },
    removeItem(key) {
      delete obj[key];
    }
  };
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || null,
    name: user.email || user.user_metadata?.full_name || user.id,
    authMode: "supabase"
  };
}

async function signInWithPassword({ email, password }) {
  const c = client();
  if (!c) throw new Error("supabase_auth_disabled");
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { session: data.session, user: normalizeUser(data.user) };
}

async function signUp({ email, password, redirectTo }) {
  const c = client();
  if (!c) throw new Error("supabase_auth_disabled");
  const { data, error } = await c.auth.signUp({
    email,
    password,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined
  });
  if (error) throw error;
  return { session: data.session, user: normalizeUser(data.user) };
}

async function getUserFromToken(accessToken) {
  const c = client();
  if (!c || !accessToken) return null;
  try {
    const { data, error } = await c.auth.getUser(accessToken);
    if (error) return null;
    return normalizeUser(data.user);
  } catch {
    return null;
  }
}

async function refresh(refreshToken) {
  const c = client();
  if (!c || !refreshToken) return null;
  try {
    const { data, error } = await c.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) return null;
    return { session: data.session, user: normalizeUser(data.user) };
  } catch {
    return null;
  }
}

/** Begin Google OAuth. Returns the authorize URL and a PKCE bundle to persist. */
async function oauthStart({ redirectTo }) {
  if (!enabled()) throw new Error("supabase_auth_disabled");
  const store = {};
  const c = createClient({ flowType: "pkce", persistSession: true, storage: memStorage(store) });
  const { data, error } = await c.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true }
  });
  if (error) throw error;
  return { url: data.url, bundle: JSON.stringify(store) };
}

/** Complete Google OAuth by exchanging the code (needs the PKCE bundle back). */
async function exchangeCode({ code, bundle }) {
  if (!enabled()) throw new Error("supabase_auth_disabled");
  const store = bundle ? JSON.parse(bundle) : {};
  const c = createClient({ flowType: "pkce", persistSession: true, storage: memStorage(store) });
  const { data, error } = await c.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return { session: data.session, user: normalizeUser(data.user) };
}

module.exports = {
  enabled,
  googleEnabled,
  signInWithPassword,
  signUp,
  getUserFromToken,
  refresh,
  oauthStart,
  exchangeCode
};
