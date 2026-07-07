# Quarter availability chart

Renders a group's availability for a Doist quarter as a self-contained HTML
chart: per-person time off (from HiBob, plus manual additions) as horizontal
bars on a business-day axis (weekends removed), plus per-week squad capacity,
per-member working days, deadline countdowns, and a live "now" marker.

## Requirements

- **Node.js ≥ 18** — no npm dependencies to install.
- **HiBob `bob` CLI**, installed and authenticated. The tool calls `bob people`
  and `bob whosout`; if `bob` is missing or not logged in, it says so.

## Install / run

You always pass an explicit `--config <path>`, and you need a `config.json` (see
[Configure](#configure)). Running with no `--config` prints an example you can
save and edit.

**Run without installing (npx), straight from GitHub:**

```bash
npx github:jacobo-doist/quarter-availability-chart --config config.json
```

**Install globally:**

```bash
npm i -g github:jacobo-doist/quarter-availability-chart
quarter-availability-chart --config config.json
```

**Clone for development:**

```bash
git clone git@github.com:jacobo-doist/quarter-availability-chart.git
cd quarter-availability-chart
cp config.example.json config.json          # then edit it (config.json is git-ignored)
npm start                                   # renders using ./config.json
# or explicitly:
node bin/quarter-availability-chart.js --config config.json --out mychart.html
```

Each run pulls people + time off from HiBob, writes `output.html` (or `--out`),
and prints its path. Open it in a browser — it is self-contained and shareable.

## The quarter window

The chart covers a Doist quarter as **whole weeks** (weeks start Monday):

- **Starts** on the first week whose days all fall inside the natural calendar
  quarter — i.e. the first Monday on or after the quarter's first day.
- **Ends** the week before the next quarter starts.

That yields a **12- or 13-week** quarter, derived entirely from the `quarter` in
the config.

## Members and HiBob matching

Members are identified by **email**. HiBob `whosout` reports bookings by employee
id (no email), so the tool uses `bob people --json --full` to map id → email (and
to read each person's first name). A member with no HiBob match still appears —
only their manual entries show, and a warning is printed.

## Configure

```json
{
  "group": "BE KLM",
  "quarter": "2026Q3",
  "eyebrow": "Squad availability — from HiBob",

  "members": [
    { "email": "jacobo@doist.com", "tag": "lead" },
    { "email": "thomas@doist.com" },
    { "email": "gil@doist.com", "name": "Gil" }
  ],

  "markers": [
    { "date": "2026-08-28", "label": "SOC2 deadline", "deadline": true }
  ],

  "areas": [
    { "start": "2026-07-20", "end": "2026-07-24", "label": "Doist Connect", "busy": true }
  ],

  "manual": [
    { "email": "thomas@doist.com", "start": "2026-09-22", "end": "2026-09-23" }
  ]
}
```

- **`group`** — shown in the title.
- **`quarter`** — `"YYYYQn"`. The window is derived from it (see above).
- **`eyebrow`** — optional small caption above the title.
- **`members`** — rows, in order. `{ email, name?, tag? }`. `email` is the HiBob
  match key; `name` is optional and defaults to the person's HiBob **first name**;
  `tag` is an optional label (e.g. `lead`).
- **`markers`** — vertical lines drawn at the **end** of the named day.
  `{ date, label, deadline? }`. Each gets a contrasting colour automatically.
  With `deadline: true`, the label shows a live "in N days" countdown (computed
  in the browser). A built-in **EOQ** deadline is always added on the quarter's
  last working day.
- **`areas`** — shaded, labelled date bands. `{ start, end, label, busy? }`.
  - `busy: true` — books **everyone** as out for the band (a retreat where no
    one is working), deferring to real bookings on days people already have off.
  - `busy: false` (default) — just a labelled band; individual time off is
    unaffected.
- **`manual`** — absences not in HiBob. `{ email, start, end }`.

## What the chart shows

- **Time-off bars** per member, labelled with the day count (full detail on hover).
- **Left of each row**: total days off. **Right of each row**: working days and %
  of the quarter's business days worked.
- **Bottom row**: squad **capacity per week** (100% = nobody out), each week
  labelled with its %.
- **Deadline markers** with a live countdown, plus the built-in **EOQ**.
- A **now** line and shaded elapsed region, computed in the browser at page load
  — so a saved chart stays current.
- An expandable **Config** section in the footer with the exact JSON used.

## Rules the tool applies

- Time outside the window is dropped.
- Half days count as full days.
- Consecutive days off merge into one bar.
- A `manual` entry overlapping a real HiBob booking defers to HiBob; a warning is
  printed (stderr and the chart footer).

## Options

```
quarter-availability-chart --config <path> [--out <path>]

  --config <path>   config file (required)
  --out <path>      output HTML file (default: output.html)
  -h, --help        show help
```

## Layout

| Path | What it is |
|------|------------|
| `bin/quarter-availability-chart.js` | Executable entry point (the `bin`). Thin — calls `src/cli.js`. |
| `src/cli.js` | Arg parsing and orchestration. |
| `src/dates.js` | Date helpers and the quarter-window rule. |
| `src/bob.js` | HiBob `bob` CLI wrapper (`people`, `whosout`). |
| `src/model.js` | Pure: config + HiBob data → chart model. |
| `src/render.js` | Pure: model → self-contained HTML. |
| `config.example.json` | Starter config to copy to `config.json` (which is git-ignored). |
| `output.html` | The chart (overwritten each run). Self-contained, shareable. |
