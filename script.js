const csvPath = "fallout_steam_concurrent_players_2016_2025.csv";
const chart = document.querySelector("#chart");
const list = document.querySelector("#game-list");
const status = document.querySelector("#status");
const spikeToggle = document.querySelector("#spike-toggle");
const viewSelect = document.querySelector("#view-select");
const chartCard = document.querySelector(".chart-card");
const zoomToggle = document.querySelector("#zoom-toggle");
const chartSummary = document.querySelector("#chart-summary");
let games = [];
let showSpikes = false;
let selectedView = "yearly";
let zoomScale = 1;
let zoomOffsetX = 0;
let zoomOffsetY = 0;
const maxZoomScale = 1.75;
const zoomStep = 0.1;
const releaseDates = {
  "Fallout: A Post Nuclear Role Playing Game": "1997-09-30",
  "Fallout 2": "1998-10-29",
  "Fallout Tactics: Brotherhood of Steel": "2001-03-15",
  "Fallout 3: Game of the Year Edition": "2008-10-28",
  "Fallout: New Vegas": "2010-10-19",
  "Fallout Shelter": "2015-06-14",
  "Fallout 4": "2015-11-10",
  "Fallout 76": "2018-11-14"
};
const iconPaths = {
  "Fallout 2": "assets/icons/Fallout_2.png",
  "Fallout 3: Game of the Year Edition": "assets/icons/fallout_3.png",
  "Fallout 4": "assets/icons/Fallout_4.png",
  "Fallout 76": "assets/icons/Fallout_76.png",
  "Fallout Shelter": "assets/icons/Fallout_Shelter.png",
  "Fallout Tactics: Brotherhood of Steel": "assets/icons/Fallout_Tactics.png",
  "Fallout: A Post Nuclear Role Playing Game": "assets/icons/fallout_1.png",
  "Fallout: New Vegas": "assets/icons/fallout_newvegas.png"
};

function parseCSV(text) {
  const rows = [], row = []; let cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      if (cell || row.length) { row.push(cell); rows.push(row.splice(0)); cell = ""; }
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift().map(header => header.replace(/^\uFEFF/, ""));
  return rows.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
}

