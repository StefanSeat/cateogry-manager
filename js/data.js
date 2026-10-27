// Demo dataset: fictional companies and contacts, generated with a fixed seed
// so every visitor sees the same numbers. Not real prospects.
(function () {
  var seed = 20261027;
  function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function wpick(pairs) {
    var t = 0, i, r;
    for (i = 0; i < pairs.length; i++) t += pairs[i][1];
    r = rnd() * t;
    for (i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r <= 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }

  var first = ["Aurelia", "Northbridge", "Calderon", "Veridian", "Lumora", "Bexley", "Halcyon", "Corvane", "Solenne", "Arbor",
    "Kestrel", "Mirada", "Quillon", "Tessaro", "Ostrava", "Pellucid", "Rivenna", "Sablewood", "Thorne", "Umbra",
    "Valemont", "Wexford", "Zephyra", "Alder", "Brightwater", "Cindral", "Dunmore", "Elara", "Fenwick", "Galloway",
    "Hartwell", "Iliad", "Juniper", "Kinsale", "Larkspur", "Meridia", "Novella", "Orrin", "Prestwick", "Redfern"];
  var last = ["Therapeutics", "Bio", "Biosciences", "Pharma", "Oncology", "Medical", "Biologics", "Genomics", "Health", "Immune"];
  var roles = ["VP Clinical Operations", "Director, Clinical Development", "Head of Regulatory Affairs", "Chief Medical Officer",
    "Outsourcing Manager", "Director, Biometrics", "Head of Preclinical", "Procurement Lead"];
  var types = [["Emerging biotech", 45], ["Mid-size biopharma", 22], ["Large pharma", 12], ["Medical device", 11], ["Academic / NIH", 10]];
  var regions = [["North America", 45], ["Europe", 32], ["APAC", 15], ["LATAM", 8]];
  var areas = [["Oncology", 30], ["Rare disease", 16], ["Infectious disease", 14], ["CNS", 14], ["Immunology", 13], ["Cardiometabolic", 13]];
  var phases = [["Preclinical", 20], ["Phase I", 30], ["Phase II", 30], ["Phase III", 20]];
  var services = ["Clinical trial support", "Regulatory affairs", "Preclinical studies", "Data management", "Central lab"];
  var sources = [["Webinar", 24], ["Content download", 22], ["RFI form", 12], ["Conference", 14], ["ADR outbound", 18], ["Referral", 14]];
  var rounds = ["Seed", "Series A", "Series B", "Series C", "IPO"];

  var used = {};
  var leads = [];
  var N = 64;
  for (var i = 0; i < N; i++) {
    var name;
    do { name = pick(first) + " " + pick(last); } while (used[name]);
    used[name] = 1;
    var type = wpick(types);
    var funded = type === "Large pharma" ? false : rnd() < 0.45;
    var phase = wpick(phases);
    var service = phase === "Preclinical" ? (rnd() < 0.7 ? "Preclinical studies" : "Regulatory affairs") : pick(services);
    var created = Math.floor(rnd() * 91); // days before reference date
    leads.push({
      id: "L-" + (1040 + i),
      company: name,
      contact: pick(roles),
      type: type,
      region: wpick(regions),
      area: wpick(areas),
      phase: phase,
      service: service,
      funded: funded,
      round: funded ? pick(rounds.slice(1)) : null,
      source: wpick(sources),
      createdDaysAgo: created,
      lastTouchDays: created < 5 ? created : Math.min(created, Math.floor(rnd() * 75)),
      email: Math.floor(rnd() * 4),          // 0 none, 1 opened, 2 clicked, 3 replied
      contacts: 1 + Math.floor(rnd() * 4),   // people engaged at the account
      responseHours: Math.round(2 + rnd() * rnd() * 90),
      noise: rnd()
    });
  }
  window.DEMO_REF_DATE = new Date(2026, 9, 27);
  window.DEMO_LEADS = leads;
})();
