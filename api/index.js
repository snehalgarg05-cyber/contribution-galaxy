const https = require("https");

function fetchContributions(username, token) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);

  const query = JSON.stringify({
    query: `{
      user(login: "${username}") {
        contributionsCollection(from: "${from.toISOString()}", to: "${today.toISOString()}") {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
        login
      }
    }`,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: "/graphql",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `bearer ${token}`,
        "User-Agent": "contribution-galaxy/1.0",
        "Content-Length": Buffer.byteLength(query),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(query);
    req.end();
  });
}

function buildSVG(days, total, username) {
  const W = 860;
  const H = 280;
  const padLeft = 52;
  const padRight = 24;
  const padTop = 72;
  const padBottom = 52;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  const max = Math.max(...days.map(d => d.contributionCount), 1);
  const n = days.length;

  // X and Y for each data point
  const pts = days.map((d, i) => ({
    x: padLeft + (i / (n - 1)) * chartW,
    y: padTop + chartH - (d.contributionCount / max) * chartH,
    count: d.contributionCount,
    date: d.date,
  }));

  // Smooth polyline path
  function smooth(points) {
    if (points.length < 2) return "";
    let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const x1 = (points[i].x + points[i+1].x) / 2;
      const y1 = points[i].y;
      const x2 = (points[i].x + points[i+1].x) / 2;
      const y2 = points[i+1].y;
      d += ` C ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${points[i+1].x.toFixed(1)},${points[i+1].y.toFixed(1)}`;
    }
    return d;
  }

  // Area fill path (close to bottom)
  function areaPath(points) {
    const baseY = padTop + chartH;
    let d = `M ${points[0].x.toFixed(1)},${baseY}`;
    d += ` L ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const x1 = (points[i].x + points[i+1].x) / 2;
      const y1 = points[i].y;
      const x2 = (points[i].x + points[i+1].x) / 2;
      const y2 = points[i+1].y;
      d += ` C ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${points[i+1].x.toFixed(1)},${points[i+1].y.toFixed(1)}`;
    }
    d += ` L ${points[points.length-1].x.toFixed(1)},${baseY} Z`;
    return d;
  }

  const linePath = smooth(pts);
  const fillPath = areaPath(pts);

  // Y axis grid lines & labels
  const yTicks = 5;
  let gridLines = "";
  let yLabels = "";
  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((max / yTicks) * i);
    const y = padTop + chartH - (val / max) * chartH;
    gridLines += `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${W - padRight}" y2="${y.toFixed(1)}"
      stroke="#1a2d4a" stroke-width="1" stroke-dasharray="4,6" opacity="0.7"/>`;
    yLabels += `<text x="${padLeft - 6}" y="${y.toFixed(1)}" font-size="9.5"
      fill="#4a6080" font-family="'Courier New',monospace"
      text-anchor="end" dominant-baseline="middle">${val}</text>`;
  }

  // X axis date labels - every 5 days
  let xLabels = "";
  days.forEach((d, i) => {
    if (i % 5 === 0 || i === days.length - 1) {
      const x = padLeft + (i / (n - 1)) * chartW;
      const dateStr = new Date(d.date).toLocaleDateString("en", { month: "short", day: "numeric" });
      xLabels += `<text x="${x.toFixed(1)}" y="${padTop + chartH + 18}" font-size="9"
        fill="#4a6080" font-family="'Courier New',monospace"
        text-anchor="middle">${dateStr}</text>`;
    }
  });

  // Data point dots - only on non-zero
  let dots = "";
  let glowDots = "";
  pts.forEach((p, i) => {
    if (p.count > 0) {
      const ratio = p.count / max;
      let col = "#7c3aed";
      if (ratio > 0.75) col = "#00ff88";
      else if (ratio > 0.5) col = "#00e5ff";
      else if (ratio > 0.25) col = "#2563eb";

      glowDots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4"
        fill="${col}" opacity="0.9">
        <animate attributeName="r" values="3.5;5;3.5" dur="${(1.5 + Math.random()).toFixed(1)}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.7;1;0.7" dur="${(1.5 + Math.random()).toFixed(1)}s" repeatCount="indefinite"/>
      </circle>`;
    }
  });

  // Stars
  const stars = Array.from({length: 35}, (_, i) => {
    const cx = Math.floor(Math.random() * W);
    const cy = Math.floor(Math.random() * H);
    const r = (Math.random() * 1.2 + 0.3).toFixed(1);
    const cols = ["#ffffff","#00ffcc","#ffe566","#ff6ef7","#60a5fa"];
    const dur = (Math.random() * 2 + 1.5).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${cols[i%5]}">
      <animate attributeName="opacity" values="0.15;0.9;0.15" dur="${dur}s" repeatCount="indefinite"/>
    </circle>`;
  }).join("");

  // Stats
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) streak++;
    else break;
  }
  const activeDays = days.filter(d => d.contributionCount > 0).length;
  const avg = (total / n).toFixed(1);

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="40%" cy="50%" r="80%">
      <stop offset="0%" stop-color="#040d1e"/>
      <stop offset="100%" stop-color="#010308"/>
    </radialGradient>

    <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="35%" stop-color="#ffffff"/>
      <stop offset="70%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#ff007f"/>
    </linearGradient>

    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="30%" stop-color="#2563eb"/>
      <stop offset="60%" stop-color="#00e5ff"/>
      <stop offset="100%" stop-color="#00ff88"/>
    </linearGradient>

    <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.25"/>
      <stop offset="60%" stop-color="#7c3aed" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>

    <filter id="lineGlow" x="-10%" y="-80%" width="120%" height="260%">
      <feGaussianBlur stdDeviation="3.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="titleGlow" x="-5%" y="-80%" width="110%" height="260%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="nebula"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)" rx="16"/>

  <!-- Nebula blobs -->
  <ellipse cx="150" cy="180" rx="180" ry="100" fill="#7c3aed" opacity="0.04" filter="url(#nebula)"/>
  <ellipse cx="650" cy="160" rx="200" ry="110" fill="#0e7490" opacity="0.05" filter="url(#nebula)"/>
  <ellipse cx="430" cy="240" rx="160" ry="80" fill="#be185d" opacity="0.03" filter="url(#nebula)"/>

  <!-- Stars -->
  ${stars}

  <!-- Border -->
  <rect width="${W}" height="${H}" fill="none" stroke="#1a2d4a" stroke-width="1.2" rx="16"/>

  <!-- Title -->
  <text x="${W/2}" y="22" text-anchor="middle" font-size="15" font-weight="bold"
    fill="url(#titleGrad)" filter="url(#titleGlow)"
    font-family="'Courier New',monospace" letter-spacing="1.5">
    ✦ ${username}'s Contribution Galaxy ✦
  </text>
  <text x="${W/2}" y="37" text-anchor="middle" font-size="9"
    fill="#334d66" font-family="'Courier New',monospace" letter-spacing="4">
    LAST 30 DAYS · LIVE DATA
  </text>

  <!-- Stats row -->
  <g font-family="'Courier New',monospace">
    <text x="58" y="56" font-size="8.5" fill="#4a6080">TOTAL</text>
    <text x="58" y="68" font-size="15" font-weight="bold" fill="#00e5ff"
      filter="url(#lineGlow)">${total}</text>

    <text x="145" y="56" font-size="8.5" fill="#4a6080">STREAK</text>
    <text x="145" y="68" font-size="15" font-weight="bold" fill="#ffe066"
      filter="url(#lineGlow)">${streak}d</text>

    <text x="232" y="56" font-size="8.5" fill="#4a6080">ACTIVE</text>
    <text x="232" y="68" font-size="15" font-weight="bold" fill="#ff6ef7"
      filter="url(#lineGlow)">${activeDays}d</text>

    <text x="319" y="56" font-size="8.5" fill="#4a6080">AVG/DAY</text>
    <text x="319" y="68" font-size="15" font-weight="bold" fill="#00ff88"
      filter="url(#lineGlow)">${avg}</text>

    <text x="420" y="56" font-size="8.5" fill="#4a6080">BEST DAY</text>
    <text x="420" y="68" font-size="15" font-weight="bold" fill="#ff4da6"
      filter="url(#lineGlow)">${max}</text>
  </g>

  <!-- Grid lines -->
  ${gridLines}

  <!-- Y axis labels -->
  ${yLabels}

  <!-- X axis labels -->
  ${xLabels}

  <!-- Axes -->
  <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + chartH}"
    stroke="#1a2d4a" stroke-width="1.2"/>
  <line x1="${padLeft}" y1="${padTop + chartH}" x2="${W - padRight}" y2="${padTop + chartH}"
    stroke="#1a2d4a" stroke-width="1.2"/>

  <!-- Area fill -->
  <path d="${fillPath}" fill="url(#areaGrad)"/>

  <!-- Main line with glow -->
  <path d="${linePath}" fill="none" stroke="url(#lineGrad)"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
    filter="url(#lineGlow)"/>

  <!-- Data point dots -->
  <g filter="url(#dotGlow)">
    ${glowDots}
  </g>

  <!-- Today marker -->
  <line x1="${(padLeft + chartW).toFixed(1)}" y1="${padTop}"
    x2="${(padLeft + chartW).toFixed(1)}" y2="${padTop + chartH}"
    stroke="#ff007f" stroke-width="1" stroke-dasharray="3,4" opacity="0.5"/>
  <text x="${(padLeft + chartW - 2).toFixed(1)}" y="${padTop - 4}"
    font-size="8" fill="#ff4da6" font-family="'Courier New',monospace"
    text-anchor="end">TODAY</text>
</svg>`;
}

module.exports = async (req, res) => {
  const username = req.query.username || process.env.GITHUB_USERNAME || "snehalgarg05-cyber";
  const token = process.env.GITHUB_TOKEN;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");

  if (!token) {
    res.status(500).send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60">
      <rect width="400" height="60" fill="#040d1e" rx="8"/>
      <text x="200" y="35" text-anchor="middle" fill="#ff4da6"
        font-family="monospace" font-size="13">GITHUB_TOKEN not set</text>
    </svg>`);
    return;
  }

  try {
    const data = await fetchContributions(username, token);
    const user = data?.data?.user;
    if (!user) throw new Error("User not found");
    const calendar = user.contributionsCollection.contributionCalendar;
    const days = calendar.weeks.flatMap(w => w.contributionDays);
    const svg = buildSVG(days, calendar.totalContributions, user.login);
    res.status(200).send(svg);
  } catch (err) {
    res.status(500).send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60">
      <rect width="400" height="60" fill="#040d1e" rx="8"/>
      <text x="200" y="35" text-anchor="middle" fill="#ff4da6"
        font-family="monospace" font-size="13">Error: ${err.message}</text>
    </svg>`);
  }
};
