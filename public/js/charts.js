// D3 renderers. Each takes a container element and a plain spec; colors come from CSS tokens.
/* global d3 */

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const seriesColor = (i) => css(`--series-${(i % 8) + 1}`);

let tipEl;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tooltip";
    tipEl.setAttribute("role", "status");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
// rows: [{value, label, color?, logo?}] ; header: string
function showTip(evt, header, rows) {
  const t = tip();
  t.replaceChildren();
  const h = document.createElement("div");
  h.className = "tt-head";
  h.textContent = header;
  t.appendChild(h);
  for (const r of rows) {
    const line = document.createElement("div");
    line.className = "tt-row";
    if (r.color) {
      const k = document.createElement("span");
      k.className = "tt-key";
      k.style.background = r.color;
      line.appendChild(k);
    }
    if (r.logo) {
      const img = document.createElement("img");
      img.src = r.logo; img.alt = ""; img.className = "tt-logo";
      line.appendChild(img);
    }
    const v = document.createElement("strong");
    v.textContent = r.value;
    const l = document.createElement("span");
    l.className = "tt-label";
    l.textContent = r.label;
    line.append(v, l);
    t.appendChild(line);
  }
  t.style.display = "block";
  const pad = 14, w = t.offsetWidth, h2 = t.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h2 > window.innerHeight - 8) y = evt.clientY - h2 - pad;
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${Math.max(8, y)}px`;
}
export function hideTip() { if (tipEl) tipEl.style.display = "none"; }

export function formatter(values, pct) {
  const ext = d3.max(values.map((v) => Math.abs(v ?? 0))) || 0;
  const f = ext >= 100 ? d3.format(",.0f") : ext >= 10 ? d3.format(",.1f") : ext >= 1 ? d3.format(".2f") : d3.format(".3f");
  return pct ? (v) => (v == null ? "–" : `${d3.format(".1f")(v)}%`) : (v) => (v == null ? "–" : f(v));
}

function svgRoot(el, width, height) {
  return d3.select(el).append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height)
    .attr("class", "chart-svg").attr("role", "img");
}

function axes(g, x, y, width, height, m, { xTickFormat, yFmt, xTicks, xLabel, yLabel } = {}) {
  g.append("g").attr("class", "grid")
    .attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(width - m.l - m.r)).tickFormat(""))
    .call((s) => s.select(".domain").remove());
  g.append("g").attr("class", "axis y-axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(yFmt).tickSizeOuter(0))
    .call((s) => s.select(".domain").remove());
  const xa = x.bandwidth || x.step ? d3.axisBottom(x).tickValues(xTicks).tickFormat(xTickFormat) : d3.axisBottom(x).ticks(Math.max(2, Math.floor((width - m.l - m.r) / 75))).tickFormat(xTickFormat);
  g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${height - m.b})`).call(xa.tickSizeOuter(0));
  if (xLabel) g.append("text").attr("class", "axis-title").attr("x", (m.l + width - m.r) / 2).attr("y", height - 6).attr("text-anchor", "middle").text(xLabel);
  if (yLabel) g.append("text").attr("class", "axis-title").attr("transform", `translate(14,${(m.t + height - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle").text(yLabel);
}

// Greedy label placement: skip a label that would overlap one already placed.
function placeLabels(items, boxes = []) {
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const placed = [];
  for (const it of items) {
    const box = { x: it.x, y: it.y - it.h / 2, w: it.w, h: it.h };
    if (boxes.some((b) => hit(box, b)) || placed.some((p) => hit(box, p.box))) continue;
    placed.push({ ...it, box });
  }
  return placed;
}
const textWidth = (s, px = 12) => s.length * px * 0.58 + 4;

// ------------------------------------------------------------------ trend
// spec: { buckets:[{key,label,season}], panels:[{title, pct, series:[{id,label,color,logo,points:Map}], avg:Map|null}] }
export function renderTrend(el, spec) {
  el.replaceChildren();
  const width = Math.max(320, el.clientWidth);
  const narrow = width < 560;
  const height = spec.panels.length > 1 ? 280 : narrow ? 320 : 420;
  const keys = spec.buckets.map((b) => b.key);
  const byKey = new Map(spec.buckets.map((b) => [b.key, b]));
  const step = Math.max(1, Math.ceil(keys.length / Math.max(4, Math.floor(width / 70))));
  const xTicks = keys.filter((_, i) => i % step === 0);

  for (const panel of spec.panels) {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    if (spec.panels.length > 1) {
      const h = document.createElement("h3");
      h.className = "panel-title";
      h.textContent = panel.title;
      wrap.appendChild(h);
    }
    el.appendChild(wrap);
    const m = { t: 16, r: narrow ? 64 : 150, b: 34, l: 56 };
    const svg = svgRoot(wrap, width, height);
    svg.attr("aria-label", panel.title);
    const x = d3.scalePoint().domain(keys).range([m.l, width - m.r]).padding(0.3);
    const all = [];
    for (const s of panel.series) for (const v of s.points.values()) all.push(v);
    if (panel.avg) for (const v of panel.avg.values()) all.push(v);
    if (!all.length) { svg.append("text").attr("x", width / 2).attr("y", height / 2).attr("class", "empty").attr("text-anchor", "middle").text("No data for these filters"); continue; }
    const fmt = formatter(all, panel.pct);
    const [lo, hi] = d3.extent(all);
    const padY = (hi - lo || Math.abs(hi) || 1) * 0.08;
    const y = d3.scaleLinear().domain([lo - padY, hi + padY]).nice().range([height - m.b, m.t]);
    axes(svg, x, y, width, height, m, { xTicks, xTickFormat: (k) => byKey.get(k)?.label ?? k, yFmt: fmt });

    // season boundaries
    if (spec.buckets.some((b) => b.week != null)) {
      spec.buckets.forEach((b, i) => {
        if (i === 0 || spec.buckets[i - 1].season === b.season) return;
        const xx = (x(b.key) + x(spec.buckets[i - 1].key)) / 2;
        svg.append("line").attr("class", "season-rule").attr("x1", xx).attr("x2", xx).attr("y1", m.t).attr("y2", height - m.b);
        svg.append("text").attr("class", "season-tag").attr("x", xx + 4).attr("y", m.t + 10).text(b.season);
      });
    }

    const line = d3.line().defined((d) => d[1] != null).x((d) => x(d[0])).y((d) => y(d[1]));
    const toPts = (map) => keys.map((k) => [k, map.has(k) ? map.get(k) : null]);
    if (panel.avg) {
      svg.append("path").attr("class", "avg-line").attr("d", line(toPts(panel.avg)));
    }
    const dense = keys.length > 40;
    for (const s of panel.series) {
      const pts = toPts(s.points);
      // connect across byes: draw a faint link over gaps, solid where consecutive
      svg.append("path").attr("class", "series-gap").attr("stroke", s.color).attr("d", d3.line().x((d) => x(d[0])).y((d) => y(d[1]))(pts.filter((d) => d[1] != null)));
      svg.append("path").attr("class", "series-line").attr("stroke", s.color).attr("d", line(pts));
      if (!dense) {
        svg.append("g").selectAll("circle").data(pts.filter((d) => d[1] != null)).join("circle")
          .attr("class", "series-dot").attr("r", 3).attr("cx", (d) => x(d[0])).attr("cy", (d) => y(d[1])).attr("fill", s.color);
      }
    }

    // end labels: logo + name, nudged apart vertically
    const ends = panel.series.map((s) => {
      const last = keys.filter((k) => s.points.has(k)).pop();
      return last == null ? null : { s, k: last, v: s.points.get(last), y: y(s.points.get(last)) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    if (panel.avg && panel.avg.size) {
      const last = keys.filter((k) => panel.avg.has(k)).pop();
      ends.push({ s: { label: "League avg", avg: true }, k: last, v: panel.avg.get(last), y: y(panel.avg.get(last)) });
      ends.sort((a, b) => a.y - b.y);
    }
    const gap = 20;
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gap) ends[i].y = ends[i - 1].y + gap;
    const over = ends.length ? ends[ends.length - 1].y - (height - m.b) : 0;
    if (over > 0) ends.forEach((e) => (e.y -= over));
    const lx = width - m.r + 8;
    for (const e of ends) {
      svg.append("path").attr("class", "leader").attr("d", `M${x(e.k) + 4},${y(e.v)} L${lx - 2},${e.y}`);
      let tx = lx;
      if (e.s.logo) {
        svg.append("image").attr("href", e.s.logo).attr("x", lx).attr("y", e.y - 9).attr("width", 18).attr("height", 18);
        tx += 22;
      } else if (!e.s.avg) {
        svg.append("line").attr("x1", lx).attr("x2", lx + 14).attr("y1", e.y).attr("y2", e.y).attr("stroke", e.s.color).attr("stroke-width", 2);
        tx += 18;
      }
      if (!narrow || !e.s.logo) svg.append("text").attr("class", e.s.avg ? "end-label muted" : "end-label").attr("x", tx).attr("y", e.y + 4).text(e.s.short || e.s.label);
    }

    // crosshair + tooltip
    const cross = svg.append("line").attr("class", "crosshair").attr("y1", m.t).attr("y2", height - m.b).style("display", "none");
    svg.append("rect").attr("class", "hit").attr("x", m.l).attr("y", m.t).attr("width", width - m.l - m.r).attr("height", height - m.t - m.b)
      .on("pointermove", (evt) => {
        const [px] = d3.pointer(evt);
        let best = keys[0], bd = Infinity;
        for (const k of keys) { const d = Math.abs(x(k) - px); if (d < bd) { bd = d; best = k; } }
        cross.attr("x1", x(best)).attr("x2", x(best)).style("display", null);
        const rows = panel.series.filter((s) => s.points.has(best))
          .map((s) => ({ v: s.points.get(best), value: fmt(s.points.get(best)), label: s.label, color: s.color, logo: s.logo }))
          .sort((a, b) => b.v - a.v);
        if (panel.avg?.has(best)) rows.push({ value: fmt(panel.avg.get(best)), label: "League avg", color: css("--text-muted") });
        const b = byKey.get(best);
        showTip(evt, `${b.season}${b.week != null ? " · " + b.label.split(" ").slice(1).join(" ") : ""}${spec.panels.length > 1 ? " — " + panel.title : ""}`, rows);
      })
      .on("pointerleave", () => { cross.style("display", "none"); hideTip(); });
  }
}

// ------------------------------------------------------------------ scatter
// spec: { xLabel, yLabel, xPct, yPct, points:[{id,label,short,x,y,logo,sub}], fit, showLabels, isTeam }
export function renderScatter(el, spec) {
  el.replaceChildren();
  const width = Math.max(320, el.clientWidth);
  const narrow = width < 560;
  const height = narrow ? Math.round(width * 1.05) : Math.min(640, Math.max(420, Math.round(width * 0.62)));
  const m = { t: 20, r: 24, b: 48, l: 64 };
  const svg = svgRoot(el, width, height);
  svg.attr("aria-label", `${spec.yLabel} vs ${spec.xLabel}`);
  const pts = spec.points.filter((p) => p.x != null && p.y != null);
  if (!pts.length) {
    svg.append("text").attr("x", width / 2).attr("y", height / 2).attr("class", "empty").attr("text-anchor", "middle").text("No data for these filters");
    return;
  }
  const pad = (lo, hi) => { const d = (hi - lo) || Math.abs(hi) || 1; return [lo - d * 0.07, hi + d * 0.07]; };
  const x = d3.scaleLinear().domain(pad(...d3.extent(pts, (p) => p.x))).nice().range([m.l, width - m.r]);
  const y = d3.scaleLinear().domain(pad(...d3.extent(pts, (p) => p.y))).nice().range([height - m.b, m.t]);
  const fx = formatter(pts.map((p) => p.x), spec.xPct), fy = formatter(pts.map((p) => p.y), spec.yPct);
  axes(svg, x, y, width, height, m, { xTickFormat: fx, yFmt: fy, xLabel: spec.xLabel, yLabel: spec.yLabel });

  const mx = d3.mean(pts, (p) => p.x), my = d3.mean(pts, (p) => p.y);
  svg.append("line").attr("class", "mean-line").attr("x1", x(mx)).attr("x2", x(mx)).attr("y1", m.t).attr("y2", height - m.b);
  svg.append("line").attr("class", "mean-line").attr("x1", m.l).attr("x2", width - m.r).attr("y1", y(my)).attr("y2", y(my));

  if (spec.fit) {
    const [x0, x1] = x.domain();
    const clipY = (v) => Math.max(y.domain()[0], Math.min(y.domain()[1], v));
    // clip the fit line to the plot box
    const seg = [];
    for (let i = 0; i <= 50; i++) { const xv = x0 + ((x1 - x0) * i) / 50; const yv = spec.fit.a + spec.fit.b * xv; if (clipY(yv) === yv) seg.push([xv, yv]); }
    if (seg.length > 1) svg.append("path").attr("class", "fit-line").attr("d", d3.line().x((d) => x(d[0])).y((d) => y(d[1]))(seg));
  }

  const size = spec.isTeam ? (narrow ? 24 : 32) : pts.length > 60 ? 16 : 20;
  const g = svg.append("g");
  for (const p of pts) {
    if (p.logo) {
      g.append("image").attr("href", p.logo).attr("class", "pt-logo").attr("x", x(p.x) - size / 2).attr("y", y(p.y) - size / 2).attr("width", size).attr("height", size);
    } else {
      g.append("circle").attr("class", "pt-dot").attr("cx", x(p.x)).attr("cy", y(p.y)).attr("r", 5).attr("fill", seriesColor(0));
    }
    if (p.highlight) g.append("circle").attr("class", "pt-ring").attr("cx", x(p.x)).attr("cy", y(p.y)).attr("r", size / 2 + 4);
  }

  if (spec.showLabels) {
    const logoBoxes = pts.map((p) => ({ x: x(p.x) - size / 2, y: y(p.y) - size / 2, w: size, h: size }));
    // Label highlighted points first, then the most extreme ones.
    const order = [...pts].sort((a, b) => (b.highlight ? 1 : 0) - (a.highlight ? 1 : 0) ||
      Math.hypot((b.x - mx) / (x.domain()[1] - x.domain()[0]), (b.y - my) / (y.domain()[1] - y.domain()[0])) -
      Math.hypot((a.x - mx) / (x.domain()[1] - x.domain()[0]), (a.y - my) / (y.domain()[1] - y.domain()[0])));
    const items = order.map((p) => {
      const text = p.short || p.label, w = textWidth(text, 11);
      const right = x(p.x) + size / 2 + 3 + w < width - m.r;
      return { text, x: right ? x(p.x) + size / 2 + 3 : x(p.x) - size / 2 - 3 - w, y: y(p.y), w, h: 13, anchor: right ? "start" : "end" };
    });
    for (const l of placeLabels(items, logoBoxes)) {
      svg.append("text").attr("class", "pt-label").attr("x", l.anchor === "start" ? l.x : l.x + l.w).attr("y", l.y + 4).attr("text-anchor", l.anchor).text(l.text);
    }
  }

  // nearest-point hover
  const delaunay = d3.Delaunay.from(pts, (p) => x(p.x), (p) => y(p.y));
  const ring = svg.append("circle").attr("class", "hover-ring").attr("r", size / 2 + 5).style("display", "none");
  svg.append("rect").attr("class", "hit").attr("x", m.l).attr("y", m.t).attr("width", width - m.l - m.r).attr("height", height - m.t - m.b)
    .on("pointermove", (evt) => {
      const [px, py] = d3.pointer(evt);
      const i = delaunay.find(px, py);
      const p = pts[i];
      if (!p || Math.hypot(x(p.x) - px, y(p.y) - py) > 40) { ring.style("display", "none"); hideTip(); return; }
      ring.attr("cx", x(p.x)).attr("cy", y(p.y)).style("display", null);
      showTip(evt, p.label + (p.sub ? ` · ${p.sub}` : ""), [
        { value: fy(p.y), label: spec.yLabel },
        { value: fx(p.x), label: spec.xLabel },
        ...(p.extra || []),
      ]);
    })
    .on("pointerleave", () => { ring.style("display", "none"); hideTip(); });
}

// ------------------------------------------------------------------ bar
// spec: { label, pct, items:[{id,label,value,logo,sub}] } sorted already
export function renderBar(el, spec) {
  el.replaceChildren();
  const width = Math.max(320, el.clientWidth);
  const narrow = width < 560;
  const rowH = 26;
  const items = spec.items.filter((d) => d.value != null);
  const labelW = Math.min(narrow ? 150 : 230, Math.max(70, (d3.max(items, (d, i) => textWidth(`${i + 1}. ${d.label}`, 12)) || 40) + 28));
  const m = { t: 8, r: 64, b: 28, l: labelW + 8 };
  const height = m.t + m.b + Math.max(1, items.length) * rowH;
  const svg = svgRoot(el, width, height);
  svg.attr("aria-label", spec.label);
  if (!items.length) {
    svg.append("text").attr("x", width / 2).attr("y", height / 2).attr("class", "empty").attr("text-anchor", "middle").text("No data for these filters");
    return;
  }
  const fmt = formatter(items.map((d) => d.value), spec.pct);
  const lo = Math.min(0, d3.min(items, (d) => d.value)), hi = Math.max(0, d3.max(items, (d) => d.value));
  const x = d3.scaleLinear().domain([lo, hi]).nice().range([m.l, width - m.r]);
  const xt = Math.max(2, Math.floor((width - m.l - m.r) / 70));
  const yb = d3.scaleBand().domain(items.map((d) => d.id)).range([m.t, height - m.b]).paddingInner(0.25);
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height - m.b})`)
    .call(d3.axisBottom(x).ticks(xt).tickSize(-(height - m.t - m.b)).tickFormat("")).call((s) => s.select(".domain").remove());
  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(xt).tickFormat(fmt).tickSizeOuter(0));
  svg.append("line").attr("class", "baseline").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", height - m.b);
  const color = seriesColor(0);
  const r = 4;
  items.forEach((d, i) => {
    const y0 = yb(d.id), bh = yb.bandwidth(), x0 = x(0), x1 = x(d.value);
    const w = Math.abs(x1 - x0), left = Math.min(x0, x1);
    // rounded data end, square at the baseline
    const rr = Math.min(r, w / 2, bh / 2);
    const path = d.value >= 0
      ? `M${left},${y0}h${w - rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${bh - 2 * rr}a${rr},${rr} 0 0 1 -${rr},${rr}h-${w - rr}z`
      : `M${x0},${y0}h-${w - rr}a${rr},${rr} 0 0 0 -${rr},${rr}v${bh - 2 * rr}a${rr},${rr} 0 0 0 ${rr},${rr}h${w - rr}z`;
    const bar = svg.append("path").attr("class", d.highlight ? "bar hl" : "bar").attr("d", path).attr("fill", color);
    svg.append("text").attr("class", "bar-value").attr("x", d.value >= 0 ? x1 + 6 : x1 - 6).attr("y", y0 + bh / 2 + 4)
      .attr("text-anchor", d.value >= 0 ? "start" : "end").text(fmt(d.value));
    let lx = m.l - 8;
    svg.append("text").attr("class", d.highlight ? "bar-label hl" : "bar-label").attr("x", lx).attr("y", y0 + bh / 2 + 4).attr("text-anchor", "end").text(`${i + 1}. ${d.label}`);
    if (d.logo) svg.append("image").attr("href", d.logo).attr("x", 2).attr("y", y0 + bh / 2 - 9).attr("width", 18).attr("height", 18);
    svg.append("rect").attr("class", "hit").attr("x", 0).attr("y", y0 - 2).attr("width", width).attr("height", bh + 4)
      .on("pointermove", (evt) => { bar.classed("hover", true); showTip(evt, d.label + (d.sub ? ` · ${d.sub}` : ""), [{ value: fmt(d.value), label: spec.label }, ...(d.extra || [])]); })
      .on("pointerleave", () => { bar.classed("hover", false); hideTip(); });
  });
}
