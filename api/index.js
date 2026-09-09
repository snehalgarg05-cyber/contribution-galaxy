const https = require("https");

// ─── GitHub GraphQL fetch ────────────────────────────────────────────────────
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
        name
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
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(query);
    req.end();
  });
}

// ─── Color scale ─────────────────────────────────────────────────────────────
function getColor(count, max) {
  if (count === 0) return { fill: "#0d1117", stroke: "#1a2740", glow: "none" };
  const ratio = Math.min(count / Math.max(max, 1), 1);

  if (ratio < 0.2)
    return { fill: "#1a0a2e", stroke: "#4a007266", glow: "#7c3aed33" };
  if (ratio < 0.4)
    return { fill: "#2d0a5e", stroke: "#7c3aed", glow: "#7c3aed66" };
  if (ratio < 0.6)
    return { fill: "#0a1a4e", stroke: "#2563eb", glow: "#3b82f666" };
  if (ratio < 0.8)
    return { fill: "#003344", stroke: "#00bcd4", glow: "#00e5ff88" };
  return { fill: "#003322", stroke: "#00ff88", glow: "#00ff88cc" };
}

// ─── SVG Generator ───────────────────────────────────────────────────────────
function buildSVG(days, total, username) {
  const max = Math.max(...days.map((d) => d.contributionCount), 1);

  // Layout
  const cellSize = 13;
  const cellGap = 3;
  const step = cellSize + cellGap;
  const cols = Math.ceil(days.length / 7);
  const rows = 7;
  const padLeft = 48;
  const padTop = 80;
  const padRight = 24;
  const padBottom = 56;
  const W = padLeft + cols * step + padRight;
  const H = padTop + rows * step + padBottom;

  // Day labels
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Month labels
  const monthMap = {};
  days.forEach((d, i) => {
    const col = Math.floor(i / 7);
    const mo = new Date(d.date).toLocaleString("en", { month: "short" });
    if (!monthMap[mo]) monthMap[mo] = col;
  });

  // Build cells
  let cells = "";
  let glowCells = "";

  days.forEach((d, i) => {
    const col = Math.floor(i / 7);
    const row = i % 7;
    const x = padLeft + col * step;
    const y = padTop + row * step;
    const c = getColor(d.contributionCount, max);
    const id = `c${i}`;

    if (c.glow !== "none") {
      glowCells += `
        <rect id="${id}" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}"
          rx="3" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1">
          <animate attributeName="opacity" values="0.85;1;0.85"
            dur="${1.5 + Math.random() * 2}s" repeatCount="indefinite"/>
        </rect>`;
    } else {
      cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}"
        rx="3" fill="${c.fill}" stroke="${c.stroke}" stroke-width="0.5" opacity="0.6"/>`;
    }
  });

  // Month labels
  let monthLabels = "";
  Object.entries(monthMap).forEach(([mo, col]) => {
    const x = padLeft + col * step;
    monthLabels += `<text x="${x}" y="${padTop - 8}" font-size="10"
      fill="#4dd0e1" font-family="'Courier New',monospace" opacity="0.9">${mo}</text>`;
  });

  // Day labels
  let dayLabelsSVG = "";
  [1, 3, 5].forEach((row) => {
    const y = padTop + row * step + cellSize - 2;
    dayLabelsSVG += `<text x="${padLeft - 6}" y="${y}" font-size="9"
      fill="#4a6080" font-family="'Courier New',monospace"
      text-anchor="end">${dayLabels[row]}</text>`;
  });

  // Legend
  const legendColors = [
    "#0d1117",
    "#2d0a5e",
    "#0a1a4e",
    "#003344",
    "#003322",
  ];
  const legendStrokes = [
    "#1a2740",
    "#7c3aed",
    "#2563eb",
    "#00bcd4",
    "#00ff88",
  ];
  const legendLabels = ["0", "1-2", "3-5", "6-9", "10+"];
  let legend = `<text x="${padLeft}" y="${H - 14}" font-size="9"
    fill="#4a6080" font-family="'Courier New',monospace">Less</text>`;
  legendColors.forEach((fill, i) => {
    const x = padLeft + 32 + i * 18;
    legend += `<rect x="${x}" y="${H - 26}" width="${cellSize}" height="${cellSize}"
      rx="3" fill="${fill}" stroke="${legendStrokes[i]}" stroke-width="1"/>`;
  });
  legend += `<text x="${padLeft + 32 + legendColors.length * 18 + 4}" y="${H - 14}"
    font-size="9" fill="#4a6080" font-family="'Courier New',monospace">More</text>`;

  // Streak calc
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) currentStreak++;
    else break;
  }

  // Stats bar
  const statsY = padTop - 38;
  const activeCount = days.filter((d) => d.contributionCount > 0).length;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#040d1e"/>
      <stop offset="100%" stop-color="#010308"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="titleGlow" x="-10%" y="-50%" width="120%" height="200%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="40%" stop-color="#ffffff"/>
      <stop offset="80%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#ff007f"/>
    </linearGradient>
    <filter id="nebula"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)" rx="14"/>

  <!-- Nebula -->
  <ellipse cx="${W * 0.2}" cy="${H * 0.4}" rx="120" ry="70"
    fill="#7c3aed" opacity="0.04" filter="url(#nebula)"/>
  <ellipse cx="${W * 0.75}" cy="${H * 0.6}" rx="150" ry="80"
    fill="#0e7490" opacity="0.05" filter="url(#nebula)"/>
  <ellipse cx="${W * 0.5}" cy="${H * 0.2}" rx="180" ry="60"
    fill="#be185d" opacity="0.04" filter="url(#nebula)"/>

  <!-- Stars -->
  ${Array.from(
    { length: 28 },
    (_, i) => `
  <circle cx="${Math.floor(Math.random() * W)}" cy="${Math.floor(Math.random() * H)}"
    r="${(Math.random() * 1.2 + 0.4).toFixed(1)}"
    fill="${["#ffffff", "#00ffcc", "#ffe566", "#ff6ef7", "#60a5fa"][i % 5]}"
    opacity="${(Math.random() * 0.5 + 0.3).toFixed(2)}">
    <animate attributeName="opacity"
      values="${(Math.random() * 0.3 + 0.2).toFixed(2)};${(Math.random() * 0.5 + 0.5).toFixed(2)};${(Math.random() * 0.3 + 0.2).toFixed(2)}"
      dur="${(Math.random() * 2 + 1.5).toFixed(1)}s" repeatCount="indefinite"/>
  </circle>`
  ).join("")}

  <!-- Border -->
  <rect width="${W}" height="${H}" fill="none" stroke="#1a2d4a"
    stroke-width="1" rx="14" opacity="0.8"/>

  <!-- Title -->
  <text x="${W / 2}" y="26" text-anchor="middle" font-size="14" font-weight="bold"
    fill="url(#titleGrad)" filter="url(#titleGlow)"
    font-family="'Courier New',monospace" letter-spacing="1">
    ✦ ${username}'s Contribution Galaxy ✦
  </text>
  <text x="${W / 2}" y="42" text-anchor="middle" font-size="9"
    fill="#4a6080" font-family="'Courier New',monospace" letter-spacing="3">
    LAST 30 DAYS
  </text>

  <!-- Stats -->
  <g font-family="'Courier New',monospace">
    <text x="${padLeft}" y="${statsY}" font-size="9" fill="#4a6080">TOTAL</text>
    <text x="${padLeft}" y="${statsY + 14}" font-size="15" font-weight="bold"
      fill="#00e5ff" filter="url(#glow)">${total}</text>

    <text x="${padLeft + 68}" y="${statsY}" font-size="9" fill="#4a6080">STREAK</text>
    <text x="${padLeft + 68}" y="${statsY + 14}" font-size="15" font-weight="bold"
      fill="#ffe066" filter="url(#glow)">${currentStreak}d</text>

    <text x="${padLeft + 136}" y="${statsY}" font-size="9" fill="#4a6080">ACTIVE DAYS</text>
    <text x="${padLeft + 136}" y="${statsY + 14}" font-size="15" font-weight="bold"
      fill="#ff6ef7" filter="url(#glow)">${activeCount}</text>

    <text x="${padLeft + 222}" y="${statsY}" font-size="9" fill="#4a6080">BEST DAY</text>
    <text x="${padLeft + 222}" y="${statsY + 14}" font-size="15" font-weight="bold"
      fill="#00ff88" filter="url(#glow)">${max}</text>
  </g>

  <!-- Month labels -->
  ${monthLabels}

  <!-- Day labels -->
  ${dayLabelsSVG}

  <!-- Empty cells -->
  ${cells}

  <!-- Glowing active cells -->
  <g filter="url(#glow)">
    ${glowCells}
  </g>

  <!-- Legend -->
  ${legend}

  <!-- Bottom line -->
  <line x1="${padLeft}" y1="${H - 4}" x2="${W - padRight}" y2="${H - 4}"
    stroke="#1a2d4a" stroke-width="0.5" opacity="0.6"/>
</svg>`;
}

// ─── Vercel handler ──────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  const username =
    req.query.username ||
    process.env.GITHUB_USERNAME ||
    "snehalgarg05-cyber";
  const token = process.env.GITHUB_TOKEN;

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");

  if (!token) {
    res.status(500).send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60">
      <rect width="400" height="60" fill="#040d1e" rx="8"/>
      <text x="200" y="35" text-anchor="middle" fill="#ff4da6"
        font-family="monospace" font-size="13">GITHUB_TOKEN not set in env vars</text>
    </svg>`);
    return;
  }

  try {
    const data = await fetchContributions(username, token);
    const user = data?.data?.user;

    if (!user) {
      throw new Error("User not found");
    }

    const calendar =
      user.contributionsCollection.contributionCalendar;
    const total = calendar.totalContributions;
    const days = calendar.weeks.flatMap((w) => w.contributionDays);

    const svg = buildSVG(days, total, user.login);
    res.status(200).send(svg);
  } catch (err) {
    res.status(500).send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60">
      <rect width="400" height="60" fill="#040d1e" rx="8"/>
      <text x="200" y="35" text-anchor="middle" fill="#ff4da6"
        font-family="monospace" font-size="13">Error: ${err.message}</text>
    </svg>`);
  }
};
