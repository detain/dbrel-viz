/**
 * Database Relationships - dc.js + Crossfilter + D3 v5 Renderer
 * Main graph: custom D3 SVG with card nodes and routed links.
 * Charts: dc.js crossfilter-linked interactive charts (unique feature).
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var containerEl, svg, gRoot, gLinks, gLinkLabels, gNodes;
    var zoomBehavior;
    var zoomLevel = 100;
    var focusedNodeId = null;
    var savedPositions = {};
    var didPan = false;

    // Node/link data arrays
    var nodeData = [];
    var linkData = [];

    // crossfilter + dc.js
    var ndx, dbDim, relTypeDim, rowCountDim;
    var dbChart, typeChart, rowChart;

    // Filtered sets driven by crossfilter
    var cfVisibleTables = null;
    var cfVisibleRelTypes = null;

    /* ====================================================================
     * SVG INITIALIZATION
     * ==================================================================== */

    function initSVG() {
        if (!containerEl) return;
        containerEl.innerHTML = '';

        // Create split layout: sidebar charts + graph area
        containerEl.style.display = 'flex';
        containerEl.style.height = '100%';

        var sidebar = document.createElement('div');
        sidebar.id = 'dcjs-sidebar-charts';
        sidebar.style.cssText = 'width:240px;min-width:200px;overflow-y:auto;background:#0d1117;border-right:1px solid #21262d;padding:8px;flex-shrink:0;';
        sidebar.innerHTML =
            '<div style="color:#8b949e;font-size:11px;font-weight:600;margin-bottom:6px;">DATABASE DIST ' +
            '<a id="dcjs-db-chart-reset" href="javascript:void(0)" style="display:none;color:#58a6ff;font-size:10px;">reset</a></div>' +
            '<div id="dcjs-db-chart"></div>' +
            '<div style="color:#8b949e;font-size:11px;font-weight:600;margin:8px 0 6px;">REL TYPES ' +
            '<a id="dcjs-type-chart-reset" href="javascript:void(0)" style="display:none;color:#58a6ff;font-size:10px;">reset</a></div>' +
            '<div id="dcjs-type-chart"></div>' +
            '<div style="color:#8b949e;font-size:11px;font-weight:600;margin:8px 0 6px;">TABLE ROWS ' +
            '<a id="dcjs-row-chart-reset" href="javascript:void(0)" style="display:none;color:#58a6ff;font-size:10px;">reset</a></div>' +
            '<div id="dcjs-row-chart"></div>';
        containerEl.appendChild(sidebar);

        var graphWrap = document.createElement('div');
        graphWrap.id = 'dcjs-graph-wrap';
        graphWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;min-height:400px;';
        containerEl.appendChild(graphWrap);

        var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.style.background = '#0d1117';
        graphWrap.appendChild(svgEl);

        svg = d3.select(svgEl);
        svg.selectAll('*').remove();

        // Defs: arrow markers
        var defs = svg.append('defs');
        var linkStyles = DbRel.LINK_STYLES;
        ['direct', 'find_in_set', 'cross_db'].forEach(function(type) {
            var st = linkStyles[type];
            defs.append('marker')
                .attr('id', 'dcjs-arrow-' + type)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 10).attr('refY', 0)
                .attr('markerWidth', 8).attr('markerHeight', 8)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-4L8,0L0,4')
                .attr('fill', 'none')
                .attr('stroke', st.stroke)
                .attr('stroke-width', 1);
        });

        gRoot = svg.append('g').attr('class', 'dcjs-root-group');
        gLinks = gRoot.append('g').attr('class', 'dcjs-links-layer');
        gLinkLabels = gRoot.append('g').attr('class', 'dcjs-link-labels-layer');
        gNodes = gRoot.append('g').attr('class', 'dcjs-nodes-layer');

        // Zoom/pan (D3 v5)
        zoomBehavior = d3.zoom()
            .scaleExtent([0.02, 5])
            .on('zoom', function() {
                gRoot.attr('transform', d3.event.transform);
                zoomLevel = Math.round(d3.event.transform.k * 100);
                DbRel.setZoomSlider(zoomLevel);
            });

        svg.call(zoomBehavior);

        svg.on('mousedown.pantrack', function() { didPan = false; });
        svg.on('mousemove.pantrack', function() { didPan = true; });
        svg.on('click.blank', function() {
            if (d3.event.target === svgEl || d3.event.target.classList.contains('dcjs-root-group')) {
                if (focusedNodeId && !didPan) unfocusNode();
            }
        });

        // dc.js chart reset links
        bindResetLinks();
    }

    function bindResetLinks() {
        var dbReset = document.getElementById('dcjs-db-chart-reset');
        var typeReset = document.getElementById('dcjs-type-chart-reset');
        var rowReset = document.getElementById('dcjs-row-chart-reset');

        if (dbReset) dbReset.addEventListener('click', function() {
            if (dbChart) { dbChart.filterAll(); dc.redrawAll(); }
            updateCfFilters(); updateGraphVisibility(); this.style.display = 'none';
        });
        if (typeReset) typeReset.addEventListener('click', function() {
            if (typeChart) { typeChart.filterAll(); dc.redrawAll(); }
            updateCfFilters(); updateGraphVisibility(); this.style.display = 'none';
        });
        if (rowReset) rowReset.addEventListener('click', function() {
            if (rowChart) { rowChart.filterAll(); dc.redrawAll(); }
            updateCfFilters(); updateGraphVisibility(); this.style.display = 'none';
        });
    }

    /* ====================================================================
     * CROSSFILTER + DC.JS SETUP (unique feature)
     * ==================================================================== */

    function setupCrossfilter() {
        if (!DbRel.data) return;

        // Build flat records for crossfilter: one per table
        var tableRecords = [];
        var tableKeys = Object.keys(DbRel.data.tables);
        tableKeys.forEach(function(tk) {
            var parts = tk.split('.');
            var info = DbRel.data.tables[tk];
            tableRecords.push({
                tableKey: tk,
                db: parts[0],
                tableName: parts[1],
                rowCount: info.total || info.rows.length
            });
        });

        ndx = crossfilter(tableRecords);

        // Dimension: by database
        dbDim = ndx.dimension(function(d) { return d.db; });
        var dbGroup = dbDim.group().reduceCount();

        // Dimension: by tableName for row chart (top N by row count)
        rowCountDim = ndx.dimension(function(d) { return d.tableName; });
        var rowCountGroup = rowCountDim.group().reduceSum(function(d) { return d.rowCount; });

        // Build a separate crossfilter for relationships
        var relRecords = [];
        (DbRel.data.relationships || []).forEach(function(rel, i) {
            relRecords.push({
                id: i,
                type: rel.type,
                source: rel.source,
                target: rel.target
            });
        });

        var relNdx = crossfilter(relRecords);
        relTypeDim = relNdx.dimension(function(d) { return d.type; });
        var relTypeGroup = relTypeDim.group().reduceCount();

        var sidebar = document.getElementById('dcjs-sidebar-charts');
        var chartW = sidebar ? sidebar.clientWidth - 16 : 220;

        // DB Pie Chart
        dbChart = dc.pieChart('#dcjs-db-chart')
            .width(chartW)
            .height(120)
            .radius(55)
            .innerRadius(20)
            .dimension(dbDim)
            .group(dbGroup)
            .ordinalColors(['#2563eb', '#059669', '#d97706'])
            .colorAccessor(function(d) { return d.key; })
            .colorDomain(['my', 'kayako_v4', 'pdns'])
            .label(function(d) { return d.key + ' (' + d.value + ')'; })
            .title(function(d) { return d.key + ': ' + d.value + ' tables'; })
            .on('filtered', function() {
                updateCfFilters();
                updateGraphVisibility();
                showResetLink('dcjs-db-chart-reset', dbChart);
            });

        // Relationship Type Pie Chart
        typeChart = dc.pieChart('#dcjs-type-chart')
            .width(chartW)
            .height(110)
            .radius(50)
            .innerRadius(18)
            .dimension(relTypeDim)
            .group(relTypeGroup)
            .ordinalColors(['#495057', '#6f42c1', '#fd7e14'])
            .colorAccessor(function(d) { return d.key; })
            .colorDomain(['direct', 'find_in_set', 'cross_db'])
            .label(function(d) { return d.key.replace('_', ' ') + ' (' + d.value + ')'; })
            .title(function(d) { return d.key + ': ' + d.value + ' relationships'; })
            .on('filtered', function() {
                updateCfFilters();
                updateGraphVisibility();
                showResetLink('dcjs-type-chart-reset', typeChart);
            });

        // Row count bar chart (top N tables)
        var topN = Math.min(10, tableRecords.length);
        rowChart = dc.rowChart('#dcjs-row-chart')
            .width(chartW)
            .height(topN * 18 + 30)
            .dimension(rowCountDim)
            .group(rowCountGroup)
            .cap(topN)
            .othersGrouper(false)
            .elasticX(true)
            .ordinalColors(d3.schemeCategory10)
            .label(function(d) { return d.key + ' (' + d.value + ')'; })
            .title(function(d) { return d.key + ': ' + d.value + ' rows'; })
            .on('filtered', function() {
                updateCfFilters();
                updateGraphVisibility();
                showResetLink('dcjs-row-chart-reset', rowChart);
            });

        rowChart.xAxis().ticks(4);

        dc.renderAll();

        // Style for dark theme
        setTimeout(function() {
            d3.selectAll('.dc-chart .axis text').style('fill', '#8b949e');
            d3.selectAll('.dc-chart .axis line, .dc-chart .axis path').style('stroke', '#21262d');
            d3.selectAll('.dc-chart text').style('fill', '#c9d1d9');
        }, 100);
    }

    function showResetLink(id, chart) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.display = chart.hasFilter() ? 'inline' : 'none';
    }

    function updateCfFilters() {
        var hasDbFilter = dbChart && dbChart.hasFilter();
        var hasRowFilter = rowChart && rowChart.hasFilter();

        if (hasDbFilter || hasRowFilter) {
            cfVisibleTables = new Set();
            if (ndx) {
                var allFiltered = typeof ndx.allFiltered === 'function'
                    ? ndx.allFiltered()
                    : dbDim.top(Infinity);
                allFiltered.forEach(function(d) { cfVisibleTables.add(d.tableKey); });
            }
        } else {
            cfVisibleTables = null;
        }

        if (typeChart && typeChart.hasFilter()) {
            cfVisibleRelTypes = new Set();
            typeChart.filters().forEach(function(f) { cfVisibleRelTypes.add(f); });
        } else {
            cfVisibleRelTypes = null;
        }
    }

    /* ====================================================================
     * BUILD NODE/LINK DATA
     * ==================================================================== */

    function buildGraphData() {
        if (!DbRel.data) return;
        nodeData = [];
        linkData = [];
        savedPositions = {};
        focusedNodeId = null;

        if (DbRel.displayMode === 'grouped') {
            buildGroupedData();
        } else {
            buildSeparateData();
        }
    }

    function buildSeparateData() {
        var tableKeys = Object.keys(DbRel.data.tables);
        var linkStyles = DbRel.LINK_STYLES;
        var linkId = 0;

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);

            tableInfo.rows.forEach(function(row, ri) {
                var nodeId = tableKey + ':' + ri;
                var headerLabel = DbRel.getNodeHeader(tableKey, ri);
                var lines = DbRel.getNodeLines(tableKey, ri);
                var size = DbRel.computeNodeSize(headerLabel, lines);

                nodeData.push({
                    id: nodeId,
                    tableKey: tableKey,
                    dbName: dbName,
                    tableName: tableName,
                    rowIndex: ri,
                    headerLabel: headerLabel,
                    lines: lines,
                    colors: colors,
                    x: 0, y: 0, w: size.w, h: size.h
                });
            });
        });

        (DbRel.data.relationships || []).forEach(function(rel) {
            var style = linkStyles[rel.type] || linkStyles['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                var srcNode = nodeData.find(function(n) { return n.id === srcNodeId; });
                if (!srcNode) return;
                (match[1] || []).forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    var tgtNode = nodeData.find(function(n) { return n.id === tgtNodeId; });
                    if (!tgtNode) return;
                    linkData.push({
                        id: 'dcjs-link-' + (linkId++),
                        source: srcNodeId,
                        target: tgtNodeId,
                        relType: rel.type,
                        relData: rel,
                        style: style,
                        vertices: []
                    });
                });
            });
        });
    }

    function buildGroupedData() {
        var tableKeys = Object.keys(DbRel.data.tables);
        var linkStyles = DbRel.LINK_STYLES;
        var linkId = 0;

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);

            nodeData.push({
                id: tableKey,
                tableKey: tableKey,
                dbName: dbName,
                tableName: tableName,
                rowIndex: 0,
                headerLabel: tableName + ' (' + tableInfo.total + ')',
                lines: lines,
                colors: colors,
                x: 0, y: 0, w: size.w, h: size.h
            });
        });

        (DbRel.data.relationships || []).forEach(function(rel) {
            var srcNode = nodeData.find(function(n) { return n.id === rel.source; });
            var tgtNode = nodeData.find(function(n) { return n.id === rel.target; });
            if (!srcNode || !tgtNode) return;
            var style = linkStyles[rel.type] || linkStyles['direct'];
            linkData.push({
                id: 'dcjs-link-' + (linkId++),
                source: rel.source,
                target: rel.target,
                relType: rel.type,
                relData: rel,
                style: style,
                vertices: []
            });
        });
    }

    /* ====================================================================
     * LAYOUT
     * ==================================================================== */

    function doLayout() {
        var wrap = document.getElementById('dcjs-graph-wrap');
        var cW = wrap ? wrap.clientWidth : 1200;
        var cH = wrap ? wrap.clientHeight : 700;
        var positions = DbRel.computeLayout(cW, cH);

        nodeData.forEach(function(n) {
            if (positions[n.id]) {
                n.x = positions[n.id].x;
                n.y = positions[n.id].y;
            }
        });
    }

    /* ====================================================================
     * LINK ROUTING
     * ==================================================================== */

    function routeLinks() {
        var LANE_GAP = 6, EXIT_PAD = 15, BOX_PAD = 8;
        var nodeMap = {};
        nodeData.forEach(function(n) { nodeMap[n.id] = n; });

        var allBounds = nodeData.map(function(n) {
            return { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h,
                r: n.x + n.w, b: n.y + n.h, cx: n.x + n.w / 2, cy: n.y + n.h / 2 };
        });
        var boundsMap = {};
        allBounds.forEach(function(b) { boundsMap[b.id] = b; });

        var sourceGroups = {}, targetGroups = {};
        linkData.forEach(function(lnk) {
            if (!boundsMap[lnk.source] || !boundsMap[lnk.target]) return;
            if (!sourceGroups[lnk.source]) sourceGroups[lnk.source] = [];
            sourceGroups[lnk.source].push(lnk);
            if (!targetGroups[lnk.target]) targetGroups[lnk.target] = [];
            targetGroups[lnk.target].push(lnk);
        });

        Object.keys(sourceGroups).forEach(function(sId) {
            sourceGroups[sId].sort(function(a, b) {
                var aB = boundsMap[a.target], bB = boundsMap[b.target];
                return (aB ? aB.cy : 0) - (bB ? bB.cy : 0);
            });
        });
        Object.keys(targetGroups).forEach(function(tId) {
            targetGroups[tId].sort(function(a, b) {
                var aB = boundsMap[a.source], bB = boundsMap[b.source];
                return (aB ? aB.cy : 0) - (bB ? bB.cy : 0);
            });
        });

        function corridorHitsBox(cx, yMin, yMax, skipIds) {
            for (var i = 0; i < allBounds.length; i++) {
                var b = allBounds[i];
                if (skipIds[b.id]) continue;
                if (cx >= b.x - BOX_PAD && cx <= b.r + BOX_PAD &&
                    yMin <= b.b + BOX_PAD && yMax >= b.y - BOX_PAD) return true;
            }
            return false;
        }

        function findClearCorridorX(idealX, yMin, yMax, skipIds) {
            if (!corridorHitsBox(idealX, yMin, yMax, skipIds)) return idealX;
            for (var off = 10; off < 500; off += 8) {
                if (!corridorHitsBox(idealX + off, yMin, yMax, skipIds)) return idealX + off;
                if (!corridorHitsBox(idealX - off, yMin, yMax, skipIds)) return idealX - off;
            }
            return idealX;
        }

        function horizontalHitsBox(hy, xMin, xMax, skipIds) {
            for (var i = 0; i < allBounds.length; i++) {
                var b = allBounds[i];
                if (skipIds[b.id]) continue;
                if (hy >= b.y - BOX_PAD && hy <= b.b + BOX_PAD &&
                    xMin <= b.r + BOX_PAD && xMax >= b.x - BOX_PAD) return true;
            }
            return false;
        }

        function findClearHorizontalY(idealY, xMin, xMax, skipIds) {
            if (!horizontalHitsBox(idealY, xMin, xMax, skipIds)) return idealY;
            for (var off = 8; off < 300; off += 6) {
                if (!horizontalHitsBox(idealY - off, xMin, xMax, skipIds)) return idealY - off;
                if (!horizontalHitsBox(idealY + off, xMin, xMax, skipIds)) return idealY + off;
            }
            return idealY;
        }

        var corridorLanes = {};

        linkData.forEach(function(lnk) {
            var sB = boundsMap[lnk.source], tB = boundsMap[lnk.target];
            if (!sB || !tB) { lnk.vertices = []; return; }

            var sGroup = sourceGroups[lnk.source] || [lnk];
            var tGroup = targetGroups[lnk.target] || [lnk];
            var sIdx = sGroup.indexOf(lnk);
            var tIdx = tGroup.indexOf(lnk);

            var sSpread = Math.min(sB.h * 0.8, sGroup.length * LANE_GAP);
            var sStep = sGroup.length > 1 ? sSpread / (sGroup.length - 1) : 0;
            var exitY = sB.cy + (sIdx - (sGroup.length - 1) / 2) * sStep;

            var tSpread = Math.min(tB.h * 0.8, tGroup.length * LANE_GAP);
            var tStep = tGroup.length > 1 ? tSpread / (tGroup.length - 1) : 0;
            var enterY = tB.cy + (tIdx - (tGroup.length - 1) / 2) * tStep;

            var skipSource = {}; skipSource[lnk.source] = true;
            var skipTarget = {}; skipTarget[lnk.target] = true;
            var skipBoth = {}; skipBoth[lnk.source] = true; skipBoth[lnk.target] = true;

            var sideCombos = [
                { exitSide: 'right', enterSide: 'left',  exitX: sB.r,  enterX: tB.x },
                { exitSide: 'right', enterSide: 'right', exitX: sB.r,  enterX: tB.r },
                { exitSide: 'left',  enterSide: 'left',  exitX: sB.x,  enterX: tB.x },
                { exitSide: 'left',  enterSide: 'right', exitX: sB.x,  enterX: tB.r }
            ];

            var bestCombo = null, bestScore = Infinity;
            sideCombos.forEach(function(combo) {
                var padX1 = combo.exitSide === 'right' ? combo.exitX + EXIT_PAD : combo.exitX - EXIT_PAD;
                var padX2 = combo.enterSide === 'left' ? combo.enterX - EXIT_PAD : combo.enterX + EXIT_PAD;
                var midX = (padX1 + padX2) / 2;
                var exitThru = (combo.exitSide === 'left' && midX > sB.x) || (combo.exitSide === 'right' && midX < sB.r);
                var enterThru = (combo.enterSide === 'right' && midX < tB.r) || (combo.enterSide === 'left' && midX > tB.x);
                if (exitThru || enterThru) return;
                var dist = Math.abs(combo.exitX - combo.enterX) + Math.abs(exitY - enterY);
                if (dist < bestScore) { bestScore = dist; bestCombo = combo; }
            });

            if (!bestCombo) {
                bestCombo = sB.cx < tB.cx
                    ? { exitSide: 'right', enterSide: 'left', exitX: sB.r, enterX: tB.x }
                    : { exitSide: 'left', enterSide: 'right', exitX: sB.x, enterX: tB.r };
            }

            var exitX = bestCombo.exitX, enterX = bestCombo.enterX;
            var padX1 = bestCombo.exitSide === 'right' ? exitX + EXIT_PAD : exitX - EXIT_PAD;
            var padX2 = bestCombo.enterSide === 'left' ? enterX - EXIT_PAD : enterX + EXIT_PAD;

            var idealCorridorX = (padX1 + padX2) / 2;
            var corridorKey = Math.round(idealCorridorX / 40) * 40;
            if (!corridorLanes[corridorKey]) corridorLanes[corridorKey] = 0;
            var laneNum = corridorLanes[corridorKey]++;
            var laneIdealX = idealCorridorX + (laneNum - corridorLanes[corridorKey] / 2) * LANE_GAP;

            var routeYMin = Math.min(exitY, enterY);
            var routeYMax = Math.max(exitY, enterY);
            var laneX = findClearCorridorX(laneIdealX, routeYMin, routeYMax, skipBoth);

            var vertices;
            if (Math.abs(exitY - enterY) < 3 && Math.abs(exitX - enterX) > 20) {
                var straightY = findClearHorizontalY(exitY, Math.min(exitX, enterX), Math.max(exitX, enterX), skipBoth);
                if (Math.abs(straightY - exitY) < 3) {
                    vertices = [{ x: exitX, y: exitY }, { x: enterX, y: enterY }];
                } else {
                    vertices = [
                        { x: padX1, y: exitY }, { x: padX1, y: straightY },
                        { x: padX2, y: straightY }, { x: padX2, y: enterY }
                    ];
                }
            } else {
                var clearExitY = findClearHorizontalY(exitY, Math.min(padX1, laneX), Math.max(padX1, laneX), skipSource);
                var clearEnterY = findClearHorizontalY(enterY, Math.min(laneX, padX2), Math.max(laneX, padX2), skipTarget);
                vertices = [
                    { x: padX1, y: clearExitY }, { x: laneX, y: clearExitY },
                    { x: laneX, y: clearEnterY }, { x: padX2, y: clearEnterY }
                ];
            }

            lnk.vertices = vertices;
            lnk.exitX = exitX;
            lnk.exitY = exitY;
            lnk.enterX = enterX;
            lnk.enterY = enterY;
        });
    }

    /* ====================================================================
     * RENDER D3 GRAPH
     * ==================================================================== */

    function renderGraph() {
        if (!gNodes || !gLinks) return;
        gLinks.selectAll('*').remove();
        gLinkLabels.selectAll('*').remove();
        gNodes.selectAll('*').remove();

        var HDR_H = DbRel.HDR_H, PAD = DbRel.PAD, ROW_H = DbRel.ROW_H;
        var nodeMap = {};
        nodeData.forEach(function(n) { nodeMap[n.id] = n; });

        // Draw links
        var lineGen = d3.line().x(function(d) { return d.x; }).y(function(d) { return d.y; });

        linkData.forEach(function(lnk) {
            var pts = lnk.vertices || [];
            if (pts.length < 2) return;

            gLinks.append('path')
                .attr('class', 'dcjs-rel-link')
                .attr('d', lineGen(pts))
                .attr('fill', 'none')
                .attr('stroke', lnk.style.stroke)
                .attr('stroke-width', lnk.style.strokeWidth)
                .attr('stroke-dasharray', lnk.style.strokeDasharray === '0' ? null : lnk.style.strokeDasharray)
                .attr('marker-end', 'url(#dcjs-arrow-' + lnk.relType + ')')
                .datum(lnk)
                .on('mouseenter', function(d) { onLinkHover(d, d3.event); })
                .on('mouseleave', onLinkLeave);

            // Label at midpoint
            if (lnk.relData) {
                var mid = pts[Math.floor(pts.length / 2)];
                gLinkLabels.append('text')
                    .attr('class', 'dcjs-rel-link-label')
                    .attr('x', mid.x).attr('y', mid.y - 3)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#8b949e').attr('font-size', '8px').attr('font-family', 'monospace')
                    .text(lnk.relData.source_field + '\u2192' + lnk.relData.target_field)
                    .datum(lnk);
            }
        });

        // Draw nodes
        var drag = d3.drag()
            .on('start', function(d) {
                d3.event.sourceEvent.stopPropagation();
                d._dragStartX = d.x; d._dragStartY = d.y;
            })
            .on('drag', function(d) {
                d.x += d3.event.dx;
                d.y += d3.event.dy;
                d3.select(this).attr('transform', 'translate(' + d.x + ',' + d.y + ')');
                updateLinksForNode(d.id);
            })
            .on('end', function(d) {
                if (Math.abs(d.x - (d._dragStartX || 0)) < 3 && Math.abs(d.y - (d._dragStartY || 0)) < 3) return;
                routeLinks();
                renderGraph();
                updateGraphVisibility();
            });

        nodeData.forEach(function(n) {
            var g = gNodes.append('g')
                .attr('class', 'dcjs-card-node')
                .attr('transform', 'translate(' + n.x + ',' + n.y + ')')
                .datum(n)
                .call(drag)
                .on('click', function(d) { d3.event.stopPropagation(); onNodeClick(d); })
                .on('dblclick', function(d) { d3.event.stopPropagation(); DbRel.showRowModal(d.tableKey, d.rowIndex); })
                .on('mouseenter', function(d) { onNodeHover(d); })
                .on('mouseleave', function() { onNodeLeave(); });

            g.append('rect').attr('class', 'dcjs-card-bg')
                .attr('width', n.w).attr('height', n.h)
                .attr('fill', n.colors.bg).attr('stroke', n.colors.border)
                .attr('stroke-width', 1).attr('rx', 4);

            g.append('rect').attr('class', 'dcjs-card-header')
                .attr('width', n.w).attr('height', HDR_H)
                .attr('fill', n.colors.header).attr('rx', 4);

            g.append('rect').attr('class', 'dcjs-card-header-mask')
                .attr('width', n.w).attr('height', 10).attr('y', HDR_H - 10)
                .attr('fill', n.colors.header);

            var hdrTextX = 6;
            var iconInfo = DbRel.getTableIconInfo(n.tableName);
            if (iconInfo && iconInfo.src) {
                g.append('image').attr('class', 'dcjs-card-icon')
                    .attr('xlink:href', iconInfo.src)
                    .attr('x', 3).attr('y', 3)
                    .attr('width', 16).attr('height', 16);
                hdrTextX = 22;
            }
            g.append('text').attr('class', 'dcjs-card-title')
                .attr('x', hdrTextX).attr('y', 15)
                .attr('fill', '#fff').attr('font-size', '10px').attr('font-weight', 'bold').attr('font-family', 'monospace')
                .text(n.headerLabel);

            n.lines.forEach(function(line, i) {
                g.append('text').attr('class', 'dcjs-card-row-text')
                    .attr('x', 6).attr('y', HDR_H + PAD + (i + 1) * ROW_H)
                    .attr('fill', '#c9d1d9').attr('font-size', '9px').attr('font-family', 'monospace')
                    .text(line);
            });

            // Pivot icon for pivotable tables
            var pivotInfo = DbRel.getNodePivotInfo(n.tableKey, n.rowIndex);
            if (pivotInfo) {
                (function(tk, ri) {
                    g.append('text').attr('class', 'dcjs-pivot-icon')
                        .attr('x', n.w - 14).attr('y', 15)
                        .attr('font-size', '11px').attr('font-family', 'sans-serif')
                        .attr('fill', '#fff').attr('cursor', 'pointer')
                        .attr('pointer-events', 'all').attr('opacity', 0.6)
                        .text('\u2316')
                        .on('mouseenter', function() { d3.select(this).attr('opacity', 1); })
                        .on('mouseleave', function() { d3.select(this).attr('opacity', 0.6); })
                        .on('click', function() {
                            d3.event.stopPropagation();
                            DbRel.pivotTo(tk, ri);
                        });
                })(n.tableKey, n.rowIndex);
            }
        });

        updateGraphVisibility();
    }

    function updateLinksForNode(nodeId) {
        var nodeMap = {};
        nodeData.forEach(function(n) { nodeMap[n.id] = n; });

        gLinks.selectAll('.dcjs-rel-link').each(function(d) {
            if (d.source === nodeId || d.target === nodeId) {
                var sn = nodeMap[d.source], tn = nodeMap[d.target];
                if (!sn || !tn) return;
                var pts = [
                    { x: sn.x + sn.w, y: sn.y + sn.h / 2 },
                    { x: tn.x, y: tn.y + tn.h / 2 }
                ];
                if (sn.x > tn.x) {
                    pts = [
                        { x: sn.x, y: sn.y + sn.h / 2 },
                        { x: tn.x + tn.w, y: tn.y + tn.h / 2 }
                    ];
                }
                var lineGen = d3.line().x(function(p) { return p.x; }).y(function(p) { return p.y; });
                d3.select(this).attr('d', lineGen(pts));
            }
        });

        gLinkLabels.selectAll('.dcjs-rel-link-label').each(function(d) {
            if (d.source === nodeId || d.target === nodeId) {
                var sn = nodeMap[d.source], tn = nodeMap[d.target];
                if (!sn || !tn) return;
                d3.select(this)
                    .attr('x', (sn.x + sn.w / 2 + tn.x + tn.w / 2) / 2)
                    .attr('y', (sn.y + sn.h / 2 + tn.y + tn.h / 2) / 2 - 3);
            }
        });
    }

    /* ====================================================================
     * VISIBILITY (crossfilter + toolbar filters)
     * ==================================================================== */

    function updateGraphVisibility() {
        gNodes.selectAll('.dcjs-card-node').each(function(d) {
            var cfVis = cfVisibleTables === null || cfVisibleTables.has(d.tableKey);
            d3.select(this).style('display', cfVis ? '' : 'none');
        });

        gLinks.selectAll('.dcjs-rel-link').each(function(d) {
            var rd = d.relData;
            if (!rd) { d3.select(this).style('display', 'none'); return; }
            var cfTypeVis = cfVisibleRelTypes === null || cfVisibleRelTypes.has(d.relType);
            var cfSrcVis = cfVisibleTables === null || cfVisibleTables.has(rd.source);
            var cfTgtVis = cfVisibleTables === null || cfVisibleTables.has(rd.target);
            d3.select(this).style('display', cfTypeVis && cfSrcVis && cfTgtVis ? '' : 'none');
        });

        gLinkLabels.selectAll('.dcjs-rel-link-label').each(function(d) {
            var rd = d.relData;
            if (!rd) { d3.select(this).style('display', 'none'); return; }
            var cfTypeVis = cfVisibleRelTypes === null || cfVisibleRelTypes.has(d.relType);
            var cfSrcVis = cfVisibleTables === null || cfVisibleTables.has(rd.source);
            var cfTgtVis = cfVisibleTables === null || cfVisibleTables.has(rd.target);
            d3.select(this).style('display', cfTypeVis && cfSrcVis && cfTgtVis ? '' : 'none');
        });
    }

    /* ====================================================================
     * INTERACTIONS
     * ==================================================================== */

    function onNodeHover(d) {
        if (focusedNodeId) return;
        highlightConnected(d.id, false);
    }

    function onNodeLeave() {
        if (focusedNodeId) return;
        clearHighlights();
    }

    function onNodeClick(d) {
        if (focusedNodeId === d.id) {
            unfocusNode();
        } else {
            focusNode(d.id);
        }
    }

    function onLinkHover(d, evt) {
        gLinks.selectAll('.dcjs-rel-link').filter(function(ld) { return ld.id === d.id; })
            .classed('dcjs-highlighted', true);
        highlightConnected(d.source, false);
        if (d.relData) {
            DbRel.showTooltip(DbRel.getLinkTooltipHtml(d.relData), evt.clientX + 12, evt.clientY + 12);
        }
    }

    function onLinkLeave() {
        DbRel.hideTooltip();
        if (!focusedNodeId) clearHighlights();
    }

    function highlightConnected(nodeId, dim) {
        var connectedIds = {};
        connectedIds[nodeId] = true;
        linkData.forEach(function(lnk) {
            if (lnk.source === nodeId || lnk.target === nodeId) {
                connectedIds[lnk.source] = true;
                connectedIds[lnk.target] = true;
            }
        });

        gNodes.selectAll('.dcjs-card-node').classed('dcjs-highlighted', function(d) {
            return connectedIds[d.id] === true;
        });

        if (dim) {
            gNodes.selectAll('.dcjs-card-node').classed('dcjs-dimmed', function(d) {
                return !connectedIds[d.id];
            });
            gLinks.selectAll('.dcjs-rel-link').classed('dcjs-dimmed', function(d) {
                return !(d.source === nodeId || d.target === nodeId);
            });
            gLinkLabels.selectAll('.dcjs-rel-link-label').classed('dcjs-dimmed', function(d) {
                return !(d.source === nodeId || d.target === nodeId);
            });
        }
    }

    function clearHighlights() {
        gNodes.selectAll('.dcjs-card-node').classed('dcjs-highlighted', false).classed('dcjs-dimmed', false).style('opacity', null);
        gLinks.selectAll('.dcjs-rel-link').classed('dcjs-highlighted', false).classed('dcjs-dimmed', false).style('opacity', null);
        gLinkLabels.selectAll('.dcjs-rel-link-label').classed('dcjs-dimmed', false).style('opacity', null);
    }

    function focusNode(nodeId) {
        if (focusedNodeId && focusedNodeId !== nodeId) restorePositions();
        focusedNodeId = nodeId;
        clearHighlights();

        var focusN = nodeData.find(function(n) { return n.id === nodeId; });
        if (!focusN) return;

        var connectedIds = {};
        connectedIds[nodeId] = true;
        linkData.forEach(function(lnk) {
            if (lnk.source === nodeId || lnk.target === nodeId) {
                connectedIds[lnk.source] = true;
                connectedIds[lnk.target] = true;
            }
        });

        var neighbors = nodeData.filter(function(n) { return n.id !== nodeId && connectedIds[n.id]; });

        savedPositions = {};
        neighbors.forEach(function(n) { savedPositions[n.id] = { x: n.x, y: n.y }; });

        var centerX = focusN.x + focusN.w / 2;
        var centerY = focusN.y + focusN.h / 2;
        var radius = Math.max(200, neighbors.length * 30);
        neighbors.forEach(function(n, i) {
            var angle = (2 * Math.PI * i) / neighbors.length - Math.PI / 2;
            n.x = centerX + radius * Math.cos(angle) - n.w / 2;
            n.y = centerY + radius * Math.sin(angle) - n.h / 2;
        });

        routeLinks();
        renderGraph();

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(nodeId);

        gNodes.selectAll('.dcjs-card-node')
            .classed('dcjs-highlighted', function(d) { return distances[d.id] !== undefined && distances[d.id] <= 1; })
            .style('opacity', function(d) { return DbRel.distanceToOpacity(distances[d.id]); });

        gLinks.selectAll('.dcjs-rel-link')
            .classed('dcjs-highlighted', function(d) { return d.source === nodeId || d.target === nodeId; })
            .style('opacity', function(d) {
                var sDist = distances[d.source] !== undefined ? distances[d.source] : Infinity;
                var tDist = distances[d.target] !== undefined ? distances[d.target] : Infinity;
                return DbRel.distanceToOpacity(Math.max(sDist, tDist));
            });

        gLinkLabels.selectAll('.dcjs-rel-link-label')
            .style('opacity', function(d) {
                var sDist = distances[d.source] !== undefined ? distances[d.source] : Infinity;
                var tDist = distances[d.target] !== undefined ? distances[d.target] : Infinity;
                return DbRel.distanceToOpacity(Math.max(sDist, tDist));
            });

        var allConn = [focusN].concat(neighbors);
        fitToBBox(computeBBox(allConn), 40);
    }

    function unfocusNode() {
        restorePositions();
        focusedNodeId = null;
        clearHighlights();
        routeLinks();
        renderGraph();
    }

    function restorePositions() {
        Object.keys(savedPositions).forEach(function(nid) {
            var n = nodeData.find(function(nd) { return nd.id === nid; });
            if (n) { n.x = savedPositions[nid].x; n.y = savedPositions[nid].y; }
        });
        savedPositions = {};
    }

    /* ====================================================================
     * ZOOM / FIT
     * ==================================================================== */

    function computeBBox(nodeList) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodeList.forEach(function(n) {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + n.w > maxX) maxX = n.x + n.w;
            if (n.y + n.h > maxY) maxY = n.y + n.h;
        });
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    function setZoom(pct) {
        zoomLevel = pct;
        var wrap = document.getElementById('dcjs-graph-wrap');
        var cw = wrap ? wrap.clientWidth : 800;
        var ch = wrap ? wrap.clientHeight : 600;
        svg.transition().duration(200).call(
            zoomBehavior.transform,
            d3.zoomIdentity.translate(cw / 2, ch / 2).scale(pct / 100).translate(-cw / 2, -ch / 2)
        );
        DbRel.setZoomSlider(pct);
    }

    function fitToScreen() {
        if (!nodeData.length) return;
        fitToBBox(computeBBox(nodeData), 30);
    }

    function fitToBBox(bbox, padding) {
        var wrap = document.getElementById('dcjs-graph-wrap');
        if (!wrap) return;
        var cw = wrap.clientWidth, ch = wrap.clientHeight;
        if (!cw || !ch) return;
        var pad = padding || 30;

        var gw = bbox.w + pad * 2;
        var gh = bbox.h + pad * 2;
        var scale = Math.min(cw / gw, ch / gh, 1.5);
        scale = Math.max(scale, 0.02);
        var tx = (cw - bbox.w * scale) / 2 - (bbox.x - pad) * scale;
        var ty = (ch - bbox.h * scale) / 2 - (bbox.y - pad) * scale;

        svg.transition().duration(500).call(
            zoomBehavior.transform,
            d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
        zoomLevel = Math.round(scale * 100);
        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFilters(dbF, typeF) {
        // Toolbar filters combined with crossfilter
        gNodes.selectAll('.dcjs-card-node').each(function(d) {
            var toolbarVis = dbF[d.dbName] !== false;
            var cfVis = cfVisibleTables === null || cfVisibleTables.has(d.tableKey);
            d3.select(this).style('display', toolbarVis && cfVis ? '' : 'none');
        });

        gLinks.selectAll('.dcjs-rel-link').each(function(d) {
            var rd = d.relData;
            if (!rd) { d3.select(this).style('display', 'none'); return; }
            var typeVis = typeF[d.relType] !== false;
            var cfTypeVis = cfVisibleRelTypes === null || cfVisibleRelTypes.has(d.relType);
            var srcDb = rd.source.split('.')[0], tgtDb = rd.target.split('.')[0];
            var dbVis = dbF[srcDb] !== false && dbF[tgtDb] !== false;
            var cfSrcVis = cfVisibleTables === null || cfVisibleTables.has(rd.source);
            var cfTgtVis = cfVisibleTables === null || cfVisibleTables.has(rd.target);
            d3.select(this).style('display', typeVis && cfTypeVis && dbVis && cfSrcVis && cfTgtVis ? '' : 'none');
        });

        gLinkLabels.selectAll('.dcjs-rel-link-label').each(function(d) {
            var rd = d.relData;
            if (!rd) { d3.select(this).style('display', 'none'); return; }
            var typeVis = typeF[d.relType] !== false;
            var cfTypeVis = cfVisibleRelTypes === null || cfVisibleRelTypes.has(d.relType);
            var srcDb = rd.source.split('.')[0], tgtDb = rd.target.split('.')[0];
            var dbVis = dbF[srcDb] !== false && dbF[tgtDb] !== false;
            var cfSrcVis = cfVisibleTables === null || cfVisibleTables.has(rd.source);
            var cfTgtVis = cfVisibleTables === null || cfVisibleTables.has(rd.target);
            d3.select(this).style('display', typeVis && cfTypeVis && dbVis && cfSrcVis && cfTgtVis ? '' : 'none');
        });
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTable(tableKey) {
        var tableNodes = nodeData.filter(function(n) { return n.tableKey === tableKey; });
        if (tableNodes.length === 0) return;
        var n = tableNodes[0];
        fitToBBox({ x: n.x, y: n.y, w: n.w, h: n.h }, 100);
    }

    /* ====================================================================
     * MAIN BUILD
     * ==================================================================== */

    function fullBuild() {
        if (!DbRel.data) return;
        focusedNodeId = null;
        savedPositions = {};
        cfVisibleTables = null;
        cfVisibleRelTypes = null;

        buildGraphData();
        doLayout();
        routeLinks();
        renderGraph();
        setupCrossfilter();
        setTimeout(fitToScreen, 200);
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('dcjs', {
        init: function(el) {
            containerEl = el;
            // Suppress D3 v5 schemeCategory20c deprecation warning
            if (typeof dc !== 'undefined' && dc.config && dc.config.defaultColors) {
                dc.config.defaultColors(d3.schemeTableau10 || d3.schemeCategory10 || [
                    '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
                    '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'
                ]);
            }
            initSVG();
        },
        render: function() {
            fullBuild();
        },
        doLayout: function() {
            doLayout();
            routeLinks();
            renderGraph();
            updateGraphVisibility();
        },
        setZoom: function(pct) { setZoom(pct); },
        getZoom: function() { return zoomLevel; },
        fitToScreen: function() { fitToScreen(); },
        applyFilters: function(dbF, typeF) { applyFilters(dbF, typeF); },
        focusNode: function(nid) { focusNode(nid); },
        unfocusNode: function() { unfocusNode(); },
        centerOnTable: function(tk) { centerOnTable(tk); },
        getStats: function() {
            return { nodes: nodeData.length, links: linkData.length };
        },
        resize: function() {
            if (DbRel.data && nodeData.length > 0) {
                setTimeout(fitToScreen, 100);
            }
        },
        highlightTable: function(tk) {
            gNodes.selectAll('.dcjs-card-node').style('opacity', function(d) { return d.tableKey === tk ? 1 : 0.15; });
            gLinks.selectAll('.dcjs-rel-link').style('opacity', function(d) {
                return d.source.indexOf(tk) === 0 || d.target.indexOf(tk) === 0 ? 1 : 0.08;
            });
            gLinkLabels.selectAll('.dcjs-rel-link-label').style('opacity', function(d) {
                return d.source.indexOf(tk) === 0 || d.target.indexOf(tk) === 0 ? 1 : 0.08;
            });
        },
        clearHighlightTable: function() {
            gNodes.selectAll('.dcjs-card-node').style('opacity', null);
            gLinks.selectAll('.dcjs-rel-link').style('opacity', null);
            gLinkLabels.selectAll('.dcjs-rel-link-label').style('opacity', null);
        },
        destroy: function() {
            if (dbChart) { try { dbChart.filterAll(); } catch (e) {} dbChart = null; }
            if (typeChart) { try { typeChart.filterAll(); } catch (e) {} typeChart = null; }
            if (rowChart) { try { rowChart.filterAll(); } catch (e) {} rowChart = null; }
            ndx = null; dbDim = null; relTypeDim = null; rowCountDim = null;
            cfVisibleTables = null;
            cfVisibleRelTypes = null;
            svg = null;
            gRoot = null;
            gLinks = null;
            gLinkLabels = null;
            gNodes = null;
            zoomBehavior = null;
            nodeData = [];
            linkData = [];
            focusedNodeId = null;
            savedPositions = {};
            containerEl = null;
        }
    });

})();
