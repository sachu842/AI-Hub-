(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- API helper ---------- */
  function api(path, method, body) {
    return fetch(path, {
      method: method || "GET",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : (method === "POST" ? "{}" : undefined)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    }).catch(function () {
      return { ok: false, status: 0, data: { error: "Cannot reach the server. Check your connection." } };
    });
  }

  /* ---------- Toast ---------- */
  var tt;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("show"); }, 3600);
  }

  /* ---------- Particle network background ---------- */
  var cv = $("bg"), ctx = cv.getContext("2d"), W = 0, H = 0, pts = [], mouse = { x: -999, y: -999 };
  var colors = ["#22e6c8", "#3d8bff", "#ff4fa3", "#ffb347"];
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.max(30, Math.min(90, Math.round(W * H / 16000)));
    pts = [];
    for (var i = 0; i < n; i++) {
      pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: Math.random() * 1.8 + 0.8, c: colors[i % 4] });
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (!reduce) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        var dx = p.x - mouse.x, dy = p.y - mouse.y, d = dx * dx + dy * dy;
        if (d < 14400) { var f = (1 - Math.sqrt(d) / 120) * 0.6; p.x += dx * f * 0.04; p.y += dy * f * 0.04; }
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fillStyle = p.c; ctx.globalAlpha = 0.85; ctx.fill();
      for (var j = i + 1; j < pts.length; j++) {
        var q = pts[j], ax = p.x - q.x, ay = p.y - q.y, dist = ax * ax + ay * ay;
        if (dist < 16900) {
          ctx.globalAlpha = (1 - Math.sqrt(dist) / 130) * 0.28;
          ctx.strokeStyle = p.c; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(draw);
  }
  window.addEventListener("resize", function () { resize(); if (reduce) draw(); });
  window.addEventListener("pointermove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  resize(); draw();

  /* ---------- Rotating word on the login screen ---------- */
  var words = ["chat", "write", "code", "plan", "translate"], wi = 0, wEl = $("word");
  if (!reduce) setInterval(function () {
    wEl.classList.add("out");
    setTimeout(function () { wi = (wi + 1) % words.length; wEl.textContent = words[wi]; wEl.classList.remove("out"); }, 350);
  }, 2400);

  /* ---------- Login and sign up ---------- */
  var mode = "login";
  var card = $("card"), tabs = $("tabs");
  var fUser = $("f-user"), fEmail = $("f-email"), fPass = $("f-pass"), formError = $("form-error");

  function setMode(m) {
    mode = m;
    card.setAttribute("data-mode", m); tabs.setAttribute("data-tab", m);
    $("tab-login").setAttribute("aria-selected", String(m === "login"));
    $("tab-signup").setAttribute("aria-selected", String(m === "signup"));
    $("title").textContent = m === "login" ? "Welcome back" : "Create your account";
    $("subtitle").textContent = m === "login" ? "Log in with your email or username." : "Pick a username and join AI Hub.";
    $("submit-text").textContent = m === "login" ? "Log in" : "Create account";
    $("email-label").textContent = m === "login" ? "Email or username" : "Email";
    $("email").type = m === "login" ? "text" : "email";
    $("e-email").textContent = m === "login" ? "Enter your email or username." : "Enter a valid email address.";
    $("email").setAttribute("autocomplete", m === "login" ? "username" : "email");
    $("password").setAttribute("autocomplete", m === "login" ? "current-password" : "new-password");
    [fUser, fEmail, fPass].forEach(function (f) { f.classList.remove("bad"); });
    formError.hidden = true;
  }
  [].forEach.call(document.querySelectorAll(".tab"), function (b) {
    b.addEventListener("click", function () { setMode(b.getAttribute("data-t")); });
  });

  $("eye").addEventListener("click", function () {
    var p = $("password"), show = p.type === "password";
    p.type = show ? "text" : "password";
    this.textContent = show ? "Hide" : "Show";
    this.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  function strength(v) {
    var s = 0;
    if (v.length >= 8) s++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v) || v.length >= 14) s++;
    return s;
  }
  var meterColors = ["#ff6b81", "#ffb347", "#c8e64c", "#22e6c8"], meterText = ["add 8+ characters", "weak", "okay", "good", "strong"];
  function resetMeter() {
    [].forEach.call($("meter").children, function (b) { b.style.background = ""; });
    $("meter-label").textContent = "Strength: add 8+ characters";
  }
  $("password").addEventListener("input", function () {
    var s = strength(this.value), bars = $("meter").children;
    for (var i = 0; i < 4; i++) bars[i].style.background = i < s ? meterColors[s - 1] : "";
    $("meter-label").textContent = "Strength: " + meterText[this.value ? s : 0];
  });

  function flag(field, bad) { field.classList.toggle("bad", bad); return !bad; }
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    formError.hidden = true;
    var user = $("username").value.trim(), id = $("email").value.trim(), pass = $("password").value;
    var ok = true;
    if (mode === "signup") {
      ok = flag(fUser, !/^\w{3,24}$/.test(user)) && ok;
      ok = flag(fEmail, !emailRe.test(id)) && ok;
      ok = flag(fPass, pass.length < 8) && ok;
    } else {
      ok = flag(fEmail, id.length < 1) && ok;
      ok = flag(fPass, pass.length < 1) && ok;
    }
    if (!ok) {
      if (card.animate && !reduce) card.animate([{ transform: "translateX(0)" }, { transform: "translateX(-9px)" }, { transform: "translateX(9px)" }, { transform: "translateX(-5px)" }, { transform: "translateX(0)" }], { duration: 380 });
      return;
    }
    var btn = $("submit"); btn.disabled = true; btn.classList.add("loading");
    var req = mode === "signup"
      ? api("/api/signup", "POST", { username: user, email: id, password: pass })
      : api("/api/login", "POST", { identifier: id, password: pass });
    req.then(function (res) {
      btn.disabled = false; btn.classList.remove("loading");
      if (!res.ok) {
        formError.textContent = res.data.error || "Something went wrong. Please try again.";
        formError.hidden = false;
        return;
      }
      $("password").value = ""; resetMeter();
      enterHub(res.data.user, res.data.usage, mode === "signup");
    });
  });

  /* ---------- Hub ---------- */
  var cats = {
    Chat:         ["#22e6c8", "#3d8bff"],
    Learn:        ["#b6f24a", "#22e6c8"],
    Writing:      ["#ffb347", "#ffe27a"],
    Code:         ["#3d8bff", "#7ae7ff"],
    Creative:     ["#ff4fa3", "#ffb347"],
    Productivity: ["#ff6b4a", "#ff4fa3"]
  };
  var tools = [], categories = [], active = "All", query = "", usage = { used: 0, limit: 0, remaining: 0 };
  var fWrap = $("filters");

  function showAuth() {
    $("hub").hidden = true; $("auth").hidden = false; closeWs();
  }
  function setUsage(u) {
    if (!u) return;
    usage = u;
    $("s-used").textContent = u.used; $("s-left").textContent = u.remaining;
    $("left-pill").textContent = u.remaining + " of " + u.limit + " requests left today";
    $("ws-hint").textContent = "Enter to send, Shift+Enter for a new line. " + u.remaining + " left today.";
  }
  function enterHub(user, u, fresh) {
    $("auth").hidden = true; $("hub").hidden = false;
    $("who").textContent = user.username; $("hello").textContent = user.username;
    $("avatar").textContent = user.username.charAt(0).toUpperCase();
    setUsage(u);
    window.scrollTo(0, 0);
    api("/api/tools").then(function (res) {
      if (res.status === 401) { showAuth(); return; }
      if (!res.ok) { toast(res.data.error || "Could not load the tools."); return; }
      tools = res.data.tools; categories = res.data.categories;
      $("s-tools").textContent = tools.length; $("s-cats").textContent = categories.length;
      buildFilters(); render();
      toast((fresh ? "Account created. Welcome, " : "Welcome back, ") + user.username + ".");
    });
  }
  function buildFilters() {
    fWrap.innerHTML = "";
    ["All"].concat(categories).forEach(function (c) {
      var b = document.createElement("button");
      b.className = "filter"; b.type = "button"; b.textContent = c;
      b.setAttribute("aria-pressed", String(c === active));
      b.addEventListener("click", function () {
        active = c;
        [].forEach.call(fWrap.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        render();
      });
      fWrap.appendChild(b);
    });
  }
  $("q").addEventListener("input", function () { query = this.value.trim().toLowerCase(); render(); });

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function render() {
    var grid = $("grid"), list = tools.filter(function (t) {
      return (active === "All" || t.cat === active) && (!query || (t.name + " " + t.cat + " " + t.desc).toLowerCase().indexOf(query) > -1);
    });
    $("count").textContent = list.length + (list.length === 1 ? " tool" : " tools");
    if (!list.length) {
      grid.innerHTML = '<div class="empty"><b>No tools found</b>Try a different word or pick another category.</div>';
      return;
    }
    grid.innerHTML = list.map(function (t, i) {
      var c = cats[t.cat] || cats.Chat;
      return '<article class="tool" style="--t1:' + c[0] + ";--t2:" + c[1] + ";animation-delay:" + (i * 50) + 'ms">' +
        '<div class="badge" aria-hidden="true">' + esc(t.name.charAt(0)) + '</div>' +
        '<h3>' + esc(t.name) + '</h3><p>' + esc(t.desc) + '</p>' +
        '<div class="meta"><span class="cat">' + esc(t.cat) + '</span>' +
        '<button class="try" type="button" data-id="' + esc(t.id) + '">Open</button></div></article>';
    }).join("");
  }
  $("grid").addEventListener("click", function (e) {
    var b = e.target.closest(".try");
    if (b) openWs(b.getAttribute("data-id"), "", b);
  });
  $("grid").addEventListener("pointermove", function (e) {
    var el = e.target.closest(".tool"); if (!el) return;
    var r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    el.style.setProperty("--mx", x + "px"); el.style.setProperty("--my", y + "px");
    if (!reduce && e.pointerType === "mouse") {
      el.style.transform = "rotateX(" + (((y / r.height) - 0.5) * -8).toFixed(2) + "deg) rotateY(" + (((x / r.width) - 0.5) * 8).toFixed(2) + "deg) translateY(-4px)";
    }
  });
  $("grid").addEventListener("pointerout", function (e) {
    var el = e.target.closest(".tool"); if (el) el.style.transform = "";
  });

  $("logout").addEventListener("click", function () {
    api("/api/logout", "POST").then(function () {
      tools = []; $("grid").innerHTML = ""; $("q").value = ""; query = ""; active = "All";
      showAuth(); setMode("login");
      toast("Logged out. See you soon.");
    });
  });

  /* Prompt of the day */
  $("potd-try").addEventListener("click", function () { openWs("tutor", $("prompt").textContent, this); });
  $("copy").addEventListener("click", function () {
    var text = $("prompt").textContent;
    function done() { toast("Prompt copied."); }
    function fallback() {
      var r = document.createRange(); r.selectNodeContents($("prompt"));
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      toast("Press copy to copy the highlighted prompt.");
    }
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (err) { fallback(); }
  });

  /* ---------- Tool workspace ---------- */
  var ws = $("ws"), log = $("ws-log"), input = $("ws-input"), sendBtn = $("ws-send");
  var current = null, messages = [], busy = false, opener = null;

  function fmt(text) {
    // Safe mini formatter: escapes everything, then handles code fences, `inline code` and **bold**.
    var out = "", last = 0, re = /```([\w+-]*)\n?([\s\S]*?)```/g, m;
    function plain(s) {
      return esc(s).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    }
    while ((m = re.exec(text)) !== null) {
      out += plain(text.slice(last, m.index));
      out += "<pre><code>" + esc(m[2].replace(/\n$/, "")) + "</code></pre>";
      last = re.lastIndex;
    }
    return out + plain(text.slice(last));
  }

  function emptyState() {
    log.innerHTML = '<div class="ws-empty"><b>' + esc(current.name) + '</b>' + esc(current.desc) + '</div>';
  }
  function addMsg(role, text, html) {
    var empty = log.querySelector(".ws-empty"); if (empty) empty.remove();
    var el = document.createElement("div");
    el.className = "msg " + role;
    if (role === "bot") {
      el.innerHTML = fmt(text);
      var act = document.createElement("div"); act.className = "msg-actions";
      act.innerHTML = '<button class="mini" type="button" data-copy="1">Copy</button>';
      el.appendChild(act);
      el._text = text;
    } else if (html) {
      el.innerHTML = html;
    } else {
      el.textContent = text;
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  log.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy]"); if (!b) return;
    var msg = b.closest(".msg"), text = msg && msg._text || "";
    try { navigator.clipboard.writeText(text).then(function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); }, function () { toast("Select the text to copy it."); }); }
    catch (err) { toast("Select the text to copy it."); }
  });

  function openWs(id, prefill, from) {
    var t = tools.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    current = t; messages = []; opener = from || null;
    var c = cats[t.cat] || cats.Chat;
    var badge = $("ws-badge");
    badge.textContent = t.name.charAt(0);
    badge.style.setProperty("--t1", c[0]); badge.style.setProperty("--t2", c[1]);
    $("ws-name").textContent = t.name; $("ws-desc").textContent = t.desc;
    input.placeholder = t.placeholder || "Type your message...";
    input.value = prefill || "";
    emptyState();
    ws.hidden = false; document.body.classList.add("lock");
    setTimeout(function () { input.focus(); autosize(); }, 50);
  }
  function closeWs() {
    if (ws.hidden) return;
    ws.hidden = true; document.body.classList.remove("lock");
    if (opener && document.body.contains(opener)) opener.focus();
  }
  $("ws-close").addEventListener("click", closeWs);
  ws.addEventListener("click", function (e) { if (e.target === ws) closeWs(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeWs(); });
  $("ws-new").addEventListener("click", function () {
    if (busy) return;
    messages = []; emptyState(); input.value = ""; autosize(); input.focus();
  });

  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  }
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("ws-form").requestSubmit(); }
  });

  $("ws-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !current) return;
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    if (usage.remaining <= 0 && usage.limit > 0) { toast("You have used all of today's requests. Come back tomorrow."); return; }

    busy = true; sendBtn.disabled = true; sendBtn.classList.add("loading");
    messages.push({ role: "user", content: text });
    addMsg("user", text);
    input.value = ""; autosize();
    var typing = addMsg("bot-wait", "", '<span class="dots" aria-label="Thinking"><i></i><i></i><i></i></span>');
    typing.className = "msg bot";

    api("/api/tools/" + encodeURIComponent(current.id) + "/run", "POST", { messages: messages }).then(function (res) {
      typing.remove();
      busy = false; sendBtn.disabled = false; sendBtn.classList.remove("loading");
      if (res.data && res.data.usage) setUsage(res.data.usage);
      if (res.status === 401) { showAuth(); toast("Your session ended. Please log in again."); return; }
      if (!res.ok) {
        // Take the unanswered message back so the user can fix or resend it
        messages.pop();
        var last = log.querySelector(".msg.user:last-of-type");
        if (last) last.remove();
        input.value = text; autosize();
        addMsg("err", res.data.error || "Something went wrong. Please try again.");
        if (!messages.length && !log.querySelector(".msg")) emptyState();
        return;
      }
      messages.push({ role: "assistant", content: res.data.reply });
      addMsg("bot", res.data.reply);
      input.focus();
    });
  });

  /* ---------- Start: are we already logged in? ---------- */
  api("/api/me").then(function (res) {
    if (res.ok) enterHub(res.data.user, res.data.usage, false);
    else { $("auth").hidden = false; }
  });
})();
