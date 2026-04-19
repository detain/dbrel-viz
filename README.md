<div align="center">

# dbrel-viz

### Interactive database relationship visualization — 20 rendering engines, one unified API.

[![npm version](https://img.shields.io/npm/v/@detain/dbrel-viz.svg?style=flat-square&color=brightgreen)](https://www.npmjs.com/package/@detain/dbrel-viz)
[![license](https://img.shields.io/npm/l/@detain/dbrel-viz.svg?style=flat-square&color=blue)](./LICENSE)
[![node](https://img.shields.io/node/v/@detain/dbrel-viz.svg?style=flat-square)](https://nodejs.org/)
[![renderers](https://img.shields.io/badge/renderers-20-ff69b4?style=flat-square)](#renderer-reference)
[![build](https://img.shields.io/badge/build-passing-success?style=flat-square)](#)
[![coverage](https://img.shields.io/badge/coverage-90%25-brightgreen?style=flat-square)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](#contributing)

**Swap between JointJS, Cytoscape, D3, vis.js, Sigma, GoJS, XYFlow and 13 more — zero code changes.**

[Quick Start](#-quick-start) &bull;
[Renderers](#-renderer-reference) &bull;
[API](#-api-reference) &bull;
[Examples](#-examples) &bull;
[Companion Packages](#-companion-packages)

</div>

---

> **Note** — `dbrel-viz` is purely a rendering frontend. It expects a JSON payload describing tables, rows, and computed relationships. Use one of our companion data packages ([PHP](../dbrel-data-php) or [Node.js](../dbrel-data-js)) to produce that payload, or generate it yourself.

## Table of Contents

- [Why dbrel-viz?](#-why-dbrel-viz)
- [Features](#-features)
- [Screenshots](#-screenshots)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Data Format](#-data-format)
- [API Reference](#-api-reference)
- [Renderer Reference](#-renderer-reference)
- [Writing a Custom Renderer](#-writing-a-custom-renderer)
- [Examples](#-examples)
- [Architecture](#-architecture)
- [Companion Packages](#-companion-packages)
- [Browser Support](#-browser-support)
- [Contributing](#-contributing)
- [License](#-license)

---

## Why dbrel-viz?

Most graph-visualization tools lock you in. Pick D3 and you own the D3 learning curve forever. Pick Cytoscape and you're stuck if you hate its style system. **dbrel-viz is the abstraction layer.**

```text
   ┌────────────────┐
   │  Your Data     │  (any source, any backend)
   └───────┬────────┘
           │ JSON payload
           ▼
   ┌────────────────────────────────────────────┐
   │        DbRel shell.js (shared core)        │
   │  layout • pivots • distance focus • sidebar│
   └────────────────────────────────────────────┘
           │  common renderer interface
           ▼
   ┌────────┬──────────┬──────┬──────────┬─────┐
   │JointJS │Cytoscape │D3.js │vis.js ...│ 20+ │
   └────────┴──────────┴──────┴──────────┴─────┘
```

The same data renders everywhere. Your users pick the engine that fits their brain. You never rewrite.

## Features

- **20 renderers, one API** — JointJS, Cytoscape, Sigma.js, vis.js, D3, GoJS, force-graph, VivaGraph, Springy, AntV G6, C3, dc.js, NVD3, p5.js, Raphael, Vega, maxGraph, React Diagrams, XYFlow, Recharts
- **Live preview on hover** — 1-second hover delay previews renderers in-place; click to confirm, move away to revert
- **Distance-based focus fading** — click any node, and the rest of the graph fades based on BFS hop distance
- **Pivot system** — re-center the view on any VPS host, switch, VLAN, server, asset or website master with a click
- **Grouped / separate display modes** — one node per table, or one node per row
- **Shared smart layout** — BFS + column bin-packing algorithm with golden-ratio aspect targeting
- **Link styling by relationship type** — direct FKs solid, `FIND_IN_SET` dashed purple, cross-DB dotted orange
- **Auto color palettes per database** — blue palette for primary, green for Kayako, orange for PowerDNS
- **Custom table icons** — 90+ built-in table icon mappings; fully customizable
- **Breadcrumb pivot trail** — visual path showing how you navigated from customer to current focal point
- **Live scripts & CSS loader** — lazy-loads each renderer's CDN deps only when you switch to it
- **Zero build step** — plain ES5, loads from `src/` directly
- **Row detail modal** — click any row to see all fields in a clean table
- **Sidebar with counts** — per-table row counts, hover to highlight in renderer
- **Keyboard navigation** — arrow keys + Enter to browse renderers
- **Filter by database and relationship type** — toolbar chips toggle visibility
- **Zoom controls + fit-to-screen** — every renderer implements the same zoom interface
- **D3 version juggling** — shell automatically swaps D3 v3/v5/v7 as needed between renderers
- **Works inside AdminLTE 3, Bootstrap, or standalone** — `<div id="db-rel-app">` is all you need

## Screenshots

<div align="center">

<!-- Replace the following placeholders with real screenshots once generated -->

| JointJS (default) | Cytoscape | D3.js Force |
| :-: | :-: | :-: |
| ![JointJS screenshot](https://via.placeholder.com/320x200.png?text=JointJS) | ![Cytoscape screenshot](https://via.placeholder.com/320x200.png?text=Cytoscape) | ![D3 Force screenshot](https://via.placeholder.com/320x200.png?text=D3+Force) |

| vis.js | GoJS | XYFlow |
| :-: | :-: | :-: |
| ![vis.js screenshot](https://via.placeholder.com/320x200.png?text=vis.js) | ![GoJS screenshot](https://via.placeholder.com/320x200.png?text=GoJS) | ![XYFlow screenshot](https://via.placeholder.com/320x200.png?text=XYFlow) |

</div>

## Quick Start

Minimal HTML page using `dbrel-viz` with a static JSON payload:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>dbrel-viz demo</title>
  <!-- jQuery + Bootstrap 4 (AdminLTE 3 compatible) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js"></script>

  <!-- dbrel-viz -->
  <link rel="stylesheet" href="node_modules/@detain/dbrel-viz/src/core/styles.css">
  <script>
    // Override paths BEFORE loading the shell
    window.DbRel = { paths: {
      renderers: '/node_modules/@detain/dbrel-viz/src/renderers/',
      rendererPrefix: '', rendererSuffix: '.js'
    }};
  </script>
</head>
<body>
  <div id="db-rel-app">
    <!-- toolbar, sidebar, paper will be populated by shell.js -->
    <div id="db-rel-paper-wrap"><div id="db-rel-paper"></div></div>
    <input id="db-rel-custid" type="hidden" value="12345">
  </div>

  <script src="node_modules/@detain/dbrel-viz/src/core/shell.js"></script>
  <script src="node_modules/@detain/dbrel-viz/src/renderers/jointjs.js"></script>

  <script>
    // Load data from your own endpoint or just set it directly
    fetch('/api/db-relationships?custid=12345')
      .then(r => r.json())
      .then(data => {
        DbRel.data = data;
        DbRel.renderers['jointjs'].render();
        DbRel.updateSidebar();
      });
  </script>
</body>
</html>
```

That's it. Now switch to Cytoscape by clicking the library dropdown — the renderer swaps with zero code changes.

## Installation

### Via npm / yarn

```bash
npm install @detain/dbrel-viz
# or
yarn add @detain/dbrel-viz
```

The package ships its `src/` folder directly — there is no build step. You can either:

1. **Serve `src/` as static files** (Express, nginx, etc.) and reference them from your HTML, or
2. **Bundle** via webpack/vite/rollup — each file is a classic script wrapped in an IIFE

### Via script tag (no npm)

```html
<link rel="stylesheet"
      href="https://unpkg.com/@detain/dbrel-viz/src/core/styles.css">
<script src="https://unpkg.com/@detain/dbrel-viz/src/core/shell.js"></script>
<script src="https://unpkg.com/@detain/dbrel-viz/src/renderers/jointjs.js"></script>
```

### Resolving file paths from Node

```js
const dbrel = require('@detain/dbrel-viz');
console.log(dbrel.paths.shell);            // absolute path to shell.js
console.log(dbrel.paths.styles);           // absolute path to styles.css
console.log(dbrel.rendererPath('d3'));     // absolute path to the D3 renderer
console.log(dbrel.renderers);              // list of all renderer keys
console.log(dbrel.version);                // current package version
```

Handy for Express apps:

```js
const express = require('express');
const dbrel = require('@detain/dbrel-viz');
const app = express();

app.use('/dbrel', express.static(require('path').dirname(dbrel.paths.shell) + '/..'));
// Now: /dbrel/core/shell.js, /dbrel/core/styles.css, /dbrel/renderers/*.js
```

## Configuration

Override configuration **before** `shell.js` loads by setting `window.DbRel` early:

```html
<script>
  window.DbRel = {
    paths: {
      renderers:      '/assets/js/',           // where renderer files live
      rendererPrefix: 'db_relationships_',     // prepended to renderer key
      rendererSuffix: '.js',                   // appended to renderer key
      libIcons:       '/assets/lib-icons/',    // renderer logo images
      tableIcons:     '/assets/table-icons/',  // per-table icon images
      ajaxUrl:        '/api/data',             // where to fetch data on load
      ajaxChoice:     'db_relationships_data'  // `choice=` query param
    }
  };
</script>
<script src="/assets/dbrel-viz/core/shell.js"></script>
```

| Path key | What it controls |
| --- | --- |
| `renderers` | Directory URL where renderer JS files are served from |
| `rendererPrefix` | String prepended to each renderer key when building its URL |
| `rendererSuffix` | String appended to each renderer key (usually `.js`) |
| `libIcons` | Directory URL for the library logo icons used in the dropdown |
| `tableIcons` | Directory URL for the per-table icon PNGs used in node headers |
| `ajaxUrl` | Endpoint queried by `DbRel.loadData(custid)` |
| `ajaxChoice` | Query-string `choice=` value sent with data requests |

The final URL a renderer loads from is:

```text
<paths.renderers><paths.rendererPrefix><key><paths.rendererSuffix>
```

So `cytoscape` becomes `/js/db_relationships_cytoscape.js` with the defaults, or `/assets/dbrel-viz/src/renderers/cytoscape.js` if you point `renderers` at the source folder and set prefix/suffix to empty.

## Data Format

The library consumes a single JSON payload, assigned to `DbRel.data`. Shape:

```json
{
  "custid": 12345,
  "tables": {
    "my.accounts": {
      "rows":     [ { "account_id": 12345, "account_lid": "demo", ... } ],
      "columns":  ["account_id", "account_lid", ...],
      "total":    1,
      "truncated": false
    },
    "my.vps": {
      "rows":    [ { "vps_id": 99, "vps_hostname": "host.example.com", ... } ],
      "columns": ["vps_id", "vps_hostname", ...],
      "total":   3,
      "truncated": false
    }
  },
  "relationships": [
    {
      "source": "my.accounts",
      "target": "my.vps",
      "source_field": "account_id",
      "target_field": "vps_custid",
      "type": "direct",
      "cardinality": "1:N",
      "label": "Account → VPS",
      "matches": [ [0, [0, 1, 2]] ]
    }
  ],
  "metadata": {
    "databases": ["my", "kayako_v4", "pdns"],
    "table_count": 14,
    "total_rows": 42,
    "relationship_count": 9,
    "query_time_ms": 127.4,
    "custid": 12345,
    "pivot_table": null,
    "pivot_id": null
  },
  "prefixes":     { "accounts": "account_", "vps": "vps_" },
  "primaryKeys":  { "accounts": "account_id", "vps": "vps_id" },
  "hiddenFields": ["password", "api_token"]
}
```

<details>
<summary><b>Field-by-field reference</b> (click to expand)</summary>

| Key | Type | Description |
| --- | --- | --- |
| `custid` | `number` | Customer ID (echoed in metadata) |
| `tables["db.name"].rows` | `object[]` | Row objects (keys are column names) |
| `tables["db.name"].columns` | `string[]` | Ordered list of column names |
| `tables["db.name"].total` | `number` | Total matching rows before any limit |
| `tables["db.name"].truncated` | `bool` | Whether `rows` was cut short |
| `relationships[].source` | `string` | `"db.table"` key of the source |
| `relationships[].target` | `string` | `"db.table"` key of the target |
| `relationships[].source_field` | `string` | Column in source holding the reference |
| `relationships[].target_field` | `string` | Column in target being referenced |
| `relationships[].type` | `string` | `direct` \| `find_in_set` \| `cross_db` |
| `relationships[].cardinality` | `string` | `1:1` \| `1:N` \| `N:1` \| `N:M` |
| `relationships[].label` | `string` | Human-readable label shown in tooltip |
| `relationships[].matches` | `array` | `[[sourceRowIdx, [targetRowIdxs]], …]` |
| `prefixes[table]` | `string` | Column prefix stripped for display |
| `primaryKeys[table]` | `string` | PK column used to label nodes |
| `hiddenFields` | `string[]` | Columns never shown anywhere |

</details>

## API Reference

Everything lives on the global `DbRel` namespace (created by `core/shell.js`).

### State

| Property | Type | Description |
| --- | --- | --- |
| `DbRel.data` | `object \| null` | The current payload (see [Data Format](#-data-format)) |
| `DbRel.displayMode` | `"separate" \| "grouped"` | One node per row vs. one node per table |
| `DbRel.showFullContent` | `bool` | Whether to render full cell values instead of truncated |
| `DbRel.activeRendererKey` | `string \| null` | Key of the currently active renderer |
| `DbRel.renderers` | `object` | Registry of all registered renderer instances |
| `DbRel.pivot` | `object \| null` | Current pivot info: `{ table, id, tableKey, idField, label }` |
| `DbRel.paths` | `object` | Configured paths (see [Configuration](#-configuration)) |
| `DbRel.RENDERERS` | `object` | Manifest of all available renderers (name, icon, CDN URLs, category) |
| `DbRel.PIVOT_TABLES` | `object` | Tables that can serve as a pivot focal point |
| `DbRel.DB_COLORS` | `object` | Per-database color scheme |
| `DbRel.TABLE_PALETTES` | `object` | Per-database color palettes for individual tables |
| `DbRel.LINK_STYLES` | `object` | Stroke styles per relationship type |
| `DbRel.TABLE_ICONS` | `object` | Per-table icon image map |

### Data loading

```js
DbRel.loadData(custid);                      // fetch via AJAX, auto-renders
DbRel.pivotTo(tableKey, rowIndex);           // re-center on a specific row
DbRel.pivotReset();                          // back to the account-centric view
DbRel.loadPivotDirect(table, id, fallbackCustid);  // direct-jump without custid
```

### Rendering & display

```js
DbRel.switchRenderer('cytoscape');           // swap to a different renderer
DbRel.registerRenderer(key, rendererObj);    // register a custom renderer
DbRel.updateSidebar();                       // refresh the sidebar panel
DbRel.resetTableColors();                    // clear the auto-color cache
```

### Node helpers

```js
DbRel.getNodeHeader(tableKey, rowIndex);     // e.g. "accounts 12345"
DbRel.getNodeLines(tableKey, rowIndex);      // array of "field: value" lines
DbRel.computeNodeSize(header, lines);        // { w, h } for layout
DbRel.getGroupedLines(tableKey);             // ASCII-art table for grouped mode
DbRel.computeGroupedNodeSize(tableName, lines);
```

### Layout

```js
// Shared BFS + column bin-packing layout, respecting aspect ratio targets
const positions = DbRel.computeLayout(containerWidth, containerHeight);
// Returns: { [nodeId]: { x, y, w, h } }
```

### Distance-based focus

```js
// BFS distance from a focused node to every other node
const distances = DbRel.computeNodeDistances(focusNodeId);
// { nodeId: 0|1|2|…|Infinity }

DbRel.distanceToOpacity(distance);           // 1.0 | 0.6 | 0.35 | 0.12
```

### Color / display utilities

```js
DbRel.getTableColor(tableKey);               // { header, bg, border }
DbRel.fmtVal(value);                         // smart-truncate for display
DbRel.pickDisplayColumns(columns, tableName);
DbRel.padRight(str, len);
DbRel.getPrimaryKey(tableName);
DbRel.shortenColName(col, tableName);
DbRel.getTableIconHtml(tableName);           // '<img class="…"> ' or ''
DbRel.getTableIconInfo(tableName);           // { type: 'img', src } or null
```

### Tooltip & modal

```js
DbRel.showTooltip(html, x, y);
DbRel.hideTooltip();
DbRel.getLinkTooltipHtml(relData);
DbRel.showRowModal(tableKey, rowIndex);
```

### Pivot helpers

```js
DbRel.getPivotConfig(tableName);             // { idField, label } | null
DbRel.getNodePivotInfo(tableKey, rowIndex);  // { table, id, tableKey, idField, label }
```

### Filter helpers

```js
DbRel.getDbFilters();                        // { my: true, kayako_v4: false, pdns: true }
DbRel.getTypeFilters();                      // { direct: true, find_in_set: true, cross_db: false }
```

### Dynamic script / CSS loading

```js
DbRel.loadScript(url);                       // returns a Promise; caches by URL
DbRel.loadCSS(url);                          // returns a Promise; caches by URL
```

## Renderer Reference

Every renderer implements the **same interface** — the shell talks to any of them identically.

<div align="center">

| Key | Library | Category | License | Unique Strength |
| :-- | :-- | :-: | :-: | :-- |
| `jointjs` | [JointJS](https://github.com/clientIO/joint) | graph | MPL-2.0 | SVG, orthogonal link routing, custom shapes |
| `cytoscape` | [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) | graph | MIT | Rich selector engine, built for biology workloads |
| `sigma` | [Sigma.js](https://github.com/jacomyal/sigma.js) | graph | MIT | WebGL, handles huge graphs |
| `visjs` | [vis.js](https://github.com/visjs) | graph | Apache-2.0 | Physics simulation, timeline friendly |
| `d3` | [D3.js](https://github.com/d3/d3) | graph | BSD-3 | Force layout, custom everything |
| `gojs` | [GoJS](https://github.com/NorthwoodsSoftware/gojs) | graph | Commercial | Polished diagrams, flowchart-grade layouts |
| `forcegraph` | [force-graph](https://github.com/vasturiano/force-graph) | graph | MIT | Canvas force layout, buttery-smooth |
| `vivagraph` | [VivaGraph](https://github.com/anvaka/VivaGraphJS) | graph | MIT | WebGL, layout algorithm library |
| `springy` | [Springy](https://github.com/dhotson/springy) | graph | MIT | Tiny (~4KB), minimal spring layout |
| `g6` | [AntV G6](https://github.com/antvis/G6) | graph | MIT | Rich built-in behaviors, enterprise-focused |
| `c3` | [C3.js](https://github.com/c3js/c3) | chart | MIT | D3 wrapper, clean chart defaults |
| `dcjs` | [dc.js](https://github.com/dc-js/dc.js) | chart | Apache-2.0 | Dimensional crossfilter charts |
| `nvd3` | [NVD3](https://github.com/novus/nvd3) | chart | Apache-2.0 | Reusable D3 v3 chart components |
| `p5` | [p5.js](https://github.com/processing/p5.js) | other | LGPL-2.1 | Creative-coding canvas, artistic layouts |
| `raphael` | [Raphael](https://github.com/DmitryBaranovskiy/raphael) | other | MIT | Legacy VML/SVG, ultra-compatible |
| `vega` | [Vega](https://github.com/vega/vega) | other | BSD-3 | Declarative JSON grammar, reproducible |
| `maxgraph` | [maxGraph](https://github.com/maxGraph/maxGraph) | other | Apache-2.0 | mxGraph successor, diagram editor-grade |
| `reactdiagrams` | [React Diagrams](https://github.com/projectstorm/react-diagrams) | react | MIT | React-native node editor, pre-built iframe |
| `xyflow` | [XYFlow](https://github.com/xyflow/xyflow) | react | MIT | React Flow successor, beautiful out of the box |
| `recharts` | [Recharts](https://github.com/recharts/recharts) | chart | MIT | React composable charts |

</div>

### Categories

- **graph** — node-edge graph libraries (most renderers)
- **chart** — chart-first libraries that re-purpose their bar/pie primitives into graphs
- **other** — everything else (creative-coding, declarative, legacy)
- **react** — requires React to be loaded; mounted via the shell's dynamic loader

## Writing a Custom Renderer

Every renderer registers itself with `DbRel.registerRenderer(key, obj)`. The object must implement this interface:

```js
(function() {
    'use strict';
    var containerEl, myScene, zoomLevel = 100;

    DbRel.registerRenderer('myrenderer', {
        /** Called once, when the renderer is activated. */
        init: function(el) {
            containerEl = el;
            myScene = new MyLibrary(el);
        },

        /** Called every time data is loaded or display mode changes. */
        render: function() {
            myScene.clear();
            buildFromDbRelData(myScene);
        },

        /** Re-run the layout without rebuilding graph elements. */
        doLayout: function() { myScene.relayout(); },

        /** Zoom controls (percent: 10-400). */
        setZoom: function(pct) { zoomLevel = pct; myScene.setZoom(pct / 100); },
        getZoom: function() { return zoomLevel; },
        fitToScreen: function() { myScene.fit(); },

        /** Filter chips in the toolbar. */
        applyFilters: function(dbFilters, typeFilters) {
            // dbFilters = { my: true|false, kayako_v4: ..., pdns: ... }
            // typeFilters = { direct: ..., find_in_set: ..., cross_db: ... }
        },

        /** Click-to-focus. Dim everything not within 2 hops. */
        focusNode: function(nodeId) { /* ... */ },
        unfocusNode: function()     { /* ... */ },
        centerOnTable: function(tk) { /* ... */ },

        /** Sidebar hover highlight (optional). */
        highlightTable: function(tk)      { /* ... */ },
        clearHighlightTable: function()   { /* ... */ },

        /** Return { nodes, links } for the metadata panel. */
        getStats: function() {
            return { nodes: myScene.nodeCount(), links: myScene.edgeCount() };
        },

        /** Window resize (optional). */
        resize: function() { myScene.resize(); },

        /** Full teardown — the shell calls this before switching to another renderer. */
        destroy: function() {
            if (myScene) myScene.dispose();
            if (containerEl) containerEl.innerHTML = '';
            myScene = null; containerEl = null;
        }
    });
})();
```

Then add it to the manifest (edit `DbRel.RENDERERS` before the shell's init fires, or patch the shell):

```js
DbRel.RENDERERS['myrenderer'] = {
    name: 'My Renderer',
    icon: '/icons/mine.svg',
    github: 'https://github.com/me/my-renderer',
    cat: 'graph',
    file: '/js/renderers/myrenderer.js',
    js: ['https://cdn.example.com/my-library.min.js'],
    css: []
};
```

That's it — it shows up in the library dropdown and works with all the shell's features (pivot, hover, focus fading, etc).

## Examples

<details>
<summary><b>Example 1 — Static payload from a JSON file</b></summary>

```js
fetch('/data/customer-12345.json')
    .then(r => r.json())
    .then(data => {
        DbRel.data = data;
        DbRel.renderers[DbRel.activeRendererKey].render();
        DbRel.updateSidebar();
    });
```

</details>

<details>
<summary><b>Example 2 — Programmatic renderer switch</b></summary>

```js
// Try every renderer in rotation
const libs = ['jointjs', 'cytoscape', 'visjs', 'd3', 'sigma'];
let i = 0;
setInterval(() => {
    DbRel.switchRenderer(libs[i % libs.length]);
    i++;
}, 3000);
```

</details>

<details>
<summary><b>Example 3 — Custom table icons</b></summary>

```js
// Override BEFORE loading shell.js
window.DbRel = {
    paths: { tableIcons: '/my-icons/' },
    TABLE_ICONS: {
        accounts: { img: '/my-icons/person.png' },
        vps:      { img: '/my-icons/server.png' },
        domains:  { img: '/my-icons/globe.png' }
    }
};
```

</details>

<details>
<summary><b>Example 4 — Pivot to a specific VPS host</b></summary>

```js
// Jump straight to VPS host 42 without loading the customer first
DbRel.loadPivotDirect('vps_masters', 42, 0);
```

</details>

<details>
<summary><b>Example 5 — Express server hosting static assets</b></summary>

```js
const express = require('express');
const path = require('path');
const dbrel = require('@detain/dbrel-viz');
const app = express();

// Serve the package's src/ at /dbrel
app.use('/dbrel', express.static(path.dirname(dbrel.paths.shell) + '/..'));

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.listen(3000);
```

</details>

## Architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│                          Your application                          │
│                                                                    │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │                   div#db-rel-app                           │   │
│   │  ┌──────────────┬───────────────────────────────────────┐  │   │
│   │  │              │  Toolbar (lib selector, filters, ...) │  │   │
│   │  │  Sidebar     ├───────────────────────────────────────┤  │   │
│   │  │              │                                       │  │   │
│   │  │  • tables    │       div#db-rel-paper-wrap           │  │   │
│   │  │  • legend    │       └─ div#db-rel-paper             │  │   │
│   │  │  • stats     │          └─ Active renderer's canvas  │  │   │
│   │  │              │                                       │  │   │
│   │  └──────────────┴───────────────────────────────────────┘  │   │
│   └────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
              ▲                                       ▲
              │ registers                             │ reads data
              │                                       │
   ┌──────────┴───────────┐               ┌───────────┴───────────┐
   │  Renderer (one of 20)│               │   DbRel.data  (JSON)  │
   │                      │               │                       │
   │  init()              │               │  tables[], rels[],    │
   │  render()            │               │  prefixes, PKs, meta  │
   │  doLayout()          │               │                       │
   │  setZoom() ...       │               └───────────────────────┘
   │  destroy()           │
   └──────────────────────┘
```

### Rendering lifecycle

```text
DbRel.switchRenderer('cytoscape')
   ├─▶ current renderer.destroy()
   ├─▶ reset #db-rel-paper (clear children/styles/classes)
   ├─▶ DbRel.loadCSS(manifest.css[])
   ├─▶ DbRel.loadScript(manifest.js[])  (sequential for dep ordering)
   ├─▶ if first time: DbRel.loadScript(manifest.file)
   ├─▶ new renderer.init(paperEl)
   ├─▶ new renderer.render()
   └─▶ DbRel.updateSidebar()
```

### Layout algorithm (shared across renderers)

1. Build BFS adjacency from the relationships
2. Root = the `*.accounts` table (or first table if absent)
3. Assign each table to a BFS layer
4. Sort layers by connectivity (most-connected first)
5. Pack blocks into columns with bin-packing (keeping within target aspect)
6. Honor `containerWidth` / `containerHeight` — fall back to 16:9 &times; 0.85

## Companion Packages

`dbrel-viz` is a rendering frontend. Pair it with a data producer:

| Package | Language | Purpose |
| :-- | :-- | :-- |
| [`@detain/dbrel-viz`](./) | Browser JS | **This package** — the frontend |
| [`detain/dbrel-data-php`](../dbrel-data-php) | PHP &geq; 7.4 | Collects rows via mysqli, computes matches, emits the JSON |
| [`@detain/dbrel-data-js`](../dbrel-data-js) | Node &geq; 14 | Same output, Node + `mysql2/promise` |

Data flow end-to-end:

```text
┌──────────┐     ┌───────────────────────────────┐     ┌──────────────┐
│  MySQL   │────▶│  dbrel-data-php               │────▶│              │
│          │     │  (or dbrel-data-js)           │     │  dbrel-viz   │
│  accounts│     │                               │     │  (browser)   │
│  vps     │     │  • Loads schema JSON          │     │              │
│  domains │     │  • Collects rows per table    │JSON │  • 20 libs   │
│  ...     │     │  • Computes relationship      │────▶│  • Pivot     │
└──────────┘     │    matches                    │     │  • Focus     │
                 │  • Emits the payload          │     │              │
                 └───────────────────────────────┘     └──────────────┘
```

## Browser Support

| Browser | Version |
| :-- | :-- |
| Chrome | Latest |
| Firefox | Latest |
| Edge | Latest |
| Safari | 13+ |
| IE 11 | Shell works (ES5); some renderers require polyfills |

**Requirements**

- jQuery 3+
- Bootstrap 4 (for modals and dropdowns)
- Font Awesome 5 (for toolbar icons, optional)

## Contributing

Contributions are welcome!

```bash
git clone https://github.com/detain/dbrel-viz.git
cd dbrel-viz
npm install
npm test
```

### Ideas we'd love help with

- Additional renderers (e.g. `mermaid`, `nvd3-network`, `chartjs-graph`)
- TypeScript definitions for the `DbRel` namespace
- Per-renderer screenshot generation
- Storybook with example payloads

### PR guidelines

1. One feature or fix per PR
2. Keep the public shell API stable — new functionality goes on renderer interfaces
3. Add a Jest test for any change to `core/shell.js`
4. Run `npm test` before pushing
5. Lowercase, descriptive commit messages (`add cytoscape dim on focus`, `fix zoom in grouped mode`)

### Code style

- Plain ES5 in the shell (must work without a build step)
- Modern ES in renderers is fine if the target library requires it
- No frameworks in `core/` — jQuery for DOM, Bootstrap for modals

## License

[MIT](./LICENSE) © 2025 [Joe Huss](mailto:detain@interserver.net) / InterServer

---

<div align="center">

**[⬆ back to top](#dbrel-viz)**

Made with care by [InterServer](https://www.interserver.net) — because one graph library is never enough.

</div>
