(function () {
  var leads = window.DEMO_LEADS;
  var REF = window.DEMO_REF_DATE;
  var STAGES = ["New", "Working", "MQL", "SQL", "RFP", "Disqualified"];
  var FUNNEL = ["New", "Working", "MQL", "SQL", "RFP"];

  // ---------- Scoring model ----------
  var weights = { fit: 30, pipeline: 25, intent: 25, engagement: 20 };
  var TYPE = { "Emerging biotech": 1, "Mid-size biopharma": 0.9, "Large pharma": 0.6, "Medical device": 0.5, "Academic / NIH": 0.3 };
  var PHASE = { "Preclinical": 0.5, "Phase I": 0.8, "Phase II": 1, "Phase III": 0.9 };
  var SOURCE = { "RFI form": 1, "Referral": 0.9, "Conference": 0.6, "Webinar": 0.6, "AD outbound": 0.4, "Content download": 0.35 };
  var REGION = { "North America": 1, "Europe": 1, "APAC": 0.8, "LATAM": 0.7 };

  function parts(l) {
    var rec = l.lastTouchDays <= 7 ? 1 : l.lastTouchDays <= 30 ? 0.6 : l.lastTouchDays <= 60 ? 0.3 : 0.1;
    return {
      fit: TYPE[l.type] * 0.8 + REGION[l.region] * 0.2,
      pipeline: PHASE[l.phase] * 0.6 + (l.funded ? 1 : 0.3) * 0.4,
      intent: SOURCE[l.source],
      engagement: rec * 0.5 + (l.email / 3) * 0.3 + ((l.contacts - 1) / 3) * 0.2
    };
  }
  function score(l) {
    var p = parts(l), tw = weights.fit + weights.pipeline + weights.intent + weights.engagement;
    if (!tw) return 0;
    return Math.round((p.fit * weights.fit + p.pipeline * weights.pipeline + p.intent * weights.intent + p.engagement * weights.engagement) / tw * 100);
  }
  function grade(s) { return s >= 75 ? "A" : s >= 60 ? "B" : "C"; }
  function isDQ(l) { return l.stage === "Disqualified"; }
  // A disqualified lead keeps its score (it describes the prospect), but loses its grade:
  // it is out of the working queue until something changes.
  function label(l) { return isDQ(l) ? "DQ" : grade(score(l)); }
  var DQ_REASONS = [
    "Signed an MSA with another CRO for this program",
    "Running the study with an in-house team",
    "Program paused, no budget this year",
    "Duplicate of an existing account in CRM",
    "Service outside our scope (commercial-stage only)"
  ];

  // Stage history is simulated once with the default weights so the funnel
  // reflects lead quality; changing weights later only re-ranks, it does not rewrite history.
  leads.forEach(function (l) {
    var s = score(l) / 100, n = l.noise, st;
    if (l.createdDaysAgo < 5) st = "New";
    else if (n > 0.93) st = "Disqualified";
    else {
      var z = Math.max(0, Math.min(1, (s - 0.45) / 0.4));
      var q = z * 0.8 + (1 - n) * 0.2;
      st = q > 0.8 ? "RFP" : q > 0.66 ? "SQL" : q > 0.48 ? "MQL" : q > 0.3 ? "Working" : "New";
    }
    l.stage = st;
    if (st === "Disqualified") l.dqReason = DQ_REASONS[Math.floor(n * 1000) % DQ_REASONS.length];
  });
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem("ada-stages") || "{}"); } catch (e) {}
  leads.forEach(function (l) {
    if (saved[l.id] && STAGES.indexOf(saved[l.id]) > -1) {
      l.stage = saved[l.id];
      if (isDQ(l) && !l.dqReason) l.dqReason = "Set manually";
    }
  });

  function slaBreach(l) { return grade(score(l)) === "A" && (l.stage === "New" || l.stage === "Working") && l.lastTouchDays >= 1; }

  function nextAction(l) {
    var g = grade(score(l));
    if (isDQ(l)) return "Out of the queue. Keep the account in the marketing database and re-check in 6 months: new funding or a new trial registration can reopen it.";
    if (l.stage === "RFP") return "RFP in progress. Support the AD: collect protocol synopsis, timelines and budget range, book the bid defense prep, log every touch in CRM.";
    if (l.stage === "SQL") return "Accepted by sales. Confirm the AD has a discovery call booked and the opportunity is created with service line and expected RFP date.";
    if (l.source === "RFI form" && (l.stage === "New" || l.stage === "Working")) return "Inbound RFI: respond within 24 hours, qualify scope and timing, then hand off to the AD the same day.";
    if (g === "A") return "Hot lead. Route to the AD today with a hand-off note and suggest a discovery call this week (SLA: 24 hours).";
    if (g === "B" && l.source === "Webinar") return "Send the webinar recording plus one " + l.area.toLowerCase() + " case study. Follow up in 3 business days.";
    if (g === "B") return "Nurture: 3-touch sequence on " + l.service.toLowerCase() + " for " + l.phase + " sponsors. Re-score after 14 days.";
    return "Keep in marketing nurture. Re-score monthly; watch for funding news or a new trial on ClinicalTrials.gov.";
  }

  function handoff(l) {
    var p = parts(l), s = score(l);
    var why = [];
    if (l.funded) why.push("raised " + l.round + " in the last 12 months");
    if (l.phase === "Phase I" || l.phase === "Phase II") why.push("moving through " + l.phase + ", next-phase planning likely");
    if (l.phase === "Phase III") why.push("Phase III scale, larger multi-country scope");
    if (l.source === "RFI form") why.push("submitted an RFI (direct buying signal)");
    if (l.source === "Webinar") why.push("attended our webinar");
    if (l.source === "Referral") why.push("referred by an existing client contact");
    if (l.contacts > 2) why.push(l.contacts + " people at the account engaged");
    if (l.email >= 2) why.push("clicked or replied to outreach");
    return [
      "HAND-OFF: " + l.company + " (" + l.id + ")",
      "To: AD, " + l.region,
      "",
      "Contact: " + l.contact,
      "Profile: " + l.type + " | " + l.area + " | " + l.phase,
      "Interest: " + l.service,
      "Source: " + l.source + " | Last touch: " + (l.lastTouchDays === 1 ? "1 day ago" : l.lastTouchDays ? l.lastTouchDays + " days ago" : "today"),
      "",
      "Score: " + s + " (grade " + grade(s) + ")",
      "  Fit " + Math.round(p.fit * 100) + " | Pipeline " + Math.round(p.pipeline * 100) + " | Intent " + Math.round(p.intent * 100) + " | Engagement " + Math.round(p.engagement * 100),
      "",
      "Why now: " + (why.length ? why.join("; ") : "fit with our core client profile") + ".",
      "",
      "Suggested angle: " + angle(l),
      "Next step: " + nextAction(l)
    ].join("\n");
  }
  function angle(l) {
    var a = {
      "Oncology": "oncology trial experience, site network and patient recruitment speed",
      "Rare disease": "small-population recruitment and regulatory strategy (orphan designation)",
      "Infectious disease": "vaccine and infectious disease trial capacity and central lab support",
      "CNS": "rater training, endpoint quality and retention in long CNS studies",
      "Immunology": "biomarker and central lab capabilities for immunology endpoints",
      "Cardiometabolic": "large-scale enrolment and data management for outcome trials"
    }[l.area];
    if (l.service === "Preclinical studies") return "IND-enabling preclinical package, then a smooth path into Phase I with the same partner.";
    if (l.service === "Regulatory affairs") return "regulatory strategy and submissions, linked to " + a + ".";
    if (l.service === "Data management") return "data management and biostatistics, plus " + a + ".";
    return a.charAt(0).toUpperCase() + a.slice(1) + ".";
  }

  // ---------- Helpers ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function copy(text, btn) {
    function done() { var o = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = o; }, 1200); }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
  }
  var tip = document.createElement("div"); tip.className = "tip"; document.body.appendChild(tip);
  function showTip(e, html) { tip.innerHTML = html; tip.style.opacity = 1; moveTip(e); }
  function moveTip(e) {
    var x = e.clientX + 14, y = e.clientY + 14, w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.style.opacity = 0; }

  // ---------- Tabs ----------
  function showTab(id) {
    $all("nav.tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === id ? "true" : "false"); });
    $all(".panel").forEach(function (p) { p.hidden = p.id !== id; });
    try { localStorage.setItem("ada-tab", id); } catch (e) {}
    if (id === "analytics") renderAnalytics();
  }
  $all("nav.tabs button").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });

  // ---------- Lead desk ----------
  var sortKey = "score", sortDir = -1, selected = null;
  var f = { q: "", grade: "", stage: "active", region: "", source: "" };

  function fillSelect(id, values) {
    var s = $(id);
    values.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v; s.appendChild(o); });
  }
  fillSelect("#f-stage", STAGES);
  fillSelect("#f-region", ["North America", "Europe", "APAC", "LATAM"]);
  fillSelect("#f-source", Object.keys(SOURCE));

  function filtered() {
    var q = f.q.toLowerCase();
    return leads.filter(function (l) {
      var s = score(l);
      if (q && (l.company + " " + l.area + " " + l.service + " " + l.contact + " " + l.id).toLowerCase().indexOf(q) < 0) return false;
      if (f.grade === "SLA") { if (!slaBreach(l)) return false; }
      else if (f.grade && label(l) !== f.grade) return false;
      if (f.stage === "active") { if (isDQ(l)) return false; }
      else if (f.stage && l.stage !== f.stage) return false;
      if (f.region && l.region !== f.region) return false;
      if (f.source && l.source !== f.source) return false;
      return true;
    });
  }

  function renderDesk() {
    var rows = filtered().map(function (l) { return { l: l, s: score(l) }; });
    rows.sort(function (a, b) {
      var va, vb;
      if (sortKey === "score") { va = a.s; vb = b.s; }
      else if (sortKey === "last") { va = a.l.lastTouchDays; vb = b.l.lastTouchDays; }
      else { va = a.l[sortKey]; vb = b.l[sortKey]; }
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
    var active = leads.filter(function (l) { return !isDQ(l); });
    $("#d-total").textContent = active.length;
    $("#d-dq").textContent = leads.length - active.length;
    $("#d-a").textContent = active.filter(function (l) { return label(l) === "A"; }).length;
    $("#d-b").textContent = active.filter(function (l) { return label(l) === "B"; }).length;
    $("#d-sla").textContent = leads.filter(slaBreach).length;
    $("#d-count").textContent = rows.length + " of " + leads.length + " leads";

    $("#lead-body").innerHTML = rows.map(function (r) {
      var l = r.l, g = label(l);
      var cls = (selected === l.id ? "sel" : "") + (isDQ(l) ? " dq" : "");
      return '<tr data-id="' + l.id + '"' + (cls.trim() ? ' class="' + cls.trim() + '"' : "") + (isDQ(l) ? ' title="' + esc(l.dqReason) + '"' : "") + ">" +
        '<td><div class="co">' + esc(l.company) + '</div><div class="sub">' + esc(l.contact) + "</div></td>" +
        '<td class="num"><span class="scorebar"><i><b style="width:' + r.s + '%"></b></i>' + r.s + "</span></td>" +
        '<td><span class="chip g-' + g + '">' + g + "</span>" + (slaBreach(l) ? ' <span class="chip sla" title="Grade A lead not worked within 24 hours">SLA</span>' : "") + "</td>" +
        '<td><span class="chip st">' + l.stage + "</span></td>" +
        "<td>" + esc(l.type) + "</td><td>" + esc(l.area) + "</td><td>" + l.phase + "</td><td>" + esc(l.source) + "</td>" +
        '<td class="num">' + l.lastTouchDays + "d</td></tr>";
    }).join("") || '<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">No leads match these filters.</td></tr>';
    renderDetail();
  }

  function renderDetail() {
    var box = $("#detail");
    var l = leads.filter(function (x) { return x.id === selected; })[0];
    if (!l) { box.innerHTML = '<div class="empty">Select a lead to see its score breakdown, next best action and a hand-off note for the AD.</div>'; return; }
    var p = parts(l), s = score(l), g = label(l);
    var opts = STAGES.map(function (st) { return "<option" + (st === l.stage ? " selected" : "") + ">" + st + "</option>"; }).join("");
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><h3>' + esc(l.company) + '</h3><div class="sub">' + l.id + " | " + esc(l.contact) + '</div></div><span class="chip g-' + g + '" style="font-size:.9rem">' + s + " " + g + "</span></div>" +
      '<dl class="kv"><dt>Type</dt><dd>' + esc(l.type) + "</dd><dt>Region</dt><dd>" + l.region + "</dd><dt>Area</dt><dd>" + esc(l.area) + " | " + l.phase + "</dd>" +
      "<dt>Interest</dt><dd>" + esc(l.service) + "</dd><dt>Funding</dt><dd>" + (l.funded ? l.round + " (last 12 months)" : "No recent round") + "</dd>" +
      "<dt>Source</dt><dd>" + esc(l.source) + "</dd><dt>Stage</dt><dd><select id=\"stage-sel\" aria-label=\"Stage\">" + opts + "</select></dd>" +
      (isDQ(l) ? "<dt>DQ reason</dt><dd>" + esc(l.dqReason) + "</dd>" : "") + "</dl>" +
      (isDQ(l) ? '<p class="muted">Score ' + s + " still shows how good this prospect looks on paper. The DQ reason above is something the score cannot see, so the lead leaves the active queue.</p>" : "") +
      '<div class="breakdown">' + ["fit", "pipeline", "intent", "engagement"].map(function (k) {
        var v = Math.round(p[k] * 100);
        return '<div class="row"><span>' + { fit: "Company fit", pipeline: "Pipeline & funding", intent: "Intent", engagement: "Engagement" }[k] + ' <span class="sub">(' + weights[k] + ")</span></span><div class=\"bar\"><b style=\"width:" + v + '%"></b></div><span>' + v + "</span></div>";
      }).join("") + "</div>" +
      '<div class="nba"><strong>Next best action</strong>' + esc(nextAction(l)) + "</div>" +
      (isDQ(l) ? "" :
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><span class="label" style="margin:0">Hand-off note</span><button class="btn small" id="copy-note">Copy</button></div>' +
      '<textarea class="note" id="note" aria-label="Hand-off note">' + esc(handoff(l)) + "</textarea>");
    $("#stage-sel").addEventListener("change", function (e) {
      l.stage = e.target.value; saved[l.id] = l.stage;
      if (isDQ(l) && !l.dqReason) l.dqReason = "Set manually";
      try { localStorage.setItem("ada-stages", JSON.stringify(saved)); } catch (err) {}
      renderDesk();
    });
    if ($("#copy-note")) $("#copy-note").addEventListener("click", function (e) { copy($("#note").value, e.target); });
  }

  $("#lead-body").addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-id]"); if (!tr) return;
    selected = tr.dataset.id; renderDesk();
    if (window.innerWidth <= 900) $("#detail").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $all("#lead-table th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === "score" ? -1 : 1; }
      renderDesk();
    });
  });
  $("#f-q").addEventListener("input", function (e) { f.q = e.target.value; renderDesk(); });
  ["grade", "stage", "region", "source"].forEach(function (k) {
    $("#f-" + k).addEventListener("change", function (e) { f[k] = e.target.value; renderDesk(); });
  });
  $all(".weights input").forEach(function (inp) {
    inp.addEventListener("input", function () {
      weights[inp.name] = +inp.value;
      $("#w-" + inp.name).textContent = inp.value;
      renderDesk();
    });
  });
  $("#w-reset").addEventListener("click", function () {
    weights = { fit: 30, pipeline: 25, intent: 25, engagement: 20 };
    $all(".weights input").forEach(function (inp) { inp.value = weights[inp.name]; $("#w-" + inp.name).textContent = inp.value; });
    renderDesk();
  });
  $("#export").addEventListener("click", function () {
    var head = ["id", "company", "contact", "type", "region", "area", "phase", "service", "source", "stage", "score", "grade", "last_touch_days", "next_action"];
    var lines = [head.join(",")].concat(filtered().map(function (l) {
      var s = score(l);
      return [l.id, l.company, l.contact, l.type, l.region, l.area, l.phase, l.service, l.source, l.stage, s, label(l), l.lastTouchDays, isDQ(l) ? l.dqReason : nextAction(l)]
        .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",");
    }));
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "lead-queue.csv"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  // ---------- Analytics ----------
  function reached(l, st) { return l.stage !== "Disqualified" && FUNNEL.indexOf(l.stage) >= FUNNEL.indexOf(st); }

  function renderAnalytics() {
    var total = leads.length;
    var worked = leads.filter(function (l) { return l.stage !== "New"; }).length;
    var mql = leads.filter(function (l) { return reached(l, "MQL"); }).length;
    var sql = leads.filter(function (l) { return reached(l, "SQL"); }).length;
    var rfp = leads.filter(function (l) { return reached(l, "RFP"); }).length;
    var resp = leads.map(function (l) { return l.responseHours; }).sort(function (a, b) { return a - b; });
    var median = resp[Math.floor(resp.length / 2)];

    $("#k-leads").textContent = total;
    $("#k-mql").textContent = pct(mql, total) + "%";
    $("#k-sql").textContent = pct(sql, mql) + "%";
    $("#k-rfp").textContent = rfp;
    $("#k-resp").textContent = median + "h";

    // Funnel
    var steps = [["All leads", total], ["Worked", worked], ["MQL", mql], ["SQL", sql], ["RFP", rfp]];
    $("#funnel").innerHTML = steps.map(function (s, i) {
      var conv = i ? pct(s[1], steps[i - 1][1]) + "% of prev." : "";
      return '<div class="f" data-tip="<b>' + s[0] + "</b><br>" + s[1] + " leads (" + pct(s[1], total) + "% of all)" + (i ? "<br>" + conv : "") + '"><span>' + s[0] +
        '</span><div class="track"><div class="fill" style="width:' + pct(s[1], total) + '%"></div></div><span><strong>' + s[1] + "</strong> " + (i ? pct(s[1], steps[i - 1][1]) + "%" : "") + "</span></div>";
    }).join("");

    // Source performance
    var srcs = Object.keys(SOURCE).map(function (k) {
      var g = leads.filter(function (l) { return l.source === k; });
      var sq = g.filter(function (l) { return reached(l, "SQL"); }).length;
      var rf = g.filter(function (l) { return reached(l, "RFP"); }).length;
      var avg = g.length ? Math.round(g.reduce(function (a, l) { return a + score(l); }, 0) / g.length) : 0;
      return { k: k, n: g.length, sql: sq, rfp: rf, rate: pct(sq, g.length), avg: avg };
    }).sort(function (a, b) { return b.rate - a.rate; });
    $("#src-bars").innerHTML = srcs.map(function (s) {
      return '<div class="r" data-tip="<b>' + s.k + "</b><br>" + s.n + " leads, " + s.sql + " reached SQL (" + s.rate + "%)<br>" + s.rfp + ' RFPs | avg score ' + s.avg + '"><span>' + s.k +
        '</span><div class="track"><div class="fill" style="width:' + s.rate + '%"></div></div><span>' + s.rate + "%</span></div>";
    }).join("");
    $("#src-table").innerHTML = srcs.map(function (s) {
      return "<tr><td>" + s.k + '</td><td class="num">' + s.n + '</td><td class="num">' + s.sql + '</td><td class="num">' + s.rate + '%</td><td class="num">' + s.rfp + '</td><td class="num">' + s.avg + "</td></tr>";
    }).join("");

    // Weekly new leads (13 weeks)
    var weeks = [];
    for (var w = 12; w >= 0; w--) weeks.push({ w: w, n: leads.filter(function (l) { return Math.floor(l.createdDaysAgo / 7) === w; }).length });
    drawLine(weeks);

    // Insights (computed, not hard-coded)
    var best = srcs[0], worst = srcs[srcs.length - 1];
    var byArea = {};
    leads.forEach(function (l) { (byArea[l.area] = byArea[l.area] || []).push(l); });
    var areas = Object.keys(byArea).map(function (a) { return { a: a, n: byArea[a].length, rfp: byArea[a].filter(function (l) { return reached(l, "RFP"); }).length }; })
      .sort(function (x, y) { return y.rfp - x.rfp || y.n - x.n; });
    var rfpScore = avgScore(leads.filter(function (l) { return reached(l, "RFP"); }));
    var otherScore = avgScore(leads.filter(function (l) { return !reached(l, "RFP"); }));
    var breaches = leads.filter(slaBreach);
    var stuck = leads.filter(function (l) { return l.stage === "MQL" && l.lastTouchDays > 14; }).length;
    var ins = [
      "<b>" + best.k + "</b> leads convert best to SQL (" + best.rate + "%), versus " + worst.rate + "% for " + worst.k + ". Route " + best.k.toLowerCase() + " leads first.",
      "Leads that reached RFP averaged a score of <b>" + rfpScore + "</b>, against " + otherScore + " for the rest, so the model is separating good leads from weak ones.",
      "<b>" + areas[0].a + "</b> produced the most RFPs (" + areas[0].rfp + " from " + areas[0].n + " leads). Worth a dedicated webinar or case study.",
      "<b>" + breaches.length + "</b> grade A leads have not been worked within 24 hours. These go to the top of today's queue.",
      "<b>" + stuck + "</b> MQLs have had no touch for more than 14 days. Re-engage or recycle to nurture."
    ];
    $("#insights").innerHTML = ins.map(function (t) { return "<li>" + t + "</li>"; }).join("");

    $("#report").value = [
      "WEEKLY ACCOUNT DEVELOPMENT REPORT (demo data)",
      "Week ending " + REF.toDateString(),
      "",
      "PIPELINE (last 13 weeks)",
      "  Leads: " + total + " | Worked: " + worked + " | MQL: " + mql + " | SQL: " + sql + " | RFP: " + rfp,
      "  Lead to MQL: " + pct(mql, total) + "% | MQL to SQL: " + pct(sql, mql) + "% | SQL to RFP: " + pct(rfp, sql) + "%",
      "  Median first response: " + median + " hours",
      "",
      "THIS WEEK",
      "  New leads: " + weeks[12].n + " (previous week: " + weeks[11].n + ")",
      "  Grade A leads open: " + leads.filter(function (l) { return grade(score(l)) === "A" && (l.stage === "New" || l.stage === "Working"); }).length,
      "  SLA breaches (grade A not worked in 24h): " + breaches.length + (breaches.length ? " -> " + breaches.slice(0, 5).map(function (l) { return l.company; }).join(", ") : ""),
      "",
      "SOURCE PERFORMANCE (SQL rate)",
      srcs.map(function (s) { return "  " + (s.k + ":                ").slice(0, 18) + s.rate + "% of " + s.n + " leads, " + s.rfp + " RFPs"; }).join("\n"),
      "",
      "ACTIONS",
      "  1. Clear SLA breaches today and hand off to ADs with notes.",
      "  2. Re-engage " + stuck + " stalled MQLs with a case study from " + areas[0].a.toLowerCase() + ".",
      "  3. Ask Marketing for more " + best.k.toLowerCase() + " volume; review " + worst.k.toLowerCase() + " targeting."
    ].join("\n");
  }
  function avgScore(arr) { return arr.length ? Math.round(arr.reduce(function (a, l) { return a + score(l); }, 0) / arr.length) : 0; }

  function drawLine(weeks) {
    var svg = $("#trend"), W = svg.clientWidth || 600, H = 200, pl = 30, pr = 10, pt = 10, pb = 26;
    var max = Math.max.apply(null, weeks.map(function (w) { return w.n; })) + 1;
    var x = function (i) { return pl + i * (W - pl - pr) / (weeks.length - 1); };
    var y = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    var g = '<g class="grid">';
    [0, Math.round(max / 2), max].forEach(function (v) { g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (pl - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>"; });
    g += "</g>";
    var d = weeks.map(function (w, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(w.n).toFixed(1); }).join(" ");
    var labels = weeks.map(function (w, i) { return i % 3 === 0 || i === weeks.length - 1 ? '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + (w.w ? "-" + w.w + "w" : "now") + "</text>" : ""; }).join("");
    var last = weeks.length - 1;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = g + labels + '<path class="l" d="' + d + '"/><circle r="4" cx="' + x(last) + '" cy="' + y(weeks[last].n) + '"/>' +
      '<line class="cross" id="cross" y1="' + pt + '" y2="' + (H - pb) + '" style="display:none"/><circle id="dot" r="4" style="display:none"/>' +
      '<rect x="' + pl + '" y="0" width="' + (W - pl - pr) + '" height="' + H + '" fill="transparent" id="hit"/>';
    var hit = $("#hit"), cross = $("#cross"), dot = $("#dot");
    hit.addEventListener("mousemove", function (e) {
      var r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width;
      var i = Math.max(0, Math.min(last, Math.round((px - pl) / (W - pl - pr) * last)));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.style.display = "";
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(weeks[i].n)); dot.style.display = "";
      showTip(e, "<b>" + (weeks[i].w ? weeks[i].w + " weeks ago" : "This week") + "</b><br>" + weeks[i].n + " new leads");
    });
    hit.addEventListener("mouseleave", function () { cross.style.display = "none"; dot.style.display = "none"; hideTip(); });
  }

  document.addEventListener("mouseover", function (e) { var t = e.target.closest("[data-tip]"); if (t) showTip(e, t.getAttribute("data-tip")); });
  document.addEventListener("mousemove", function (e) { if (e.target.closest("[data-tip]")) moveTip(e); });
  document.addEventListener("mouseout", function (e) { var t = e.target.closest("[data-tip]"); if (t && !t.contains(e.relatedTarget)) hideTip(); });
  window.addEventListener("resize", function () { if (!$("#analytics").hidden) renderAnalytics(); });

  $("#copy-report").addEventListener("click", function (e) { copy($("#report").value, e.target); });
  $all("[data-copy]").forEach(function (b) { b.addEventListener("click", function () { copy($("#" + b.dataset.copy).textContent, b); }); });

  renderDesk();
  var start = "desk";
  try { start = localStorage.getItem("ada-tab") || "desk"; } catch (e) {}
  if (!document.getElementById(start)) start = "desk";
  showTab(start);
})();
