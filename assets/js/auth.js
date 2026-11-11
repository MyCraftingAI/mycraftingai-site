/* Account pages: sign in, sign up + email code, forgot password, account, desktop hand-off. */
(function () {
  "use strict";

  var api = window.MCA.api;
  var cfg = window.MCA_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var next = api.safeNext(params.get("next"));
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------------------------------------------------------- helpers */
  function notice(root, kind, text) {
    var el = $("[data-notice]", root);
    if (!el) return;
    el.className = "notice " + kind + (text ? " show" : "");
    el.textContent = text || "";
  }

  function busy(button, on, label) {
    if (!button) return;
    if (on) {
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + (label || "Please wait");
    } else {
      button.disabled = false;
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
  }

  function fieldError(name, text) {
    var err = $('[data-err="' + name + '"]');
    var input = document.getElementById(name);
    if (err) { err.textContent = text || ""; err.classList.toggle("show", !!text); }
    if (input) input.setAttribute("aria-invalid", text ? "true" : "false");
    return !text;
  }

  function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value); }

  function passwordScore(pw) {
    var score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score++;
    if (pw.length >= 12) score++;
    if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
    return score;
  }
  function passwordOk(pw) { return pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw); }

  function wirePasswordMeter(input) {
    var meter = input && input.closest(".field") && $(".pw-meter", input.closest(".field"));
    if (!meter) return;
    var colours = ["#22222b", "#f2555a", "#f5b74a", "#8aa0ff", "#3dd68c"];
    input.addEventListener("input", function () {
      var score = input.value ? Math.max(1, passwordScore(input.value)) : 0;
      $$("i", meter).forEach(function (bar, i) { bar.style.background = i < score ? colours[score] : colours[0]; });
    });
  }

  function wireRevealButtons() {
    $$(".reveal-pw").forEach(function (button) {
      button.addEventListener("click", function () {
        var input = button.parentElement.querySelector("input");
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "hide" : "show";
        button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });
    });
  }

  /** Six single-digit boxes: auto-advance, backspace, paste a whole code. */
  function wireCode(root) {
    var boxes = $$("[data-code] input", root);
    boxes.forEach(function (box, i) {
      box.addEventListener("input", function () {
        box.value = box.value.replace(/\D/g, "").slice(-1);
        if (box.value && boxes[i + 1]) boxes[i + 1].focus();
      });
      box.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !box.value && boxes[i - 1]) boxes[i - 1].focus();
      });
      box.addEventListener("paste", function (e) {
        var digits = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
        if (!digits) return;
        e.preventDefault();
        boxes.forEach(function (b, j) { b.value = digits[j] || ""; });
        (boxes[Math.min(digits.length, 5)] || box).focus();
      });
    });
    return function () { return boxes.map(function (b) { return b.value; }).join(""); };
  }

  function authSide() {
    var side = $("[data-auth-side]");
    if (!side) return;
    side.innerHTML =
      '<a class="brand" href="index.html" style="position:relative;z-index:1">' +
      '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#4F63F5"/><g fill="#fff"><rect x="14" y="6" width="4" height="4"/><rect x="14" y="10" width="4" height="4"/><rect x="6" y="14" width="4" height="4"/><rect x="10" y="14" width="4" height="4"/><rect x="18" y="14" width="4" height="4"/><rect x="22" y="14" width="4" height="4"/><rect x="14" y="18" width="4" height="4"/><rect x="14" y="22" width="4" height="4"/></g><rect x="14" y="14" width="4" height="4" fill="#fff" opacity=".5"/></svg>' +
      "MyCraftingAI</a>" +
      "<blockquote><p>Your mods live in normal folders on your PC. The account only keeps your plan and today's tokens.</p>" +
      '<div class="quote-meta">Free: 10K new tokens a day &middot; cached context doesn\'t count &middot; refills 00:00 UTC</div></blockquote>';
  }

  /** On the public site with no server yet: say so and switch the form off. */
  function guardOffline(root) {
    if (api.mode !== "offline") return false;
    notice(root, "info", api.messages.not_live + " Follow along on the home page - this form switches on the day we open.");
    $$("button, input", root).forEach(function (el) { el.disabled = true; });
    return true;
  }

  function wireGoogle(root, failureRoot) {
    $$("[data-google]", root).forEach(function (button) {
      if (cfg.googleSignIn === false) { button.hidden = true; var d = $(".divider", root); if (d) d.hidden = true; return; }
      button.addEventListener("click", function () {
        busy(button, true, "Opening Google");
        api.google(next).catch(function (err) {
          busy(button, false);
          notice(failureRoot || root, "error", err.message);
        });
      });
    });
  }

  function keepNextLinks() {
    if (!params.get("next")) return;
    $$("[data-keep-next]").forEach(function (a) {
      var url = new URL(a.getAttribute("href"), location.href);
      url.searchParams.set("next", params.get("next"));
      a.setAttribute("href", url.pathname.split("/").pop() + url.search);
    });
  }

  function goNext() { location.href = next; }

  /* ------------------------------------------------------------ pages */
  function loginPage() {
    var form = $("#login-form");
    if (/desktop\.html/.test(next)) $("[data-desktop-hint]").textContent = "Sign in to connect the MyCraftingAI app.";
    if (guardOffline(form)) return;
    wireGoogle(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("#email").value.trim(), password = $("#password").value;
      var ok = fieldError("email", validEmail(email) ? "" : "Enter a valid email address.");
      ok = fieldError("password", password ? "" : "Enter your password.") && ok;
      if (!ok) return;
      var submit = $('button[type="submit"]', form);
      busy(submit, true, "Signing in");
      notice(form, "", "");
      api.login({ email: email, password: password }).then(goNext, function (err) {
        busy(submit, false);
        if (err.code === "email_not_verified") {
          location.href = "signup.html?verify=" + encodeURIComponent(email) + (params.get("next") ? "&next=" + encodeURIComponent(params.get("next")) : "");
          return;
        }
        notice(form, "error", err.message);
      });
    });
  }

  function signupPage() {
    var details = $('[data-step="details"]'), verify = $('[data-step="verify"]');
    var form = $("#signup-form"), verifyForm = $("#verify-form");
    var readCode = wireCode(verifyForm);
    var email = "";
    var plan = params.get("plan");
    var planInfo = ((window.MCA_PLANS || {}).plans || []).filter(function (p) { return p.id === plan; })[0];
    if (planInfo && planInfo.price) {
      $("[data-plan-hint]").textContent = "You picked " + planInfo.name + ". Your account starts on Free - upgrade from your account page as soon as checkout opens.";
    }
    wirePasswordMeter($("#password"));

    function showVerify(address, previewCode) {
      email = address;
      details.hidden = true;
      verify.hidden = false;
      $("[data-email-echo]").textContent = address;
      if (previewCode) notice(verifyForm, "warn", "Preview mode - no email is sent. Your code is " + previewCode + ".");
      var first = $("[data-code] input", verifyForm);
      if (first) first.focus();
    }

    if (params.get("verify")) {
      api.resend({ email: params.get("verify") }).then(function (r) { showVerify(params.get("verify"), r.previewCode); },
        function () { showVerify(params.get("verify")); });
    }

    if (guardOffline(form)) return;
    wireGoogle(form);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("#name").value.trim(), address = $("#email").value.trim(), password = $("#password").value;
      var ok = fieldError("name", /^[A-Za-z0-9_.-]{3,32}$/.test(name) ? "" : "3-32 letters, numbers, dots, dashes or underscores.");
      ok = fieldError("email", validEmail(address) ? "" : "Enter a valid email address.") && ok;
      ok = fieldError("password", passwordOk(password) ? "" : api.messages.weak_password) && ok;
      ok = fieldError("terms", $("#terms").checked ? "" : "Please accept the Terms to continue.") && ok;
      if (!ok) return;
      var submit = $('button[type="submit"]', form);
      busy(submit, true, "Creating account");
      notice(form, "", "");
      api.signup({ name: name, email: address, password: password, plan: plan || "free" }).then(function (r) {
        busy(submit, false);
        showVerify(address, r.previewCode);
      }, function (err) {
        busy(submit, false);
        notice(form, "error", err.message);
      });
    });

    verifyForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = readCode();
      if (code.length !== 6) { notice(verifyForm, "error", "Enter all 6 digits."); return; }
      var submit = $('button[type="submit"]', verifyForm);
      busy(submit, true, "Checking");
      api.verify({ email: email, code: code }).then(goNext, function (err) {
        busy(submit, false);
        notice(verifyForm, "error", err.message);
      });
    });

    $("[data-resend]", verifyForm).addEventListener("click", function (e) {
      var button = e.currentTarget;
      busy(button, true, "Sending");
      api.resend({ email: email }).then(function (r) {
        busy(button, false);
        notice(verifyForm, r.previewCode ? "warn" : "ok", r.previewCode ? "Preview mode - your new code is " + r.previewCode + "." : "New code sent. Check spam if it isn't there in a minute.");
        button.disabled = true;
        var left = 30;
        var tick = setInterval(function () {
          left -= 1;
          button.textContent = left > 0 ? "Send a new code (" + left + "s)" : "Send a new code";
          if (left <= 0) { clearInterval(tick); button.disabled = false; }
        }, 1000);
      }, function (err) { busy(button, false); notice(verifyForm, "error", err.message); });
    });
  }

  function forgotPage() {
    var request = $('[data-step="request"]'), reset = $('[data-step="reset"]');
    var form = $("#forgot-form"), resetForm = $("#reset-form");
    var readCode = wireCode(resetForm);
    var email = "";
    wirePasswordMeter($("#password"));
    if (guardOffline(form)) return;

    function send(button, then) {
      busy(button, true, "Sending");
      api.forgot({ email: email }).then(function (r) {
        busy(button, false);
        then(r);
      }, function (err) { busy(button, false); notice(form, "error", err.message); });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      email = $("#email").value.trim();
      if (!fieldError("email", validEmail(email) ? "" : "Enter a valid email address.")) return;
      send($('button[type="submit"]', form), function (r) {
        request.hidden = true;
        reset.hidden = false;
        $("[data-email-echo]").textContent = email;
        if (r.previewCode) notice(resetForm, "warn", "Preview mode - your code is " + r.previewCode + ".");
        $("[data-code] input", resetForm).focus();
      });
    });

    resetForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = readCode(), password = $("#password").value;
      if (code.length !== 6) { notice(resetForm, "error", "Enter all 6 digits."); return; }
      if (!fieldError("password", passwordOk(password) ? "" : api.messages.weak_password)) return;
      var submit = $('button[type="submit"]', resetForm);
      busy(submit, true, "Saving");
      api.reset({ email: email, code: code, password: password }).then(function () {
        busy(submit, false);
        $$("input, button", resetForm).forEach(function (el) { el.disabled = true; });
        notice(resetForm, "ok", "Password saved. Taking you to sign in...");
        setTimeout(function () { location.href = "login.html"; }, 1400);
      }, function (err) { busy(submit, false); notice(resetForm, "error", err.message); });
    });

    $("[data-resend]", resetForm).addEventListener("click", function (e) {
      send(e.currentTarget, function (r) {
        notice(resetForm, r.previewCode ? "warn" : "ok", r.previewCode ? "Preview mode - your new code is " + r.previewCode + "." : "New code sent.");
      });
    });
  }

  function accountPage() {
    var root = document.body;
    if (api.mode === "offline") { notice(root, "info", api.messages.not_live); return; }
    var resetsAt = null;
    api.me().then(function (me) {
      var used = me.usage.usedToday || 0, limit = me.usage.dailyLimit;
      $("[data-account]").hidden = false;
      $("[data-greeting]").textContent = "Hi, " + (me.user.name || me.user.email.split("@")[0]);
      $("[data-used]").textContent = used.toLocaleString("en-US");
      $("[data-limit]").textContent = limit ? limit.toLocaleString("en-US") : "custom";
      var share = limit ? Math.min(100, used / limit * 100) : 0;
      $("[data-meter]").style.width = Math.max(1, share) + "%";
      $("[data-meter]").style.background = share >= 100 ? "var(--ruby)" : (share > 80 ? "var(--amber)" : "var(--accent)");
      $("[data-plan-chip]").textContent = me.plan.name;
      $("[data-plan]").textContent = me.plan.name + (limit ? " · " + window.MCA.formatTokens(limit) + " / day" : "");
      $("[data-name]").textContent = me.user.name || "-";
      $("[data-email]").textContent = me.user.email;
      $("[data-provider]").textContent = me.user.provider === "google" ? "Google" : "Email and password";
      if (me.plan.id === "studio" || me.plan.id === "enterprise") $("[data-upgrade]").hidden = true;
      resetsAt = new Date(me.usage.resetsAt);
      tick();
      setInterval(tick, 1000);
    }, function (err) {
      if (err.code === "unauthorized" || err.status === 401) { location.href = "login.html?next=account.html"; return; }
      notice(root, "error", err.message);
    });

    function tick() {
      if (!resetsAt) return;
      var ms = Math.max(0, resetsAt - Date.now());
      var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
      $("[data-reset]").textContent = h + "h " + ("0" + m).slice(-2) + "m " + ("0" + s).slice(-2) + "s";
    }

    $("[data-download]").addEventListener("click", function (e) {
      if (cfg.downloadUrl) { e.currentTarget.href = cfg.downloadUrl; return; }
      e.preventDefault();
      window.MCA.modal("Download coming soon", "The Windows installer is being signed and packaged. It will appear right here - same button, same page.");
    });
    $("[data-signout]").addEventListener("click", function (e) {
      busy(e.currentTarget, true, "Signing out");
      api.logout().then(function () { location.href = "index.html"; }, function () { location.href = "index.html"; });
    });
  }

  function desktopPage() {
    var root = document.body;
    var state = params.get("state") || "";
    var port = Number(params.get("port"));
    var title = $("[data-title]"), sub = $("[data-sub]");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(state) || !(port >= 1024 && port <= 65535 && Math.floor(port) === port)) {
      title.textContent = "Start from the app";
      sub.textContent = "This page connects the MyCraftingAI desktop app to your account.";
      notice(root, "error", "This link is incomplete. In MyCraftingAI, press “Continue with Google” or “Open the website” to get a fresh one.");
      return;
    }
    if (api.mode === "offline") {
      title.textContent = "Almost there";
      sub.textContent = "";
      notice(root, "info", api.messages.not_live);
      return;
    }
    var here = "desktop.html?state=" + encodeURIComponent(state) + "&port=" + port;
    api.me().then(function (me) {
      return api.desktopCode({ state: state }).then(function (r) {
        var code = String(r.code);
        var url = "http://" + (cfg.desktopCallbackHost || "127.0.0.1") + ":" + port + "/callback?code=" +
          encodeURIComponent(code) + "&state=" + encodeURIComponent(state);
        title.textContent = "You're signed in";
        sub.textContent = "as " + me.user.email + ". Go back to MyCraftingAI to finish.";
        $("[data-open]").href = url;
        $("[data-code-text]").textContent = code.replace(/(\d{4})(?=\d)/g, "$1 ");
        $("[data-actions]").hidden = false;
        $("[data-open]").addEventListener("click", function () {
          setTimeout(function () {
            sub.textContent = "Done - you can close this tab and return to the app.";
          }, 900);
        });
      });
    }).catch(function (err) {
      if (err.code === "unauthorized" || err.status === 401) {
        location.href = "login.html?next=" + encodeURIComponent(here);
        return;
      }
      title.textContent = "Couldn't connect the app";
      sub.textContent = "";
      notice(root, "error", err.message);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    authSide();
    wireRevealButtons();
    keepNextLinks();
    var page = document.body.dataset.page;
    ({ login: loginPage, signup: signupPage, forgot: forgotPage, account: accountPage, desktop: desktopPage }[page] || function () {})();
  });
})();
