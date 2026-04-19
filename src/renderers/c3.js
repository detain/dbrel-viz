/**
 * Database Relationships - C3.js + D3 v5 Renderer
 * Main graph: custom D3 SVG with card nodes and routed links.
 * Charts: C3.js pie/bar/donut for analytics (unique feature).
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var containerEl, svg, gRoot, gLinks, gLinkLabels, gNodes, gGrid;
    var zoomBehavior;
    var zoomLevel = 100;
    var focusedNodeId = null;
    var savedPositions = {};
    var didPan = false;

    // Node/link data arrays
    var nodes = [];
    var links = [];

    // C3 chart instances
    var chartRelTypes, chartTableSizes, chartDbDist, chartConnections;
    var chartsPanelVisible = false;

    /* ====================================================================
     * SVG INITIALIZATION
     * ==================================================================== */

    function initSVG() {
        if (!containerEl) return;
        containerEl.innerHTML = '';

        // Create split layout: charts panel + graph area
        var chartsPanel = document.createElement('div');
        chartsPanel.id = 'c3-charts-panel';
        chartsPanel.className = 'c3-charts-panel';
        chartsPanel.style.cssText = 'display:none;overflow-y:auto;background:#1a1d23;border-bottom:1px solid #333;padding:8px;';
        chartsPanel.innerHTML =
            '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">' +
            '<div id="c3-chart-rel-types" style="flex:1;min-width:220px;max-width:280px;"></div>' +
            '<div id="c3-chart-table-sizes" style="flex:2;min-width:300px;max-width:500px;"></div>' +
            '<div id="c3-chart-db-dist" style="flex:1;min-width:220px;max-width:280px;"></div>' +
            '<div id="c3-chart-connections" style="flex:1;min-width:250px;max-width:400px;"></div>' +
            '</div>';
        containerEl.appendChild(chartsPanel);

        var graphWrap = document.createElement('div');
        graphWrap.id = 'c3-graph-wrap';
        graphWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;min-height:400px;width:100%;height:100%;';
        containerEl.appendChild(graphWrap);

        containerEl.style.display = 'flex';
        containerEl.style.flexDirection = 'column';
        containerEl.style.height = '100%';

        var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.style.background = '#0d1117';
        graphWrap.appendChild(svgEl);

        svg = d3.select(svgEl);
        svg.selectAll('*').remove();

        // Defs
        var defs = svg.append('defs');

        // Card glow filter
        var cardGlow = defs.append('filter').attr('id', 'c3-card-glow')
            .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
        cardGlow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
        cardGlow.append('feFlood').attr('flood-color', '#42a5f5').attr('flood-opacity', '0.4').attr('result', 'color');
        cardGlow.append('feComposite').attr('in', 'color').attr('in2', 'blur').attr('operator', 'in').attr('result', 'glow');
        var m1 = cardGlow.append('feMerge');
        m1.append('feMergeNode').attr('in', 'glow');
        m1.append('feMergeNode').attr('in', 'SourceGraphic');

        // Arrow markers
        var linkStyles = DbRel.LINK_STYLES;
        ['direct', 'find_in_set', 'cross_db'].forEach(function(type) {
            var st = linkStyles[type];
            defs.append('marker')
                .attr('id', 'c3-arrow-' + type)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 8).attr('refY', 0)
                .attr('markerWidth', 8).attr('markerHeight', 8)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-4L8,0L0,4')
                .attr('fill', 'none')
                .attr('stroke', st.stroke)
                .attr('stroke-width', 1);
        });

        // Grid pattern
        var gridPat = defs.append('pattern')
            .attr('id', 'c3-grid-pattern')
            .attr('width', 20).attr('height', 20)
            .attr('patternUnits', 'userSpaceOnUse');
        gridPat.append('circle')
            .attr('cx', 10).attr('cy', 10).attr('r', 0.5)
            .attr('fill', 'rgba(255,255,255,0.06)');

        gRoot = svg.append('g').attr('class', 'c3-root-group');

        gGrid = gRoot.append('rect')
            .attr('width', 20000).attr('height', 20000)
            .attr('x', -5000).attr('y', -5000)
            .attr('fill', 'url(#c3-grid-pattern)');

        gLinks = gRoot.append('g').attr('class', 'c3-links-layer');
        gLinkLabels = gRoot.append('g').attr('class', 'c3-link-labels-layer');
        gNodes = gRoot.append('g').attr('class', 'c3-nodes-layer');

        // Zoom/pan (D3 v5)
        zoomBehavior = d3.zoom()
            .scaleExtent([0.02, 3])
            .on('zoom', function() {
                gRoot.attr('transform', d3.event.transform);
                zoomLevel = Math.round(d3.event.transform.k * 100);
                DbRel.setZoomSlider(zoomLevel);
            });

        svg.call(zoomBehavior);

        svg.on('mousedown.pantrack', function() { didPan = false; });
        svg.on('mousemove.pantrack', function() { didPan = true; });
        svg.on('click.blank', function() {
            if (d3.event.target === svgEl || d3.event.target.classList.contains('c3-root-group')) {
                if (focusedNodeId && !didPan) unfocusNode();
            }
        });
    }

    /* ====================================================================
     * BUILD NODE/LINK DATA
     * ==================================================================== */

    function nodeById(id) {
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].id === id) return nodes[i];
        }
        return null;
    }

    function buildNodeData() {
        nodes = [];
        links = [];
        if (!DbRel.data) return;

        if (DbRel.displayMode === 'grouped') {
            buildGroupedData();
        } else {
            buildSeparateData();
        }
    }

    function buildSeparateData() {
        var tableKeys = Object.keys(DbRel.data.tables);
        var linkStyles = DbRel.LINK_STYLES;

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);

            tableInfo.rows.forEach(function(row, ri) {
                var nodeId = tableKey + ':' + ri;
                var headerLabel = DbRel.getNodeHeader(tableKey, ri);
                var textLines = DbRel.getNodeLines(tableKey, ri);
                var size = DbRel.computeNodeSize(headerLabel, textLines);

                nodes.push({
                    id: nodeId,
                    x: 0, y: 0,
                    w: size.w, h: size.h,
                    tableKey: tableKey,
                    dbName: dbName,
                    tableName: tableName,
                    rowIndex: ri,
                    textLines: textLines,
                    headerLabel: headerLabel,
                    colors: colors
                });
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = linkStyles[rel.type] || linkStyles['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                if (!nodeById(srcNodeId)) return;
                match[1].forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    if (!nodeById(tgtNodeId)) return;
                    links.push({
                        id: srcNodeId + '->' + tgtNodeId,
                        sourceId: srcNodeId,
                        targetId: tgtNodeId,
                        type: rel.type,
                        label: rel.source_field + '\u2192' + rel.target_field,
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

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var textLines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, textLines);

            nodes.push({
                id: tableKey,
                x: 0, y: 0,
                w: size.w, h: size.h,
                tableKey: tableKey,
                dbName: dbName,
                tableName: tableName,
                rowIndex: 0,
                textLines: textLines,
                headerLabel: tableName + ' (' + tableInfo.total + ')',
                colors: colors
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            if (!nodeById(rel.source) || !nodeById(rel.target)) return;
            var style = linkStyles[rel.type] || linkStyles['direct'];
            links.push({
                id: rel.source + '->' + rel.target + ':' + rel.source_field,
                sourceId: rel.source,
                targetId: rel.target,
                type: rel.type,
                label: rel.label,
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
        var wrap = document.getElementById('c3-graph-wrap');
        var cW = wrap ? wrap.clientWidth : 1200;
        var cH = wrap ? wrap.clientHeight : 700;
        var positions = DbRel.computeLayout(cW, cH);

        nodes.forEach(function(n) {
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

        var allBounds = nodes.map(function(n) {
            return { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h,
                cx: n.x + n.w / 2, cy: n.y + n.h / 2,
                r: n.x + n.w, b: n.y + n.h };
        });
        var boundsById = {};
        allBounds.forEach(function(b) { boundsById[b.id] = b; });

        var sourceGroups = {}, targetGroups = {};
        links.forEach(function(lnk) {
            if (!boundsById[lnk.sourceId] || !boundsById[lnk.targetId]) return;
            if (!sourceGroups[lnk.sourceId]) sourceGroups[lnk.sourceId] = [];
            sourceGroups[lnk.sourceId].push(lnk);
            if (!targetGroups[lnk.targetId]) targetGroups[lnk.targetId] = [];
            targetGroups[lnk.targetId].push(lnk);
        });

        Object.keys(sourceGroups).forEach(function(sId) {
            sourceGroups[sId].sort(function(a, b) {
                var aB = boundsById[a.targetId], bB = boundsById[b.targetId];
                return (aB ? aB.cy : 0) - (bB ? bB.cy : 0);
            });
        });
        Object.keys(targetGroups).forEach(function(tId) {
            targetGroups[tId].sort(function(a, b) {
                var aB = boundsById[a.sourceId], bB = boundsById[b.sourceId];
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

        links.forEach(function(lnk) {
            var sB = boundsById[lnk.sourceId], tB = boundsById[lnk.targetId];
            if (!sB || !tB) { lnk.vertices = []; return; }

            var sGroup = sourceGroups[lnk.sourceId] || [lnk];
            var tGroup = targetGroups[lnk.targetId] || [lnk];
            var sIdx = sGroup.indexOf(lnk);
            var tIdx = tGroup.indexOf(lnk);

            var sSpread = Math.min(sB.h * 0.8, sGroup.length * LANE_GAP);
            var sStep = sGroup.length > 1 ? sSpread / (sGroup.length - 1) : 0;
            var exitY = sB.cy + (sIdx - (sGroup.length - 1) / 2) * sStep;

            var tSpread = Math.min(tB.h * 0.8, tGroup.length * LANE_GAP);
            var tStep = tGroup.length > 1 ? tSpread / (tGroup.length - 1) : 0;
            var enterY = tB.cy + (tIdx - (tGroup.length - 1) / 2) * tStep;

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

            var exitX = bestCombo.exitX;
            var enterX = bestCombo.enterX;
            var padX1 = bestCombo.exitSide === 'right' ? exitX + EXIT_PAD : exitX - EXIT_PAD;
            var padX2 = bestCombo.enterSide === 'left' ? enterX - EXIT_PAD : enterX + EXIT_PAD;

            var skipSource = {}; skipSource[lnk.sourceId] = true;
            var skipTarget = {}; skipTarget[lnk.targetId] = true;
            var skipBoth = {}; skipBoth[lnk.sourceId] = true; skipBoth[lnk.targetId] = true;

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

            lnk.exitX = exitX;
            lnk.exitY = exitY;
            lnk.enterX = enterX;
            lnk.enterY = enterY;
            lnk.vertices = vertices;
        });
    }

    /* ====================================================================
     * RENDER D3 GRAPH
     * ==================================================================== */

    function renderGraph() {
        if (!svg) return;
        var HDR_H = DbRel.HDR_H, PAD = DbRel.PAD, ROW_H = DbRel.ROW_H;

        // Links
        var linkSel = gLinks.selectAll('.c3-rel-link').data(links, function(d) { return d.id; });
        linkSel.exit().remove();
        linkSel.enter().append('path')
            .attr('class', function(d) { return 'c3-rel-link c3-type-' + d.type; })
            .attr('fill', 'none')
            .attr('marker-end', function(d) { return 'url(#c3-arrow-' + d.type + ')'; })
            .merge(linkSel)
            .attr('d', function(d) {
                if (!d.vertices || d.vertices.length === 0) {
                    var sn = nodeById(d.sourceId), tn = nodeById(d.targetId);
                    if (!sn || !tn) return '';
                    return 'M' + (sn.x + sn.w) + ',' + (sn.y + sn.h / 2) +
                           'L' + tn.x + ',' + (tn.y + tn.h / 2);
                }
                var pts = d.vertices;
                var path = 'M' + (d.exitX || pts[0].x) + ',' + (d.exitY || pts[0].y);
                pts.forEach(function(p) { path += 'L' + p.x + ',' + p.y; });
                path += 'L' + (d.enterX || pts[pts.length - 1].x) + ',' + (d.enterY || pts[pts.length - 1].y);
                return path;
            })
            .attr('stroke', function(d) { return d.style.stroke; })
            .attr('stroke-width', function(d) { return d.style.strokeWidth; })
            .attr('stroke-dasharray', function(d) { return d.style.strokeDasharray === '0' ? null : d.style.strokeDasharray; })
            .on('mouseenter', function(d) { onLinkHover(d, d3.event); })
            .on('mouseleave', function() { onLinkLeave(); });

        // Link labels
        var labelSel = gLinkLabels.selectAll('.c3-link-label').data(links, function(d) { return d.id; });
        labelSel.exit().remove();
        var labelEnter = labelSel.enter().append('g').attr('class', 'c3-link-label');
        labelEnter.append('rect').attr('class', 'c3-link-label-bg')
            .attr('fill', 'rgba(13,17,23,0.85)').attr('rx', 2);
        labelEnter.append('text').attr('class', 'c3-link-label-text')
            .attr('fill', '#8b949e').attr('font-size', '8px').attr('font-family', 'monospace');

        var labelAll = labelEnter.merge(labelSel);
        labelAll.each(function(d) {
            var g = d3.select(this);
            var midPt = getLinkMidpoint(d);
            var text = g.select('.c3-link-label-text').text(d.label)
                .attr('x', midPt.x).attr('y', midPt.y + 3).attr('text-anchor', 'middle');
            var bbox = text.node().getBBox();
            g.select('.c3-link-label-bg')
                .attr('x', bbox.x - 2).attr('y', bbox.y - 1)
                .attr('width', bbox.width + 4).attr('height', bbox.height + 2);
        });

        // Nodes
        var nodeSel = gNodes.selectAll('.c3-node-card').data(nodes, function(d) { return d.id; });
        nodeSel.exit().remove();

        var nodeEnter = nodeSel.enter().append('g')
            .attr('class', 'c3-node-card')
            .call(d3.drag()
                .on('start', onDragStart)
                .on('drag', onDragMove)
                .on('end', onDragEnd)
            );

        nodeEnter.append('rect').attr('class', 'c3-card-body');
        nodeEnter.append('rect').attr('class', 'c3-card-header');
        nodeEnter.append('rect').attr('class', 'c3-card-header-mask');
        nodeEnter.each(function(d) {
            var iconInfo = DbRel.getTableIconInfo(d.tableName);
            if (iconInfo && iconInfo.src) {
                d3.select(this).append('image').attr('class', 'c3-header-icon')
                    .attr('xlink:href', iconInfo.src)
                    .attr('x', 3).attr('y', 3)
                    .attr('width', 16).attr('height', 16);
            }
        });
        nodeEnter.append('text').attr('class', 'c3-header-text')
            .attr('fill', '#fff').attr('font-size', '10px').attr('font-weight', 'bold').attr('font-family', 'monospace');

        var nodeAll = nodeEnter.merge(nodeSel);
        nodeAll
            .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; })
            .on('click', function(d) { d3.event.stopPropagation(); onNodeClick(d); })
            .on('dblclick', function(d) { d3.event.stopPropagation(); DbRel.showRowModal(d.tableKey, d.rowIndex); })
            .on('mouseenter', function(d) { onNodeHover(d); })
            .on('mouseleave', function() { onNodeLeave(); });

        nodeAll.select('.c3-card-body')
            .attr('width', function(d) { return d.w; })
            .attr('height', function(d) { return d.h; })
            .attr('fill', function(d) { return d.colors.bg; })
            .attr('stroke', function(d) { return d.colors.border; })
            .attr('stroke-width', 1).attr('rx', 4).attr('ry', 4);

        nodeAll.select('.c3-card-header')
            .attr('width', function(d) { return d.w; })
            .attr('height', HDR_H)
            .attr('fill', function(d) { return d.colors.header; })
            .attr('rx', 4).attr('ry', 4);

        nodeAll.select('.c3-card-header-mask')
            .attr('width', function(d) { return d.w; })
            .attr('height', 10).attr('y', 12)
            .attr('fill', function(d) { return d.colors.header; });

        nodeAll.select('.c3-header-text')
            .attr('x', function(d) { return DbRel.getTableIconInfo(d.tableName) ? 22 : 6; }).attr('y', 15)
            .text(function(d) { return d.headerLabel; });

        // Row text
        nodeAll.selectAll('.c3-field-text').remove();
        nodeAll.selectAll('.c3-pivot-icon').remove();
        nodeAll.each(function(d) {
            var g = d3.select(this);
            d.textLines.forEach(function(line, i) {
                g.append('text')
                    .attr('class', 'c3-field-text')
                    .attr('x', 6)
                    .attr('y', HDR_H + PAD + (i + 1) * ROW_H)
                    .attr('fill', '#c9d1d9').attr('font-size', '9px').attr('font-family', 'monospace')
                    .text(line);
            });

            // Pivot icon for pivotable tables
            var pivotInfo = DbRel.getNodePivotInfo(d.tableKey, d.rowIndex);
            if (pivotInfo) {
                g.append('text')
                    .attr('class', 'c3-pivot-icon')
                    .attr('x', d.w - 14)
                    .attr('y', 15)
                    .attr('font-size', '11px')
                    .attr('font-family', 'sans-serif')
                    .attr('fill', '#fff')
                    .attr('cursor', 'pointer')
                    .attr('pointer-events', 'all')
                    .attr('opacity', 0.6)
                    .text('\u2316')
                    .on('mouseenter', function() { d3.select(this).attr('opacity', 1); })
                    .on('mouseleave', function() { d3.select(this).attr('opacity', 0.6); })
                    .on('click', function() {
                        d3.event.stopPropagation();
                        DbRel.pivotTo(d.tableKey, d.rowIndex);
                    });
            }
        });
    }

    function getLinkMidpoint(lnk) {
        if (lnk.vertices && lnk.vertices.length >= 2) {
            var mid = Math.floor(lnk.vertices.length / 2);
            var a = lnk.vertices[mid - 1], b = lnk.vertices[mid];
            return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
        var sn = nodeById(lnk.sourceId), tn = nodeById(lnk.targetId);
        if (sn && tn) {
            return { x: (sn.x + sn.w / 2 + tn.x + tn.w / 2) / 2,
                     y: (sn.y + sn.h / 2 + tn.y + tn.h / 2) / 2 };
        }
        return { x: 0, y: 0 };
    }

    /* ====================================================================
     * DRAG
     * ==================================================================== */

    function onDragStart(d) {
        d3.event.sourceEvent.stopPropagation();
        d._dragStartX = d.x;
        d._dragStartY = d.y;
    }

    function onDragMove(d) {
        d.x += d3.event.dx;
        d.y += d3.event.dy;
        d3.select(this).attr('transform', 'translate(' + d.x + ',' + d.y + ')');
        updateLinksForNode(d.id);
    }

    function onDragEnd(d) {
        if (Math.abs(d.x - d._dragStartX) < 3 && Math.abs(d.y - d._dragStartY) < 3) return;
        routeLinks();
        renderGraph();
    }

    function updateLinksForNode(nodeId) {
        gLinks.selectAll('.c3-rel-link').each(function(d) {
            if (d.sourceId === nodeId || d.targetId === nodeId) {
                var sn = nodeById(d.sourceId), tn = nodeById(d.targetId);
                if (sn && tn) {
                    d3.select(this).attr('d',
                        'M' + (sn.x + sn.w) + ',' + (sn.y + sn.h / 2) +
                        'L' + tn.x + ',' + (tn.y + tn.h / 2)
                    );
                }
            }
        });
        gLinkLabels.selectAll('.c3-link-label').each(function(d) {
            if (d.sourceId === nodeId || d.targetId === nodeId) {
                var midPt = getLinkMidpoint(d);
                var g = d3.select(this);
                g.select('.c3-link-label-text').attr('x', midPt.x).attr('y', midPt.y + 3);
                var bbox = g.select('.c3-link-label-text').node().getBBox();
                g.select('.c3-link-label-bg')
                    .attr('x', bbox.x - 2).attr('y', bbox.y - 1)
                    .attr('width', bbox.width + 4).attr('height', bbox.height + 2);
            }
        });
    }

    /* ====================================================================
     * INTERACTIONS
     * ==================================================================== */

    function onNodeClick(d) {
        if (focusedNodeId === d.id) {
            unfocusNode();
        } else {
            focusNode(d.id);
        }
    }

    function onNodeHover(d) {
        if (focusedNodeId) return;
        highlightConnected(d.id, false);
    }

    function onNodeLeave() {
        if (focusedNodeId) return;
        clearHighlights();
    }

    function onLinkHover(d, evt) {
        d3.select(evt.currentTarget).classed('c3-highlighted', true);
        gNodes.selectAll('.c3-node-card').each(function(nd) {
            if (nd.id === d.sourceId || nd.id === d.targetId) {
                d3.select(this).classed('c3-highlighted', true);
            }
        });
        if (d.relData) {
            DbRel.showTooltip(DbRel.getLinkTooltipHtml(d.relData), evt.clientX + 12, evt.clientY + 12);
        }
    }

    function onLinkLeave() {
        DbRel.hideTooltip();
        if (!focusedNodeId) clearHighlights();
    }

    function highlightConnected(nodeId, dimOthers) {
        var connIds = {};
        connIds[nodeId] = true;
        links.forEach(function(lnk) {
            if (lnk.sourceId === nodeId || lnk.targetId === nodeId) {
                connIds[lnk.sourceId] = true;
                connIds[lnk.targetId] = true;
            }
        });

        gNodes.selectAll('.c3-node-card')
            .classed('c3-highlighted', function(d) { return !!connIds[d.id]; })
            .classed('c3-dimmed', function(d) { return dimOthers && !connIds[d.id]; });

        gLinks.selectAll('.c3-rel-link')
            .classed('c3-highlighted', function(d) { return d.sourceId === nodeId || d.targetId === nodeId; })
            .classed('c3-dimmed', function(d) { return dimOthers && d.sourceId !== nodeId && d.targetId !== nodeId; });

        gLinkLabels.selectAll('.c3-link-label')
            .classed('c3-highlighted', function(d) { return d.sourceId === nodeId || d.targetId === nodeId; })
            .classed('c3-dimmed', function(d) { return dimOthers && d.sourceId !== nodeId && d.targetId !== nodeId; });
    }

    function clearHighlights() {
        gNodes.selectAll('.c3-node-card').classed('c3-highlighted', false).classed('c3-dimmed', false).style('opacity', null);
        gLinks.selectAll('.c3-rel-link').classed('c3-highlighted', false).classed('c3-dimmed', false).style('opacity', null);
        gLinkLabels.selectAll('.c3-link-label').classed('c3-highlighted', false).classed('c3-dimmed', false).style('opacity', null);
    }

    function focusNode(nodeId) {
        if (focusedNodeId && focusedNodeId !== nodeId) restorePositions();

        focusedNodeId = nodeId;
        var focusN = nodeById(nodeId);
        if (!focusN) return;

        var connIds = {};
        connIds[nodeId] = true;
        links.forEach(function(lnk) {
            if (lnk.sourceId === nodeId || lnk.targetId === nodeId) {
                connIds[lnk.sourceId] = true;
                connIds[lnk.targetId] = true;
            }
        });

        var neighbors = nodes.filter(function(n) { return n.id !== nodeId && connIds[n.id]; });

        savedPositions = {};
        neighbors.forEach(function(n) { savedPositions[n.id] = { x: n.x, y: n.y }; });

        var cx = focusN.x + focusN.w / 2;
        var cy = focusN.y + focusN.h / 2;
        var radius = Math.max(200, neighbors.length * 30);
        var angleStep = (2 * Math.PI) / Math.max(neighbors.length, 1);

        neighbors.forEach(function(n, i) {
            var angle = -Math.PI / 2 + i * angleStep;
            n.x = cx + radius * Math.cos(angle) - n.w / 2;
            n.y = cy + radius * Math.sin(angle) - n.h / 2;
        });

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(nodeId);
        clearHighlights();

        gNodes.selectAll('.c3-node-card')
            .classed('c3-highlighted', function(d) { return distances[d.id] !== undefined && distances[d.id] <= 1; })
            .style('opacity', function(d) { return DbRel.distanceToOpacity(distances[d.id]); });

        gLinks.selectAll('.c3-rel-link')
            .classed('c3-highlighted', function(d) { return d.sourceId === nodeId || d.targetId === nodeId; })
            .style('opacity', function(d) {
                var sDist = distances[d.sourceId] !== undefined ? distances[d.sourceId] : Infinity;
                var tDist = distances[d.targetId] !== undefined ? distances[d.targetId] : Infinity;
                return DbRel.distanceToOpacity(Math.max(sDist, tDist));
            });

        gLinkLabels.selectAll('.c3-link-label')
            .style('opacity', function(d) {
                var sDist = distances[d.sourceId] !== undefined ? distances[d.sourceId] : Infinity;
                var tDist = distances[d.targetId] !== undefined ? distances[d.targetId] : Infinity;
                return DbRel.distanceToOpacity(Math.max(sDist, tDist));
            });

        routeLinks();
        renderGraph();

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
        Object.keys(savedPositions).forEach(function(id) {
            var n = nodeById(id);
            if (n) { n.x = savedPositions[id].x; n.y = savedPositions[id].y; }
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
        var transform = d3.zoomTransform(svg.node());
        var newTransform = d3.zoomIdentity.translate(transform.x, transform.y).scale(pct / 100);
        svg.call(zoomBehavior.transform, newTransform);
        DbRel.setZoomSlider(pct);
    }

    function fitToScreen() {
        if (nodes.length === 0) return;
        fitToBBox(computeBBox(nodes), 30);
    }

    function fitToBBox(bbox, padding) {
        var wrap = document.getElementById('c3-graph-wrap');
        if (!wrap) return;
        var wW = wrap.clientWidth;
        var wH = wrap.clientHeight;
        var pad = padding || 30;

        var scaleX = (wW - pad * 2) / bbox.w;
        var scaleY = (wH - pad * 2) / bbox.h;
        var scale = Math.min(scaleX, scaleY, 1.5);
        scale = Math.max(scale, 0.02);

        var tx = wW / 2 - (bbox.x + bbox.w / 2) * scale;
        var ty = wH / 2 - (bbox.y + bbox.h / 2) * scale;

        var transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        svg.transition().duration(300).call(zoomBehavior.transform, transform);
        zoomLevel = Math.round(scale * 100);
        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFilters(dbF, typeF) {
        gNodes.selectAll('.c3-node-card')
            .style('display', function(d) { return dbF[d.dbName] !== false ? '' : 'none'; });

        gLinks.selectAll('.c3-rel-link')
            .style('display', function(d) {
                var sn = nodeById(d.sourceId), tn = nodeById(d.targetId);
                return typeF[d.type] !== false &&
                    dbF[sn ? sn.dbName : ''] !== false &&
                    dbF[tn ? tn.dbName : ''] !== false ? '' : 'none';
            });

        gLinkLabels.selectAll('.c3-link-label')
            .style('display', function(d) {
                var sn = nodeById(d.sourceId), tn = nodeById(d.targetId);
                return typeF[d.type] !== false &&
                    dbF[sn ? sn.dbName : ''] !== false &&
                    dbF[tn ? tn.dbName : ''] !== false ? '' : 'none';
            });
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTable(tableKey) {
        var target = null;
        if (DbRel.displayMode === 'grouped') {
            target = nodeById(tableKey);
        } else {
            target = nodeById(tableKey + ':0');
        }
        if (!target) return;
        fitToBBox({ x: target.x, y: target.y, w: target.w, h: target.h }, 100);
    }

    /* ====================================================================
     * C3 CHARTS (unique feature)
     * ==================================================================== */

    function updateCharts() {
        if (!DbRel.data) return;
        var panel = document.getElementById('c3-charts-panel');
        if (!panel || panel.style.display === 'none') return;

        // 1. Relationship type distribution (donut)
        var typeCounts = { direct: 0, find_in_set: 0, cross_db: 0 };
        DbRel.data.relationships.forEach(function(r) { typeCounts[r.type] = (typeCounts[r.type] || 0) + 1; });

        if (chartRelTypes) chartRelTypes.destroy();
        chartRelTypes = c3.generate({
            bindto: '#c3-chart-rel-types',
            data: {
                columns: [
                    ['Direct FK', typeCounts.direct || 0],
                    ['FIND_IN_SET', typeCounts.find_in_set || 0],
                    ['Cross-DB', typeCounts.cross_db || 0]
                ],
                type: 'donut',
                colors: { 'Direct FK': '#64b5f6', 'FIND_IN_SET': '#ce93d8', 'Cross-DB': '#ffb74d' }
            },
            donut: { title: 'Types', width: 30 },
            size: { height: 180 },
            legend: { position: 'right' }
        });

        // 2. Table sizes bar chart (top 15)
        var tableNames = [];
        var tableSizes = ['Rows'];
        Object.keys(DbRel.data.tables).sort(function(a, b) {
            return DbRel.data.tables[b].total - DbRel.data.tables[a].total;
        }).slice(0, 15).forEach(function(tk) {
            tableNames.push(tk.split('.')[1]);
            tableSizes.push(DbRel.data.tables[tk].total);
        });

        if (chartTableSizes) chartTableSizes.destroy();
        chartTableSizes = c3.generate({
            bindto: '#c3-chart-table-sizes',
            data: {
                columns: [tableSizes],
                type: 'bar',
                colors: { 'Rows': '#42a5f5' }
            },
            bar: { width: { ratio: 0.7 } },
            axis: {
                x: { type: 'category', categories: tableNames, tick: { rotate: 45, multiline: false } },
                y: { label: 'Row Count' }
            },
            size: { height: 180 },
            legend: { show: false }
        });

        // 3. DB distribution (pie)
        var dbCounts = {};
        Object.keys(DbRel.data.tables).forEach(function(tk) {
            var db = tk.split('.')[0];
            dbCounts[db] = (dbCounts[db] || 0) + 1;
        });
        var dbColumns = Object.keys(dbCounts).map(function(db) { return [db, dbCounts[db]]; });

        if (chartDbDist) chartDbDist.destroy();
        chartDbDist = c3.generate({
            bindto: '#c3-chart-db-dist',
            data: {
                columns: dbColumns,
                type: 'pie',
                colors: { 'my': '#42a5f5', 'kayako_v4': '#66bb6a', 'pdns': '#ffa726' }
            },
            size: { height: 180 },
            legend: { position: 'right' }
        });

        // 4. Connections per table (horizontal bar)
        var connCounts = {};
        DbRel.data.relationships.forEach(function(r) {
            var sName = r.source.split('.')[1];
            var tName = r.target.split('.')[1];
            connCounts[sName] = (connCounts[sName] || 0) + 1;
            connCounts[tName] = (connCounts[tName] || 0) + 1;
        });

        var connNames = Object.keys(connCounts).sort(function(a, b) { return connCounts[b] - connCounts[a]; }).slice(0, 12);
        var connData = ['Connections'];
        connNames.forEach(function(n) { connData.push(connCounts[n]); });

        if (chartConnections) chartConnections.destroy();
        chartConnections = c3.generate({
            bindto: '#c3-chart-connections',
            data: {
                columns: [connData],
                type: 'bar',
                colors: { 'Connections': '#ce93d8' }
            },
            bar: { width: { ratio: 0.65 } },
            axis: {
                rotated: true,
                x: { type: 'category', categories: connNames },
                y: { label: 'Links' }
            },
            size: { height: 180 },
            legend: { show: false }
        });
    }

    function toggleChartsPanel() {
        chartsPanelVisible = !chartsPanelVisible;
        var panel = document.getElementById('c3-charts-panel');
        if (panel) {
            panel.style.display = chartsPanelVisible ? '' : 'none';
            if (chartsPanelVisible && DbRel.data) {
                updateCharts();
            }
        }
    }

    /* ====================================================================
     * MAIN BUILD
     * ==================================================================== */

    function buildAll() {
        if (!DbRel.data) return;
        focusedNodeId = null;
        savedPositions = {};
        buildNodeData();
        doLayout();
        routeLinks();
        renderGraph();
        if (chartsPanelVisible) updateCharts();
        setTimeout(fitToScreen, 100);
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('c3', {
        init: function(el) {
            containerEl = el;
            initSVG();
            // Auto-show charts panel for C3 (unique feature)
            chartsPanelVisible = true;
            var panel = document.getElementById('c3-charts-panel');
            if (panel) panel.style.display = '';
        },
        render: function() {
            buildAll();
        },
        doLayout: function() {
            doLayout();
            routeLinks();
            renderGraph();
        },
        setZoom: function(pct) { setZoom(pct); },
        getZoom: function() { return zoomLevel; },
        fitToScreen: function() { fitToScreen(); },
        applyFilters: function(dbF, typeF) { applyFilters(dbF, typeF); },
        focusNode: function(nid) { focusNode(nid); },
        unfocusNode: function() { unfocusNode(); },
        centerOnTable: function(tk) { centerOnTable(tk); },
        getStats: function() {
            return { nodes: nodes.length, links: links.length };
        },
        resize: function() {
            if (DbRel.data && nodes.length > 0) {
                setTimeout(fitToScreen, 100);
            }
        },
        highlightTable: function(tk) {
            gNodes.selectAll('.c3-node-card').style('opacity', function(d) { return d.tableKey === tk ? 1 : 0.15; });
            gLinks.selectAll('.c3-rel-link').style('opacity', function(d) {
                return d.sourceId.indexOf(tk) === 0 || d.targetId.indexOf(tk) === 0 ? 1 : 0.08;
            });
            gLinkLabels.selectAll('.c3-link-label').style('opacity', function(d) {
                return d.sourceId.indexOf(tk) === 0 || d.targetId.indexOf(tk) === 0 ? 1 : 0.08;
            });
        },
        clearHighlightTable: function() {
            gNodes.selectAll('.c3-node-card').style('opacity', null);
            gLinks.selectAll('.c3-rel-link').style('opacity', null);
            gLinkLabels.selectAll('.c3-link-label').style('opacity', null);
        },
        destroy: function() {
            if (chartRelTypes) { chartRelTypes.destroy(); chartRelTypes = null; }
            if (chartTableSizes) { chartTableSizes.destroy(); chartTableSizes = null; }
            if (chartDbDist) { chartDbDist.destroy(); chartDbDist = null; }
            if (chartConnections) { chartConnections.destroy(); chartConnections = null; }
            svg = null;
            gRoot = null;
            gLinks = null;
            gLinkLabels = null;
            gNodes = null;
            gGrid = null;
            zoomBehavior = null;
            nodes = [];
            links = [];
            focusedNodeId = null;
            savedPositions = {};
            chartsPanelVisible = false;
            containerEl = null;
        }
    });

})();
