// Pure computation: turn config + HiBob data into everything the renderer
// needs. No I/O here, so it is easy to test.

import { MONTHS, parseISO, iso, businessDays } from './dates.js';

export function buildModel(config, people, whosout, [winStart, winEnd]) {
  const days = businessDays(winStart, winEnd);
  if (!days.length) throw new Error('empty window');
  const N = days.length;
  const dayIndex = new Map(days.map((d, i) => [iso(d), i]));
  const idx = (s) => (dayIndex.has(s) ? dayIndex.get(s) : null);

  const warnings = [];
  const withEmail = people.filter((p) => p.email);
  const emailToId = new Map(withEmail.map((p) => [p.email.toLowerCase(), p.id]));
  const emailToName = new Map(withEmail.map((p) => [p.email.toLowerCase(), p.firstName || p.displayName]));

  // Resolved display name: config `name` wins, else the HiBob first name, else the email.
  const nameOf = (m) => m.name || emailToName.get(m.email.toLowerCase()) || m.email;

  // person -> Set(dayColumn) of days they are out
  const grid = new Map(config.members.map((m) => [m.email, new Set()]));
  const place = (email, day) => {
    const i = idx(iso(day));
    if (i !== null) grid.get(email).add(i);
  };

  // 1) HiBob bookings, matched by email -> employee id
  const idToMembers = new Map();
  for (const m of config.members) {
    const id = emailToId.get(m.email.toLowerCase());
    if (!id) { warnings.push(`no HiBob match for ${m.email} — only manual entries will show`); continue; }
    if (!idToMembers.has(id)) idToMembers.set(id, []);
    idToMembers.get(id).push(m.email);
  }
  for (const e of whosout) {
    const emails = idToMembers.get(e.employeeId);
    if (!emails) continue;
    for (const day of businessDays(parseISO(e.startDate), parseISO(e.endDate)))
      for (const email of emails) place(email, day);
  }
  const bobDays = new Map([...grid].map(([email, s]) => [email, new Set(s)]));

  // 2) Manual additions — trust HiBob on overlap, warn.
  for (const man of config.manual || []) {
    if (!grid.has(man.email)) { warnings.push(`manual entry for unlisted member '${man.email}' ignored`); continue; }
    const mdays = businessDays(parseISO(man.start), parseISO(man.end)).filter((d) => idx(iso(d)) !== null);
    const clash = mdays.filter((d) => bobDays.get(man.email).has(idx(iso(d))));
    if (clash.length)
      warnings.push(`${man.email} manual ${man.start}..${man.end} overlaps HiBob on ` +
        `${clash.map((d) => iso(d)).join(', ')} — kept HiBob`);
    for (const d of mdays) place(man.email, d);
  }

  // 3) busy areas — book everyone as out (real bookings already cover their own days).
  for (const area of config.areas || []) {
    if (!area.busy) continue;
    for (const m of config.members)
      for (const day of businessDays(parseISO(area.start), parseISO(area.end)))
        place(m.email, day);
  }

  // ---- per-member rows: merge consecutive days into bars, resolve names ----
  const rows = config.members.map((m) => {
    const runs = [];
    for (const i of [...grid.get(m.email)].sort((a, b) => a - b)) {
      const last = runs[runs.length - 1];
      if (last && i === last.end + 1) last.end = i;
      else runs.push({ start: i, end: i });
    }
    const off = grid.get(m.email).size;
    return { name: nameOf(m), tag: m.tag || null, total: off, working: N - off, pct: N ? (N - off) / N : 0, runs };
  });

  // ---- squad capacity per business day (1 = nobody out) + overall ----
  const M = config.members.length;
  const dayOut = new Array(N).fill(0);
  for (const m of config.members) for (const i of grid.get(m.email)) dayOut[i]++;
  const capacity = dayOut.map((o) => (M ? (M - o) / M : 0));
  const overall = M ? rows.reduce((s, r) => s + r.working, 0) / (M * N) : 0;

  // ---- month segments + boundaries ----
  const monthSegs = [];
  const monthBoundaries = [];
  let m0 = 0;
  for (let i = 1; i <= N; i++) {
    if (i === N || days[i].getUTCMonth() !== days[m0].getUTCMonth() || days[i].getUTCFullYear() !== days[m0].getUTCFullYear()) {
      monthSegs.push({ label: MONTHS[days[m0].getUTCMonth()], start: m0, count: i - m0 });
      if (i !== N) monthBoundaries.push(i);
      m0 = i;
    }
  }

  // ---- weeks: whole weeks of 5 business days, so week k = columns [5k, 5k+5) ----
  const weekSegs = [];
  for (let k = 0; k * 5 < N; k++) {
    const start = k * 5;
    weekSegs.push({ label: `W${k + 1}`, start, count: Math.min(5, N - start) });
  }
  const weekLines = weekSegs.map((w) => w.start).filter((s) => s > 0);

  // The full window (incl. the trailing weekend) so the client "now" script can
  // decide whether today falls inside this quarter.
  const window = [iso(winStart), iso(winEnd)];

  // ---- manual additions, resolved for the footer ----
  const memberOf = new Map(config.members.map((m) => [m.email, m]));
  const manual = (config.manual || []).map((m) => ({
    name: memberOf.has(m.email) ? nameOf(memberOf.get(m.email)) : m.email,
    start: m.start,
    end: m.end,
  }));

  return { days, N, dayIndex, rows, monthSegs, monthBoundaries, weekSegs, weekLines, capacity, overall, window, manual, warnings };
}
