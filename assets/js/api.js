/*
 * Account API client.
 *
 * Three modes, chosen automatically:
 *   live     MCA_CONFIG.apiBase is set: every call goes to your server
 *            (session = HttpOnly cookie on .mycraftingai.com, never readable here).
 *   preview  apiBase is empty AND the page runs on your own computer
 *            (file://, localhost): a local in-browser stand-in so every flow can
 *            be clicked through. Nothing leaves the browser. Clearly labelled.
 *   offline  apiBase is empty on the public site: calls fail with "not_live" and
 *            the pages say accounts are opening soon. No fake success, ever.
 *
 * The server contract is documented in docs/SERVER_API.md.
 */
(function () {
  "use strict";

  var cfg = window.MCA_CONFIG || {};
  var base = String(cfg.apiBase || "").replace(/\/+$/, "");
  var local = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var mode = base ? "live" : (local ? "preview" : "offline");

  function ApiError(code, message, status) {
    this.code = code || "error";
    this.message = message || "Something went wrong. Please try again.";
    this.status = status || 0;
  }
  ApiError.prototype = Object.create(Error.prototype);

  var MESSAGES = {
    not_live: "Accounts open very soon. We are finishing the sign-in server.",
    network: "Can't reach MyCraftingAI right now. Check your connection and try again.",
    invalid_credentials: "That email/username and password don't match.",
    email_taken: "An account with this email already exists. Try signing in.",
    email_not_verified: "Verify your email first. We sent you a 6-digit code.",
    invalid_code: "That code is wrong or has expired.",
    weak_password: "Use at least 8 characters with a letter and a number.",
    rate_limited: "Too many attempts. Wait a minute and try again.",
    unauthorized: "Please sign in again.",
    invalid_state: "This sign-in link is not valid any more. Start again from the app.",
    two_factor_required: "Enter the 6-digit code we emailed you.",
    challenge_expired: "This sign-in has expired. Please sign in again.",
    too_many_codes: "Too many codes requested. Please sign in again."
  };

  function fail(code, status, message) {
    return Promise.reject(new ApiError(code, message || MESSAGES[code], status));
  }

  /* ------------------------------------------------------------- live */
  function live(method, path, body) {
    var options = {
      method: method,
      credentials: "include",
      headers: { "Accept": "application/json" }
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    return fetch(base + path, options).then(function (response) {
      if (response.status === 204) return {};
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.ok) return data;
        var err = (data && data.error) || {};
        var failure = new ApiError(err.code || "error", err.message || MESSAGES[err.code], response.status);
        failure.data = err;  // extra fields, e.g. the email a verification code went to
        throw failure;
      });
    }, function () {
      throw new ApiError("network", MESSAGES.network, 0);
    });
  }

  /* ---------------------------------------------------------- preview */
  var store = {
    get: function (key, fallback) {
      try { var raw = localStorage.getItem("mca_preview_" + key); return raw ? JSON.parse(raw) : fallback; }
      catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem("mca_preview_" + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    }
  };

  function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve("plain:" + text);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }

  function sixDigits() { return String(Math.floor(100000 + Math.random() * 900000)); }
  function delay(value) { return new Promise(function (resolve) { setTimeout(function () { resolve(value); }, 450); }); }
  function today() { return new Date().toISOString().slice(0, 10); }

  function publicUser(user) {
    var plans = (window.MCA_PLANS && window.MCA_PLANS.plans) || [];
    var plan = plans.filter(function (p) { return p.id === user.plan; })[0] || plans[0] || { id: "free", name: "Free", dailyTokens: 10000 };
    var usage = user.usage && user.usage.day === today() ? user.usage.used : 0;
    var reset = new Date(); reset.setUTCHours(24, 0, 0, 0);
    var sub = user.subscription || null;
    return {
      user: { email: user.email, name: user.name, provider: user.provider || "password", created: user.created },
      plan: { id: plan.id, name: plan.name, dailyTokens: plan.dailyTokens },
      usage: { usedToday: usage, dailyLimit: plan.dailyTokens, resetsAt: reset.toISOString() },
      settings: previewSettings(user),
      subscription: sub ? previewSub(sub) : null
    };
  }

  function previewSettings(user) {
    var s = user.settings || {};
    return {
      email_notifications_enabled: s.email_notifications_enabled !== false,
      security_alerts_enabled: s.security_alerts_enabled !== false,
      billing_emails_enabled: s.billing_emails_enabled !== false,
      two_factor_enabled: false
    };
  }

  function previewSub(sub) {
    var active = sub.status === "active";
    return {
      plan: sub.plan, planName: sub.planName || sub.plan, status: sub.status,
      renewsAt: active ? sub.renewsAt : null, endsAt: sub.endsAt || null,
      cancelled: sub.status === "cancelled", canCancel: active, canResume: sub.status === "cancelled",
      portalUrl: ""
    };
  }

  function preview(method, path, body) {
    var users = store.get("users", {});
    var session = store.get("session", null);
    body = body || {};
    var email = String(body.email || "").trim().toLowerCase();

    switch (method + " " + path) {
      case "POST /v1/auth/signup":
        if (users[email]) return delay().then(function () { return fail("email_taken", 409); });
        return sha256(body.password).then(function (hash) {
          var code = sixDigits();
          users[email] = { email: email, name: body.name || email.split("@")[0], hash: hash, verified: false, code: code, plan: body.plan === "free" ? "free" : "free", created: new Date().toISOString() };
          store.set("users", users);
          return delay({ status: "verify_email", previewCode: code });
        });
      case "POST /v1/auth/resend":
        if (!users[email]) return delay({ status: "sent" });
        users[email].code = sixDigits(); store.set("users", users);
        return delay({ status: "sent", previewCode: users[email].code });
      case "POST /v1/auth/verify":
        if (!users[email] || users[email].code !== String(body.code)) return delay().then(function () { return fail("invalid_code", 400); });
        users[email].verified = true; users[email].code = null; store.set("users", users);
        store.set("session", { email: email });
        return delay(publicUser(users[email]));
      case "POST /v1/auth/login":
        return sha256(body.password).then(function (hash) {
          var user = users[email];
          if (!user || user.hash !== hash) return delay().then(function () { return fail("invalid_credentials", 401); });
          if (!user.verified) {
            user.code = sixDigits(); store.set("users", users);
            return delay().then(function () { return fail("email_not_verified", 403, MESSAGES.email_not_verified + " (Preview code: " + user.code + ")"); });
          }
          store.set("session", { email: email });
          return delay(publicUser(user));
        });
      case "POST /v1/auth/logout":
        store.set("session", null);
        return delay({});
      case "POST /v1/auth/forgot":
        if (users[email]) { users[email].reset = sixDigits(); store.set("users", users); return delay({ status: "sent", previewCode: users[email].reset }); }
        return delay({ status: "sent" });
      case "POST /v1/auth/reset":
        if (!users[email] || users[email].reset !== String(body.code)) return delay().then(function () { return fail("invalid_code", 400); });
        return sha256(body.password).then(function (hash) {
          users[email].hash = hash; users[email].reset = null; users[email].verified = true;
          store.set("users", users);
          return delay({});
        });
      case "GET /v1/me":
        if (!session || !users[session.email]) return delay().then(function () { return fail("unauthorized", 401); });
        return delay(publicUser(users[session.email]));
      case "GET /v1/users/settings":
      case "PATCH /v1/users/settings":
        if (!session || !users[session.email]) return delay().then(function () { return fail("unauthorized", 401); });
        var me = users[session.email];
        if (method === "PATCH") {
          me.settings = me.settings || {};
          Object.keys(body).forEach(function (k) { me.settings[k] = !!body[k]; });
          store.set("users", users);
        }
        return delay(previewSettings(me));
      case "POST /v1/billing/cancel":
      case "POST /v1/billing/resume":
        if (!session || !users[session.email]) return delay().then(function () { return fail("unauthorized", 401); });
        var owner = users[session.email], s = owner.subscription;
        var cancelling = path.slice(-6) === "cancel";
        if (!s || (cancelling ? s.status !== "active" : s.status !== "cancelled")) {
          return delay().then(function () { return fail("no_subscription", 400, cancelling ? "There's no active subscription to cancel on this account." : "There's no cancelled subscription to resume."); });
        }
        if (cancelling) { s.status = "cancelled"; s.endsAt = s.renewsAt; } else { s.status = "active"; s.endsAt = null; }
        store.set("users", users);
        return delay({ subscription: previewSub(s) });
      case "DELETE /v1/users/me":
        if (!session || !users[session.email]) return delay().then(function () { return fail("unauthorized", 401); });
        if (body.confirm !== "DELETE") return delay().then(function () { return fail("confirm_required", 400, "Type DELETE to confirm."); });
        delete users[session.email]; store.set("users", users); store.set("session", null);
        return delay({});
      case "POST /v1/desktop/code":
        if (!session) return delay().then(function () { return fail("unauthorized", 401); });
        return delay({ code: sixDigits() + sixDigits(), expiresIn: 120 });
      case "POST /v1/rewards/watch/info":
      case "POST /v1/rewards/watch/start":
      case "POST /v1/rewards/watch/beat":
      case "POST /v1/rewards/watch/complete":
        // Local stand-in for the unlock page, same rules as the server: only time
        // between close heartbeats (a visible page) counts; 6 s minimum here.
        var tickets = store.get("reward_tickets", {});
        var t = tickets[body.ticket] || { kind: /tex/i.test(body.ticket || "") ? "textures" : "build", status: "pending", began: 0, h: 0, w: 0 };
        var minSeconds = 6, now = Date.now(), action = path.split("/").pop();
        if (action === "start") { if (!t.began) { t.began = now; t.status = "watching"; } t.h = now; }
        if ((action === "beat" || action === "complete") && !t.began && t.status !== "granted") {
          return delay().then(function () { return fail("not_started", 409, "Start the ad first."); });
        }
        if (action === "beat" && t.status !== "granted") {
          var gap = (now - (t.h || now)) / 1000;
          if (gap > 0 && gap <= 4) t.w = (t.w || 0) + gap;
          t.h = now;
        }
        if (action === "complete" && t.status !== "granted") {
          if ((t.w || 0) < minSeconds) {
            var wait = Math.ceil(minSeconds - (t.w || 0));
            tickets[body.ticket] = t; store.set("reward_tickets", tickets);
            return delay().then(function () {
              var e = new ApiError("too_early", "The ad hasn't finished yet.", 409);
              e.data = { retryAfter: wait };
              throw e;
            });
          }
          t.status = "granted";
        }
        tickets[body.ticket] = t; store.set("reward_tickets", tickets);
        return delay({
          kind: t.kind,
          title: t.kind === "build" ? "Unlock one Build & Run" : "Unlock Texture Studio",
          reward: t.kind === "build" ? "1 Build & Run" : "5 minutes of Texture Studio",
          status: t.status, minSeconds: minSeconds, watchedSeconds: Math.floor(t.w || 0),
          secondsLeft: Math.max(0, Math.ceil(minSeconds - (t.w || 0))), beatSeconds: 2
        });
      case "POST /v1/preview/google":
        var gmail = "preview.user@gmail.com";
        users[gmail] = users[gmail] || { email: gmail, name: "Preview User", hash: "-", verified: true, plan: "free", provider: "google", created: new Date().toISOString() };
        store.set("users", users); store.set("session", { email: gmail });
        return delay(publicUser(users[gmail]));
    }
    return fail("error", 404, "Unknown preview route " + path);
  }

  function request(method, path, body) {
    if (mode === "live") return live(method, path, body);
    if (mode === "preview") return preview(method, path, body);
    return fail("not_live", 503);
  }

  /** Only same-site relative paths are allowed as a post-login destination. */
  function safeNext(value) {
    var next = String(value || "");
    if (!next || /^[a-z][a-z0-9+.-]*:/i.test(next) || next.indexOf("//") === 0 || next.indexOf("\\") !== -1) return "account.html";
    return next;
  }

  window.MCA = window.MCA || {};
  window.MCA.api = {
    mode: mode,
    messages: MESSAGES,
    ApiError: ApiError,
    safeNext: safeNext,
    signup: function (d) { return request("POST", "/v1/auth/signup", d); },
    resend: function (d) { return request("POST", "/v1/auth/resend", d); },
    verify: function (d) { return request("POST", "/v1/auth/verify", d); },
    login: function (d) { return request("POST", "/v1/auth/login", d); },
    logout: function () { return request("POST", "/v1/auth/logout", {}); },
    forgot: function (d) { return request("POST", "/v1/auth/forgot", d); },
    reset: function (d) { return request("POST", "/v1/auth/reset", d); },
    me: function () { return request("GET", "/v1/me"); },
    desktopCode: function (d) { return request("POST", "/v1/desktop/code", d); },
    /** Permanently delete the signed-in account (server wants "DELETE" + password). */
    deleteAccount: function (confirm, password) { return request("DELETE", "/v1/users/me", { confirm: confirm, password: password || "" }); },
    /** Email preferences (codes and critical notices can't be switched off). */
    settings: {
      get: function () { return request("GET", "/v1/users/settings"); },
      update: function (changes) { return request("PATCH", "/v1/users/settings", changes); }
    },
    /** Subscription: cancel at the end of the paid period, or resume before it ends. */
    billing: {
      get: function () { return request("GET", "/v1/billing"); },
      cancel: function () { return request("POST", "/v1/billing/cancel", {}); },
      resume: function () { return request("POST", "/v1/billing/resume", {}); }
    },
    /** Free plan ad unlocks: the unlock page holds a single-use ticket, no session. */
    rewards: {
      info: function (ticket) { return request("POST", "/v1/rewards/watch/info", { ticket: ticket }); },
      start: function (ticket) { return request("POST", "/v1/rewards/watch/start", { ticket: ticket }); },
      beat: function (ticket) { return request("POST", "/v1/rewards/watch/beat", { ticket: ticket }); },
      complete: function (ticket, source) { return request("POST", "/v1/rewards/watch/complete", { ticket: ticket, source: source || "" }); }
    },
    /** Anonymous page counter (download page, unlock page). Never blocks, never fails. */
    track: function (name) {
      if (mode !== "live") return;
      try {
        fetch(base + "/v1/metrics/event", {
          method: "POST", credentials: "omit", keepalive: true,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name })
        }).catch(function () { /* ignore */ });
      } catch (e) { /* old browser */ }
    },
    /** Theme, promotion and banner from the admin panel's Live settings. */
    site: function () {
      if (mode !== "live") return Promise.resolve({ theme: "classic", effects: true, promotion: null, announcement: null });
      return live("GET", "/v1/public/site");
    },
    /** The banner an admin set for the website ({announcement: null} when none). */
    announcement: function () {
      if (mode !== "live") return Promise.resolve({ announcement: null });
      return live("GET", "/v1/public/announcement");
    },
    /** 2-step verification: finish a sign-in, resend its code, switch it on/off. */
    twoFactor: {
      verify: function (d) { return request("POST", "/v1/auth/2fa/verify", d); },
      resend: function (d) { return request("POST", "/v1/auth/2fa/resend", d); },
      requestCode: function (enabled) { return request("POST", "/v1/users/2fa/code", { enabled: !!enabled }); },
      set: function (enabled, code) { return request("POST", "/v1/users/2fa", { enabled: !!enabled, code: code }); }
    },
    /** Admin panel (server returns 404 for non-admins). Live mode only. */
    admin: (function () {
      function u(id) { return "/v1/admin/users/" + encodeURIComponent(id); }
      function qs(q) {
        q = q || {};
        return "?query=" + encodeURIComponent(q.query || "") + "&page=" + (q.page || 1) +
          (q.plan ? "&plan=" + encodeURIComponent(q.plan) : "") +
          (q.status ? "&status=" + encodeURIComponent(q.status) : "") +
          (q.sort ? "&sort=" + encodeURIComponent(q.sort) : "");
      }
      return {
        overview: function () { return request("GET", "/v1/admin/overview"); },
        stats: function (days) { return request("GET", "/v1/admin/stats?days=" + (days || 30)); },
        events: function (page, action) { return request("GET", "/v1/admin/events?page=" + (page || 1) + (action ? "&action=" + encodeURIComponent(action) : "")); },
        system: function () { return request("GET", "/v1/admin/system"); },
        checkEmail: function () { return request("POST", "/v1/admin/system/check-email", {}); },
        keyStatus: function (id, active) { return request("POST", "/v1/admin/keys/" + encodeURIComponent(id), { active: !!active }); },
        users: function (q) { return request("GET", "/v1/admin/users" + qs(q)); },
        /** CSV of the current filter, downloaded with the session cookie. */
        exportCsv: function (q) {
          if (mode !== "live") return fail("not_live", 503);
          return fetch(base + "/v1/admin/users.csv" + qs(q), { credentials: "include" }).then(function (r) {
            if (!r.ok) throw new ApiError("error", "Export failed (" + r.status + ").", r.status);
            return r.blob();
          });
        },
        bulk: function (ids, action, value) { return request("POST", "/v1/admin/users/bulk", { ids: ids, action: action, value: value || null }); },
        user: function (id) { return request("GET", u(id)); },
        update: function (id, changes) { return request("PATCH", u(id), changes); },
        bonus: function (id, tokens, notify) { return request("POST", u(id) + "/bonus", { tokens: tokens, notify: !!notify }); },
        /** Take back today's bonus tokens (tokens = null: all of it). */
        removeBonus: function (id, tokens, notify) { return request("POST", u(id) + "/bonus/remove", { tokens: tokens, notify: !!notify }); },
        emailUser: function (id, d) { return request("POST", u(id) + "/email", d); },
        action: function (id, name) { return request("POST", u(id) + "/" + name, {}); },
        revokeSessions: function (id) { return request("POST", u(id) + "/revoke-sessions", {}); },
        endSession: function (id, sid) { return request("DELETE", u(id) + "/sessions/" + encodeURIComponent(sid)); },
        remove: function (id) { return request("DELETE", u(id)); },
        email: function (d) { return request("POST", "/v1/admin/email", d); },
        broadcast: function (d) { return request("POST", "/v1/admin/broadcast", d); },
        insights: function (days) { return request("GET", "/v1/admin/insights?days=" + (days || 30)); },
        githubRefresh: function () { return request("POST", "/v1/admin/insights/github-refresh", {}); },
        rewards: function (days) { return request("GET", "/v1/admin/rewards?days=" + (days || 30)); },
        revenue: function () { return request("GET", "/v1/admin/revenue"); },
        health: function () { return request("GET", "/v1/admin/health"); },
        config: function () { return request("GET", "/v1/admin/config"); },
        setConfig: function (changes) { return request("PATCH", "/v1/admin/config", { changes: changes }); },
        resetConfig: function (name) { return request("DELETE", "/v1/admin/config/" + encodeURIComponent(name)); },
        userRewards: function (id, d) { return request("POST", u(id) + "/rewards", d); },
        /** Daily metrics as CSV, downloaded with the session cookie. */
        exportMetrics: function (days) {
          if (mode !== "live") return fail("not_live", 503);
          return fetch(base + "/v1/admin/metrics.csv?days=" + (days || 90), { credentials: "include" }).then(function (r) {
            if (!r.ok) throw new ApiError("error", "Export failed (" + r.status + ").", r.status);
            return r.blob();
          });
        }
      };
    })(),
    /** Which sign-in methods the server has switched on, e.g. {google: true}. */
    providers: function () {
      if (mode === "live") return live("GET", "/v1/auth/providers");
      return Promise.resolve({ google: mode === "preview" });
    },
    /** Where the "Continue with Google" button goes. */
    google: function (next) {
      if (mode === "live") {
        var back = new URL(safeNext(next), location.href).href;
        location.href = base + "/v1/auth/google/start?return_to=" + encodeURIComponent(back);
        return Promise.resolve();
      }
      if (mode === "preview") {
        return request("POST", "/v1/preview/google", {}).then(function () { location.href = safeNext(next); });
      }
      return fail("not_live", 503);
    }
  };
})();
