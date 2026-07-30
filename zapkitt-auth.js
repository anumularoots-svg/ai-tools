/*!
 * ZapKitt — accounts. Supabase Auth + data access, no SDK, no build step.
 * <script src="/zapkitt-auth.js"></script>
 *
 * The browser talks to Supabase directly with the user's own JWT. Row Level
 * Security in db/accounts-schema.sql is the access control, so there is no
 * ZapKitt API route in the middle and no serverless function is spent on it.
 *
 * The anon key below is meant to be public -- that is what an anon key is. It
 * grants nothing on its own: every table denies by default and the policies
 * only ever match auth.uid(). Never put a service_role key here.
 *
 * CONFIGURE: create a Supabase project, enable Email and Google under
 * Authentication > Providers, run db/accounts-schema.sql, then paste the
 * project URL and anon key below. Until they are set, ZK.auth.ready() is false
 * and every page degrades to its signed-out state rather than erroring.
 */
(function () {
  "use strict";
  if (window.ZK && window.ZK.auth) return;

  var SUPABASE_URL = '';
  var SUPABASE_ANON_KEY = '';

  var STORE = 'zk_session';
  var session = null;

  function ready() { return !!(SUPABASE_URL && SUPABASE_ANON_KEY); }

  // ── Session ───────────────────────────────────────────────────────────────
  function load() {
    try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); }
    catch (e) { session = null; }
    if (session && session.expires_at && session.expires_at * 1000 < Date.now()) session = null;
    return session;
  }
  function save(s) {
    session = s;
    try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); }
    catch (e) { /* private mode — session lasts the tab */ }
  }

  // Google and magic-link sign-ins come back with the tokens in the URL hash.
  // Capture them, then strip the hash so the tokens do not sit in the address
  // bar, in history, or in a link the user might paste to someone.
  function captureFromHash() {
    if (!location.hash || location.hash.indexOf('access_token=') < 0) return false;
    var p = new URLSearchParams(location.hash.slice(1));
    var token = p.get('access_token');
    if (!token) return false;
    save({
      access_token: token,
      refresh_token: p.get('refresh_token') || '',
      expires_at: Number(p.get('expires_at')) || (Math.floor(Date.now() / 1000) + 3600)
    });
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  function user() {
    if (!session || !session.access_token) return null;
    try {
      // Read the JWT payload for id/email. Not a security check -- the server
      // verifies the signature on every request. This is only for display.
      var part = session.access_token.split('.')[1];
      var json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
      var claims = JSON.parse(decodeURIComponent(escape(json)));
      return { id: claims.sub, email: claims.email, name: (claims.user_metadata || {}).full_name || '' };
    } catch (e) { return null; }
  }

  // ── REST ──────────────────────────────────────────────────────────────────
  function req(path, opts) {
    opts = opts || {};
    var headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + ((session && session.access_token) || SUPABASE_ANON_KEY),
      'Content-Type': 'application/json'
    };
    for (var k in (opts.headers || {})) headers[k] = opts.headers[k];
    return fetch(SUPABASE_URL + path, { method: opts.method || 'GET', headers: headers, body: opts.body })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) { save(null); throw new Error('Your session expired. Please sign in again.'); }
        return r.text().then(function (t) {
          var d = null;
          try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
          if (!r.ok) throw new Error((d && (d.message || d.error_description || d.error)) || ('Request failed (' + r.status + ')'));
          return d;
        });
      });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  var auth = {
    ready: ready,
    user: function () { return user(); },
    signedIn: function () { return !!user(); },

    // Passwordless email. Supabase mails a link back to `redirect`.
    signInWithEmail: function (email, redirect) {
      if (!ready()) return Promise.reject(new Error('Accounts are not configured yet.'));
      return req('/auth/v1/otp', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          create_user: true,
          options: { email_redirect_to: redirect || (location.origin + '/account') }
        })
      });
    },

    signInWithGoogle: function (redirect) {
      if (!ready()) return;
      location.href = SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' +
        encodeURIComponent(redirect || (location.origin + '/account'));
    },

    signOut: function () {
      var had = session;
      save(null);
      if (had && ready()) req('/auth/v1/logout', { method: 'POST' }).catch(function () {});
      return Promise.resolve();
    },

    // ── Profile ──
    getProfile: function () {
      var u = user(); if (!u) return Promise.resolve(null);
      return req('/rest/v1/profiles?select=*&id=eq.' + u.id + '&limit=1')
        .then(function (rows) { return (rows && rows[0]) || null; });
    },
    saveProfile: function (fields) {
      var u = user(); if (!u) return Promise.reject(new Error('Not signed in.'));
      return req('/rest/v1/profiles?id=eq.' + u.id, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(fields)
      }).then(function (rows) { return (rows && rows[0]) || null; });
    },

    // ── Usage ──
    // Fire-and-forget: a tool must never fail because logging failed.
    record: function (tool) {
      var u = user(); if (!u || !ready()) return Promise.resolve();
      return req('/rest/v1/usage_events', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: u.id, tool: tool })
      }).catch(function () {});
    },
    usageToday: function () {
      if (!user()) return Promise.resolve({});
      return req('/rest/v1/rpc/usage_today', { method: 'POST', body: '{}' })
        .then(function (rows) {
          var out = {};
          (rows || []).forEach(function (r) { out[r.tool] = Number(r.uses) || 0; });
          return out;
        }).catch(function () { return {}; });
    },
    usageHistory: function (limit) {
      var u = user(); if (!u) return Promise.resolve([]);
      return req('/rest/v1/usage_events?select=tool,created_at&order=created_at.desc&limit=' + (limit || 30));
    },

    // ── Saved resumes ──
    listResumes: function () {
      var u = user(); if (!u) return Promise.resolve([]);
      return req('/rest/v1/saved_resumes?select=id,title,updated_at&order=updated_at.desc');
    },
    saveResume: function (title, content) {
      var u = user(); if (!u) return Promise.reject(new Error('Not signed in.'));
      return req('/rest/v1/saved_resumes', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: u.id, title: title, content: content })
      }).then(function (rows) { return (rows && rows[0]) || null; });
    },
    getResume: function (id) {
      return req('/rest/v1/saved_resumes?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1')
        .then(function (rows) { return (rows && rows[0]) || null; });
    },
    deleteResume: function (id) {
      return req('/rest/v1/saved_resumes?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    }
  };

  // ── OPT clock ─────────────────────────────────────────────────────────────
  // 90 cumulative days of unemployment on OPT and status is lost. Computed
  // here so the dashboard and any future reminder read the same number.
  // Counts from opt_start_date while `employed` is false -- it is a simple
  // model, not a legal one, and the UI says so.
  auth.optClock = function (profile) {
    if (!profile || !profile.opt_start_date || profile.employed) return null;
    var start = new Date(profile.opt_start_date + 'T00:00:00Z');
    if (isNaN(start.getTime())) return null;
    var days = Math.floor((Date.now() - start.getTime()) / 86400000);
    if (days < 0) return { used: 0, left: 90, started: false };
    return { used: Math.min(days, 90), left: Math.max(0, 90 - days), started: true };
  };

  load();
  captureFromHash();

  window.ZK = window.ZK || {};
  window.ZK.auth = auth;
  window.dispatchEvent(new Event('zk-auth-ready'));
})();