function formatNumber(value) { return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function formatPeriod(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(`${value}-01T00:00:00`));
}
function escapeXml(value) { return value.replace(/[<>&'"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char])); }
function setZoom(scale, pointerX, pointerY) {
  const previousScale = zoomScale;
  const bounds = chart.getBoundingClientRect();
  const baseLeft = bounds.left - zoomOffsetX;
  const baseTop = bounds.top - zoomOffsetY;
  if (pointerX !== undefined && pointerY !== undefined) {
    zoomOffsetX = pointerX - baseLeft - (pointerX - baseLeft - zoomOffsetX) * (scale / previousScale);
    zoomOffsetY = pointerY - baseTop - (pointerY - baseTop - zoomOffsetY) * (scale / previousScale);
  }
  zoomScale = Math.min(maxZoomScale, scale);
  if (zoomScale === 1) {
    zoomOffsetX = 0;
    zoomOffsetY = 0;
  }
  chart.style.transform = `translate(${zoomOffsetX}px, ${zoomOffsetY}px) scale(${zoomScale})`;
}
function updateChartSummary(visible, rowsForGame, isMonthly) {
  const records = visible.flatMap(game => rowsForGame(game).map(row => ({ game: game.game, row })));
  const best = records.reduce((highest, record) => (
    Number(record.row.peak_concurrent_players) > Number(highest.row.peak_concurrent_players) ? record : highest
  ));
  const period = isMonthly ? formatPeriod(best.row.month) : best.row.displayPeriod;
  const label = isMonthly ? "month" : "year";
  chartSummary.textContent = `Most successful ${label}: ${best.game} in ${period}, with ${formatNumber(best.row.peak_concurrent_players)} peak players.`;
}
function tooltipMarkup(name, iconX, iconY) {
  const words = name.split(" ");
  const lines = [];
  let line = "";
  words.forEach(word => {
    if ((line + " " + word).trim().length > 20 && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  });
  if (line) lines.push(line);
  const x = Math.max(18, Math.min(1582, iconX));
  const textAnchor = x < 180 ? "start" : x > 1420 ? "end" : "middle";
  const aboveY = iconY - 30 - (lines.length - 1) * 14;
  const y = aboveY < 18 ? iconY + 52 : aboveY;
  const tspans = lines.map((lineText, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : 14}">${escapeXml(lineText)}</tspan>`).join("");
  return `<text x="${x}" y="${y}" class="icon-tooltip" text-anchor="${textAnchor}">${tspans}</text>`;
}
function pointTooltipMarkup(row, x, y) {
  const tooltipX = Math.max(18, Math.min(1582, x + 12));
  const textAnchor = tooltipX > 1380 ? "end" : "start";
  const tooltipY = Math.max(28, Math.min(1350, y - 12));
  return `<text x="${tooltipX}" y="${tooltipY}" class="point-tooltip" text-anchor="${textAnchor}"><tspan x="${tooltipX}" dy="0">${escapeXml(formatPeriod(row.month))}</tspan><tspan x="${tooltipX}" dy="14">${formatNumber(row.peak_concurrent_players)} players</tspan></text>`;
}
function buildData(rows) {
  return [...new Set(rows.map(row => row.game))].map(game => {
    const months = rows.filter(row => row.game === game).sort((a, b) => a.month.localeCompare(b.month));
    const yearly = [...new Set(months.map(row => row.year))].map(year => {
      const yearRows = months.filter(row => row.year === year);
      return { ...yearRows.reduce((highest, row) => Number(row.peak_concurrent_players) > Number(highest.peak_concurrent_players) ? row : highest), month: year, displayPeriod: year };
    });
    const premiereIndex = months.findIndex(row => row.tv_show_premiere_month === "yes");
    const premiere = months[premiereIndex];
    const previous = months[premiereIndex - 1];
    return { game, months, yearly, premiere, previous, spike: premiere && previous && Number(premiere.peak_concurrent_players) > Number(previous.peak_concurrent_players) };
  }).sort((a, b) => releaseDates[a.game].localeCompare(releaseDates[b.game]));
}
function draw() {
  const visible = showSpikes ? games.filter(game => game.spike) : games;
  const isMonthly = selectedView !== "yearly";
  const rowsForGame = game => isMonthly ? game.months.filter(row => row.year === selectedView) : game.yearly;
  const max = Math.max(...visible.flatMap(game => rowsForGame(game).map(row => Number(row.peak_concurrent_players))));
  const cx = 800, cy = 700;
  const periodLabel = `${isMonthly ? `${selectedView} monthly` : "yearly"} players`.toUpperCase();
  updateChartSummary(visible, rowsForGame, isMonthly);
  let markup = `<circle cx="${cx}" cy="${cy}" r="46" fill="#36538b"/><text x="${cx}" y="${cy - 2}" class="center-label">PEAK</text><text x="${cx}" y="${cy + 19}" class="month-label">${periodLabel}</text>`;
  visible.forEach((game, gameIndex) => {
    const angle = (gameIndex / Math.max(visible.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const lineRadius = 720;
    const gx = cx + Math.cos(angle) * lineRadius, gy = cy + Math.sin(angle) * lineRadius;
    const color = game.premiere ? "var(--accent)" : "var(--accent-2)";
    markup += `<line x1="${cx}" y1="${cy}" x2="${gx}" y2="${gy}" stroke="${color}" opacity=".28"/>`;
    const plottedRows = rowsForGame(game).map((row, monthIndex) => ({ row, monthIndex }));
    const minimumDistance = 100;
    const maximumDistance = 500;
    const spacing = plottedRows.length > 1
      ? (maximumDistance - minimumDistance) / (plottedRows.length - 1)
      : 0;
    plottedRows.forEach((point, pointIndex) => {
      const { row, monthIndex } = point;
      const distance = minimumDistance + pointIndex * spacing;
      const x = cx + Math.cos(angle) * distance, y = cy + Math.sin(angle) * distance;
      const isPremiere = row.tv_show_premiere_month === "yes";
      const isShowCorrelation = game.spike && (isPremiere || (!isMonthly && row.year === "2024"));
      const size = 3 + Math.sqrt(Number(row.peak_concurrent_players) / max) * 15;
      const pointColor = showSpikes && isShowCorrelation ? "#EE4B2B" : (isPremiere ? "var(--accent)" : color);
      markup += `<g class="data-point" tabindex="0"><circle cx="${x}" cy="${y}" r="${size}" fill="${pointColor}" opacity="${isPremiere || !isMonthly || monthIndex % 3 === 0 ? 1 : .55}"><title>${escapeXml(game.game)} — ${row.displayPeriod || row.month}: peak ${formatNumber(row.peak_concurrent_players)}</title></circle>${pointTooltipMarkup(row, x, y)}</g>`;
      if (showSpikes && isPremiere && game.spike) markup += `<circle class="spike-ring" cx="${x}" cy="${y}" r="${size + 4}"/>`;
    });
    const iconRadius = 660;
    const iconX = cx + Math.cos(angle) * iconRadius;
    const iconY = cy + Math.sin(angle) * iconRadius;
    const iconPath = iconPaths[game.game];
    const iconSize = 150;
    markup += `<g class="game-icon" tabindex="0"><title>${escapeXml(game.game)}</title><svg class="icon-container" x="${iconX - iconSize / 2}" y="${iconY - iconSize / 2}" width="${iconSize}" height="${iconSize}" viewBox="0 0 150 150"><image class="icon-image" href="${iconPath}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"/></svg>${tooltipMarkup(game.game, iconX, iconY)}</g>`;
  });
  chart.innerHTML = markup;
}
function renderIndex() {
  list.innerHTML = games.map((game, index) => `<div><button class="game-button" data-index="${index}" aria-expanded="false"><span>${escapeXml(game.game)}</span><small>${game.months.length} months</small></button><div class="details" id="details-${index}">${game.premiere ? `<strong>Premiere:</strong> ${game.premiere.month}<br><strong>Premiere peak:</strong> ${formatNumber(game.premiere.peak_concurrent_players)}<br><strong>Prior month peak:</strong> ${formatNumber(game.previous.peak_concurrent_players)}<br><strong>Spike:</strong> ${game.spike ? "yes" : "no"}<br><a href="${game.premiere.source_url}" target="_blank" rel="noreferrer">source</a>` : "No premiere month marked in the CSV."}</div></div>`).join("");
  list.querySelectorAll(".game-button").forEach(button => button.addEventListener("click", () => {
    const details = document.querySelector(`#details-${button.dataset.index}`);
    const open = details.classList.toggle("open");
    button.setAttribute("aria-expanded", open);
  }));
}
function populateViewSelect() {
  const years = [...new Set(games.flatMap(game => game.months.map(row => row.year)))].sort();
  viewSelect.innerHTML = `<option value="yearly">Yearly overview</option>${years.map(year => `<option value="${year}">${year} monthly view</option>`).join("")}`;
}
spikeToggle.addEventListener("click", () => { showSpikes = !showSpikes; spikeToggle.setAttribute("aria-pressed", showSpikes); draw(); });
viewSelect.addEventListener("change", () => { selectedView = viewSelect.value; draw(); });
zoomToggle.addEventListener("click", () => {
  const active = zoomToggle.getAttribute("aria-pressed") !== "true";
  zoomToggle.setAttribute("aria-pressed", active);
  if (!active) setZoom(1);
});
chartCard.addEventListener("wheel", event => {
  if (zoomToggle.getAttribute("aria-pressed") !== "true") return;
  event.preventDefault();
  event.stopPropagation();
  const nextScale = Math.max(1, Math.min(maxZoomScale, zoomScale + (event.deltaY < 0 ? zoomStep : -zoomStep)));
  if (nextScale === zoomScale) return;
  setZoom(nextScale, event.clientX, event.clientY);
}, { passive: false });
fetch(csvPath).then(response => { if (!response.ok) throw new Error(`CSV request failed (${response.status})`); return response.text(); })
  .then(text => { games = buildData(parseCSV(text)); populateViewSelect(); renderIndex(); draw(); })
  .catch(error => { status.textContent = "Could not load the CSV."; console.error(error); });
