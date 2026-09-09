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
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on("error", reject);
    req.write(query);
    req.end();
  });
}

function getColor(count, max) {
  if (count === 0) return { fill: "#0d1117", stroke: "#1a2740" };
  const r = Math.min(count / Math.max(max, 1), 1);
  if (r < 0.25) return { fill: "#1a0a2e", stroke: "#7c3aed" };
  if (r < 0.5)  return { fill: "#0a1a4e", stroke: "#2563eb" };
  if (r < 0.75) return { fill: "#003344", stroke: "#00bcd4" };
  return { fill: "#003322", stroke: "#00ff88" };
}

function buildSVG(days, total, username) {
  const max = Math.max(...days.map(d => d.contributionCount), 1);

  // Standard GitHub graph layout
  // 7 rows (Sun-Sat), up to 31 cols
  // Group days into weeks
  const weeks = [];
  let week = [];
  days.forEach((d, i) => {
    week.push(d);
    if (week.length === 7 || i === days.length - 1) {
      weeks.push(week);
      week = [];
    }
  });

  const cellSize = 14;
  const cellGap = 3;
  const step = cellSize + cellGap;
  const padLeft = 36;
  const padTop = 90;
  const padRight = 20;
  const padBottom = 48;
  const cols = weeks.length;
  const W = padLeft + cols * step + padRight;
  const H = padTop + 7 * step + padBottom;

  // Day labels (left side)
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // Month labels (top)
  const monthsSeen = {};
  let monthLabels = "";
  weeks.forEach((wk, wi) => {
    wk.forEach(d => {
      const mo = new Date(d.date).toLocaleString("en", { month: "short" });
      if (!monthsSeen[mo]) {
        monthsSeen[mo] = true;
        const x = padLeft + wi * step;
        monthLabels += `<text x="${x}" y="${padTop - 6}" font-size="11"
          fill="#4dd0e1" font-family="'Courier New',monospace">${mo}</text>`;
      }
    });
  });

  // Cells
  let emptyCells = "";
  let glowCells = "";

  weeks.forEach((wk, wi) => {
    wk.forEach((d, ri) => {
      const x = padLeft + wi * step;
      const y = padTop + ri * step;
      const c = getColor(d.contributionCount, max);
      const pulse = d.contributionCount > 0;

      if (pulse) {
        glowCells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}"
          rx="3" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.2">
          <animate attributeName="opacity" values="0.8;1;0.8"
            dur="${(1.5 + Math.random()*2).toFixed(1)}s" repeatCount="indefinite"/>
        </rect>`;
      } else {
        emptyCells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}"
          rx="3" fill="${c.fill}" stroke="${c.stroke}" stroke-width="0.5" opacity="0.5"/>`;
      }
    });
  });

  // Day labels
  let dayLabelsSVG = "";
  [1, 3, 5].forEach(ri => {
    const y = padTop + ri * step + cellSize - 1;
    dayLabelsSVG += `<text x="${padLeft - 4}" y="${y}" font-size="9"
      fill="#4a6080" font-family="'Courier New',monospace"
      text-anchor="end">${dayNames[ri]}</text>`;
  });

  // Legend
  const lgColors = ["#0d1117","#1a0a2e","#0a1a4e","#003344","#003322"];
  const lgStrokes = ["#1a2740","#7c3aed","#2563eb","#00bcd4","#00ff88"];
  const lgY = H - 18;
  let legend = `<text x="${padLeft}" y="${lgY + 2}" font-size="9" fill="#4a6080"
    font-family="'Courier New',monospace" dominant-baseline="middle">Less</text>`;
  lgColors.forEach((fill, i) => {
    const lx = padLeft + 30 + i * (cellSize + 3);
    legend += `<rect x="${lx}" y="${lgY - 6}" width="${cellSize}" height="${cellSize}"
      rx="3" fill="${fill}" stroke="${lgStrokes[i]}" stroke-width="1"/>`;
  });
  const afterLg = padLeft + 30 + lgColors.length * (cellSize + 3) + 4;
  legend += `<text x="${afterLg}" y="${lgY + 2}" font-size="9" fill="#4a6080"
    font-family="'Courier New',monospace" dominant-baseline="middle">More</text>`;

  // Stats
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) streak++;
    else break;
  }
  const activeDays = days.filter(d => d.contributionCount > 0).length;

  // Stars
  const stars = Array.from({length: 30}, (_, i) => {
    const cx = Math.floor(Math.random() * W);
    const cy = Math.floor(Math.random() * H);
    const r = (Math.random() * 1.2 + 0.3).toFixed(1);
    const colors = ["#ffffff","#00ffcc","#ffe566","#ff6ef7","#60a5fa"];
    const col = colors[i % 5];
    const d1 = (Math.random()*2+1.5).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}">
      <animate attributeName="opacity" values="0.2;0.9;0.2" dur="${d1}s" repeatCount="indefinite"/>
    </circle>`;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#040d1e"/>
      <stop offset="100%" stop-color="#010308"/>
    </radialGradient>
    <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="35%" stop-color="#ffffff"/>
      <stop offset="70%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#ff007f"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="titleGlow" x="-10%" y="-60%" width="120%" height="220%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="nebula"><feGaussianBlur stdDeviation="28"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)" rx="14"/>

  <!-- Nebula -->
  <ellipse cx="${W*0.2}" cy="${H*0.5}" rx="140" ry="80" fill="#7c3aed" opacity="0.05" filter="url(#nebula)"/>
  <ellipse cx="${W*0.8}" cy="${H*0.5}" rx="140" ry="80" fill="#0e7490" opacity="0.05" filter="url(#nebula)"/>

  <!-- Stars -->
  ${stars}

  <!-- Border -->
  <rect width="${W}" height="${H}" fill="none" stroke="#1a2d4a" stroke-width="1" rx="14"/>

  <!-- Title -->
  <text x="${W/2}" y="22" text-anchor="middle" font-size="14" font-weight="bold"
    fill="url(#titleGrad)" filter="url(#titleGlow)"
    font-family="'Courier New',monospace" letter-spacing="1">
    ✦ ${username}'s Contribution Galaxy ✦
  </text>
  <text x="${W/2}" y="38" text-anchor="middle" font-size="9"
    fill="#4a6080" font-family="'Courier New',monospace" letter-spacing="3">
    LAST 30 DAYS
  </text>

  <!-- Stats -->
  <g font-family="'Courier New',monospace">
    <text x="${padLeft}" y="58" font-size="9" fill="#4a6080">CONTRIBUTIONS</text>
    <text x="${padLeft}" y="74" font-size="16" font-weight="bold" fill="#00e5ff" filter="url(#glow)">${total}</text>

    <text x="${padLeft+90}" y="58" font-size="9" fill="#4a6080">STREAK</text>
    <text x="${padLeft+90}" y="74" font-size="16" font-weight="bold" fill="#ffe066" filter="url(#glow)">${streak}d</text>

    <text x="${padLeft+170}" y="58" font-size="9" fill="#4a6080">ACTIVE DAYS</text>
    <text x="${padLeft+170}" y="74" font-size="16" font-weight="bold" fill="#ff6ef7" filter="url(#glow)">${activeDays}</text>

    <text x="${padLeft+260}" y="58" font-size="9" fill="#4a6080">BEST DAY</text>
    <text x="${padLeft+260}" y="74" font-size="16" font-weight="bold" fill="#00ff88" filter="url(#glow)">${max}</text>
  </g>

  <!-- Month labels -->
  ${monthLabels}

  <!-- Day labels -->
  ${dayLabelsSVG}

  <!-- Empty cells -->
  ${emptyCells}

  <!-- Active cells with glow -->
  <g filter="url(#glow)">${glowCells}</g>

  <!-- Legend -->
  ${legend}
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
