/**
 * Database Relationships - NVD3 + D3 v3 Renderer
 * Main graph: custom D3 v3 SVG with card nodes and link routing.
 * Charts: NVD3 analytics charts (unique feature).
 * Uses D3 v3 throughout (required by NVD3 1.8.x).
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var containerEl, svgSel, gRoot;
    var zoomBehavior;
    var zoomLevel = 100;
    var focusedNodeId = null;
    var savedPositions = {};
    var chartsPanelVisible = true;

    // Node/link data arrays
    var graphNodes = [];
    var graphLinks = [];

    // NVD3 chart instances
    var barChart = null, pieChart = null;

    /* ====================================================================
     * SVG INITIALIZATION (D3 v3 API)
     * ==================================================================== */

    function initSVG() {
        if (!containerEl) return;
        containerEl.innerHTML = '';

        // Create split layout: charts panel on top, graph below
        containerEl.style.display = 'flex';
        containerEl.style.flexDirection = 'column';
        containerEl.style.height = '100%';

        var chartsPanel = document.createElement('div');
        chartsPanel.id = 'nvd3-charts-panel';
        chartsPanel.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:#1a1d23;border-bottom:1px solid #333;max-height:220px;overflow-y:auto;';
        chartsPanel.innerHTML =
            '<div style="flex:2;min-width:300px;"><div style="color:#8b949e;font-size:11px;font-weight:600;margin-bottom:4px;">TABLE ROW COUNTS</div>' +
            '<svg id="nvd3-bar-chart-svg" style="width:100%;height:170px;"></svg></div>' +
            '<div style="flex:1;min-width:200px;"><div style="color:#8b949e;font-size:11px;font-weight:600;margin-bottom:4px;">RELATIONSHIP TYPES</div>' +
            '<svg id="nvd3-pie-chart-svg" style="width:100%;height:170px;"></svg></div>';
        containerEl.appendChild(chartsPanel);

        var graphWrap = document.createElement('div');
        graphWrap.id = 'nvd3-graph-wrap';
        graphWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;min-height:400px;';
        containerEl.appendChild(graphWrap);

        // D3 v3 zoom
        zoomBehavior = d3.behavior.zoom()
            .scaleExtent([0.02, 5])
            .on('zoom', function() {
                gRoot.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
                zoomLevel = Math.round(d3.event.scale * 100);
                DbRel.setZoomSlider(zoomLevel);
            });

        svgSel = d3.select(graphWrap).append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .style('background', '#0d1117')
            .call(zoomBehavior);

        gRoot = svgSel.append('g');

        // Blank click to unfocus
        svgSel.on('click', function() {
            if (focusedNodeId) unfocusNode();
        });
    }

    /* ====================================================================
     * BUILD NODE/LINK DATA
     * ==================================================================== */

    function nodeById(id) {
        for (var i = 0; i < graphNodes.length; i++) {
            if (graphNodes[i].id === id) return graphNodes[i];
        }
        return null;
    }

    function buildGraphData() {
        if (!DbRel.data) return;
        graphNodes = [];
        graphLinks = [];
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

                graphNodes.push({
                    id: nodeId,
                    tableKey: tableKey,
                    dbName: dbName,
                    tableName: tableName,
                    rowIndex: ri,
                    headerLabel: headerLabel,
                    textLines: textLines,
                    colors: colors,
                    w: size.w, h: size.h,
                    x: 0, y: 0
                });
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = linkStyles[rel.type] || linkStyles['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                var srcNode = nodeById(srcNodeId);
                if (!srcNode) return;
                match[1].forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    if (!nodeById(tgtNodeId)) return;
                    graphLinks.push({
                        source: srcNodeId, target: tgtNodeId,
                        type: rel.type,
                        label: rel.source_field + '\u2192' + rel.target_field,
                        relData: rel, style: style
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

            graphNodes.push({
                id: tableKey,
                tableKey: tableKey,
                dbName: dbName,
                tableName: tableName,
                rowIndex: 0,
                headerLabel: tableName + ' (' + tableInfo.total + ')',
                textLines: textLines,
                colors: colors,
                w: size.w, h: size.h,
                x: 0, y: 0
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            if (!nodeById(rel.source) || !nodeById(rel.target)) return;
            var style = linkStyles[rel.type] || linkStyles['direct'];
            graphLinks.push({
                source: rel.source, target: rel.target,
                type: rel.type, label: rel.label,
                relData: rel, style: style
            });
        });
    }

    /* ====================================================================
     * LAYOUT
     * ==================================================================== */

    function doLayoutFn() {
        var wrap = document.getElementById('nvd3-graph-wrap');
        var cW = wrap ? wrap.clientWidth : 1200;
        var cH = wrap ? wrap.clientHeight : 700;
        var positions = DbRel.computeLayout(cW, cH);

        graphNodes.forEach(function(n) {
            if (positions[n.id]) {
                n.x = positions[n.id].x;
                n.y = positions[n.id].y;
            }
        });
    }

    /* ====================================================================
     * RENDER D3 v3 GRAPH
     * ==================================================================== */

    function renderGraph() {
        if (!svgSel) return;
        gRoot.selectAll('*').remove();

        var HDR_H = DbRel.HDR_H, PAD = DbRel.PAD, ROW_H = DbRel.ROW_H;
        var nodeMap = {};
        graphNodes.forEach(function(n) { nodeMap[n.id] = n; });

        // Arrowhead markers
        var defs = gRoot.append('defs');
        var linkStyles = DbRel.LINK_STYLES;
        Object.keys(linkStyles).forEach(function(type) {
            var st = linkStyles[type];
            defs.append('marker')
                .attr('id', 'nvd3-arrow-' + type)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 10).attr('refY', 0)
                .attr('markerWidth', 8).attr('markerHeight', 8)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-4L10,0L0,4')
                .attr('fill', 'none')
                .attr('stroke', st.stroke)
                .attr('stroke-width', 1);
        });

        // Draw links
        var linkLayer = gRoot.append('g').attr('class', 'nvd3-links-layer');
        var linkGroups = linkLayer.selectAll('g.nvd3-link-group')
            .data(graphLinks)
            .enter().append('g')
            .attr('class', 'nvd3-link-group');

        linkGroups.each(function(d) {
            var g = d3.select(this);
            var src = nodeMap[d.source], tgt = nodeMap[d.target];
            if (!src || !tgt) return;
            var coords = calcLinkCoords(src, tgt);
            var midX = (coords.sx + coords.tx) / 2;
            var pathD = 'M' + coords.sx + ',' + coords.sy +
                ' C' + midX + ',' + coords.sy + ' ' + midX + ',' + coords.ty +
                ' ' + coords.tx + ',' + coords.ty;

            g.append('path')
                .attr('class', 'nvd3-graph-link nvd3-link-' + d.type)
                .attr('d', pathD)
                .attr('fill', 'none')
                .attr('stroke', d.style.stroke)
                .attr('stroke-width', d.style.strokeWidth)
                .attr('stroke-dasharray', d.style.strokeDasharray === '0' ? null : d.style.strokeDasharray)
                .attr('marker-end', 'url(#nvd3-arrow-' + d.type + ')');

            g.append('text')
                .attr('class', 'nvd3-link-label')
                .attr('x', (coords.sx + coords.tx) / 2)
                .attr('y', (coords.sy + coords.ty) / 2 - 4)
                .attr('text-anchor', 'middle')
                .attr('fill', '#8b949e').attr('font-size', '8px').attr('font-family', 'monospace')
                .text(d.label);
        });

        // Draw nodes
        var nodeLayer = gRoot.append('g').attr('class', 'nvd3-nodes-layer');

        // D3 v3 drag behavior
        var dragBehavior = d3.behavior.drag()
            .origin(function(d) { return { x: d.x, y: d.y }; })
            .on('dragstart', function(d) {
                d3.event.sourceEvent.stopPropagation();
                d._dragStartX = d.x; d._dragStartY = d.y;
            })
            .on('drag', function(d) {
                d.x = d3.event.x; d.y = d3.event.y;
                d3.select(this).attr('transform', 'translate(' + d.x + ',' + d.y + ')');
                updateLinks();
            });

        var nodeCards = nodeLayer.selectAll('g.nvd3-node-card')
            .data(graphNodes, function(d) { return d.id; })
            .enter().append('g')
            .attr('class', 'nvd3-node-card')
            .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; })
            .call(dragBehavior);

        // Body
        nodeCards.append('rect').attr('class', 'nvd3-node-body')
            .attr('width', function(d) { return d.w; })
            .attr('height', function(d) { return d.h; })
            .attr('fill', function(d) { return d.colors.bg; })
            .attr('stroke', function(d) { return d.colors.border; })
            .attr('stroke-width', 1).attr('rx', 4);

        // Header
        nodeCards.append('rect').attr('class', 'nvd3-node-header')
            .attr('width', function(d) { return d.w; })
            .attr('height', HDR_H)
            .attr('fill', function(d) { return d.colors.header; })
            .attr('rx', 4).attr('ry', 4);

        // Header mask
        nodeCards.append('rect').attr('class', 'nvd3-node-header-mask')
            .attr('width', function(d) { return d.w; })
            .attr('height', 10).attr('y', 12)
            .attr('fill', function(d) { return d.colors.header; });

        // Table icon in header
        nodeCards.each(function(d) {
            var iconInfo = DbRel.getTableIconInfo(d.tableName);
            if (iconInfo && iconInfo.src) {
                d3.select(this).append('image').attr('class', 'nvd3-node-icon')
                    .attr('xlink:href', iconInfo.src)
                    .attr('x', 3).attr('y', 3)
                    .attr('width', 16).attr('height', 16);
            }
        });

        // Header text
        nodeCards.append('text').attr('class', 'nvd3-node-title')
            .attr('x', function(d) { return DbRel.getTableIconInfo(d.tableName) ? 22 : 6; }).attr('y', 15)
            .attr('fill', '#fff').attr('font-size', '10px').attr('font-weight', 'bold').attr('font-family', 'monospace')
            .text(function(d) { return d.headerLabel; });

        // Row text
        nodeCards.each(function(d) {
            var g = d3.select(this);
            d.textLines.forEach(function(line, i) {
                g.append('text').attr('class', 'nvd3-node-row-text')
                    .attr('x', 6)
                    .attr('y', HDR_H + PAD + (i + 1) * ROW_H)
                    .attr('fill', '#c9d1d9').attr('font-size', '9px').attr('font-family', 'monospace')
                    .text(line);
            });

            // Pivot icon for pivotable tables
            var pivotInfo = DbRel.getNodePivotInfo(d.tableKey, d.rowIndex);
            if (pivotInfo) {
                var icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                icon.setAttribute('class', 'nvd3-pivot-icon');
                icon.setAttribute('x', String(d.w - 14));
                icon.setAttribute('y', '15');
                icon.setAttribute('font-size', '11');
                icon.setAttribute('font-family', 'sans-serif');
                icon.setAttribute('fill', '#fff');
                icon.setAttribute('cursor', 'pointer');
                icon.setAttribute('pointer-events', 'all');
                icon.setAttribute('opacity', '0.6');
                icon.textContent = '\u2316';
                var tk = d.tableKey, ri = d.rowIndex;
                icon.addEventListener('mouseenter', function() { this.setAttribute('opacity', '1'); });
                icon.addEventListener('mouseleave', function() { this.setAttribute('opacity', '0.6'); });
                icon.addEventListener('click', function(e) {
                    e.stopPropagation();
                    DbRel.pivotTo(tk, ri);
                });
                g.node().appendChild(icon);
            }
        });

        setupNodeInteractions(nodeCards, linkGroups);
    }

    function calcLinkCoords(src, tgt) {
        var sx = src.x + src.w, sy = src.y + src.h / 2;
        var tx = tgt.x, ty = tgt.y + tgt.h / 2;
        if (src.x > tgt.x + tgt.w) { sx = src.x; tx = tgt.x + tgt.w; }
        else if (Math.abs(src.x + src.w / 2 - tgt.x - tgt.w / 2) < 50) {
            sx = src.x + src.w / 2; sy = src.y + src.h;
            tx = tgt.x + tgt.w / 2; ty = tgt.y;
        }
        return { sx: sx, sy: sy, tx: tx, ty: ty };
    }

    function updateLinks() {
        var nodeMap = {};
        graphNodes.forEach(function(n) { nodeMap[n.id] = n; });

        gRoot.selectAll('g.nvd3-link-group').each(function(d) {
            var g = d3.select(this);
            var src = nodeMap[d.source], tgt = nodeMap[d.target];
            if (!src || !tgt) return;
            var c = calcLinkCoords(src, tgt);
            var midX = (c.sx + c.tx) / 2;
            g.select('path').attr('d', 'M' + c.sx + ',' + c.sy +
                ' C' + midX + ',' + c.sy + ' ' + midX + ',' + c.ty + ' ' + c.tx + ',' + c.ty);
            g.select('text').attr('x', (c.sx + c.tx) / 2).attr('y', (c.sy + c.ty) / 2 - 4);
        });
    }

    /* ====================================================================
     * INTERACTIONS (D3 v3 events)
     * ==================================================================== */

    function setupNodeInteractions(nodeCards, linkGroups) {
        // Hover
        nodeCards.on('mouseover', function(d) {
            if (focusedNodeId) return;
            d3.select(this).classed('nvd3-highlight', true);
            highlightConnected(d.id, false);
        });
        nodeCards.on('mouseout', function() {
            if (focusedNodeId) return;
            clearHighlights();
        });

        // Click -> focus
        nodeCards.on('click', function(d) {
            d3.event.stopPropagation();
            if (d._dragStartX !== undefined &&
                (Math.abs(d.x - d._dragStartX) > 5 || Math.abs(d.y - d._dragStartY) > 5)) return;
            if (focusedNodeId === d.id) { unfocusNode(); } else { focusNode(d.id); }
        });

        // Double-click -> modal
        nodeCards.on('dblclick', function(d) {
            d3.event.stopPropagation();
            DbRel.showRowModal(d.tableKey, d.rowIndex);
        });

        // Link hover
        linkGroups
            .on('mouseover', function(d) {
                d3.select(this).select('path').classed('nvd3-highlight', true);
                gRoot.selectAll('g.nvd3-node-card')
                    .filter(function(nd) { return nd.id === d.source; }).classed('nvd3-highlight', true);
                gRoot.selectAll('g.nvd3-node-card')
                    .filter(function(nd) { return nd.id === d.target; }).classed('nvd3-highlight', true);

                if (d.relData) {
                    DbRel.showTooltip(DbRel.getLinkTooltipHtml(d.relData), d3.event.pageX + 12, d3.event.pageY + 12);
                }
            })
            .on('mouseout', function() {
                DbRel.hideTooltip();
                if (!focusedNodeId) clearHighlights();
            });
    }

    function highlightConnected(nodeId, applyDim) {
        var ids = {}; ids[nodeId] = true;
        graphLinks.forEach(function(l) {
            if (l.source === nodeId || l.target === nodeId) { ids[l.source] = true; ids[l.target] = true; }
        });
        gRoot.selectAll('g.nvd3-node-card')
            .classed('nvd3-highlight', function(d) { return !!ids[d.id]; })
            .classed('nvd3-dimmed', function(d) { return applyDim && !ids[d.id]; });
        gRoot.selectAll('g.nvd3-link-group').each(function(d) {
            var c = d.source === nodeId || d.target === nodeId;
            d3.select(this).select('path').classed('nvd3-highlight', c).classed('nvd3-dimmed', applyDim && !c);
        });
    }

    function focusNode(nodeId) {
        if (focusedNodeId && focusedNodeId !== nodeId) restorePositions();
        focusedNodeId = nodeId;
        clearHighlights();

        var focusN = nodeById(nodeId);
        if (!focusN) return;

        var ids = {}; ids[nodeId] = true;
        graphLinks.forEach(function(l) {
            if (l.source === nodeId || l.target === nodeId) { ids[l.source] = true; ids[l.target] = true; }
        });
        var neighbors = graphNodes.filter(function(n) { return n.id !== nodeId && ids[n.id]; });

        savedPositions = {};
        neighbors.forEach(function(n) { savedPositions[n.id] = { x: n.x, y: n.y }; });

        var cx = focusN.x + focusN.w / 2, cy = focusN.y + focusN.h / 2;
        var radius = Math.max(250, neighbors.length * 35);
        var step = (2 * Math.PI) / Math.max(neighbors.length, 1);
        neighbors.forEach(function(n, i) {
            var angle = -Math.PI / 2 + i * step;
            n.x = cx + radius * Math.cos(angle) - n.w / 2;
            n.y = cy + radius * Math.sin(angle) - n.h / 2;
        });

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(nodeId);

        gRoot.selectAll('g.nvd3-node-card')
            .classed('nvd3-focused', function(d) { return d.id === nodeId; })
            .classed('nvd3-highlight', function(d) { return distances[d.id] !== undefined && distances[d.id] <= 1 && d.id !== nodeId; })
            .classed('nvd3-dimmed', false)
            .style('opacity', function(d) { return DbRel.distanceToOpacity(distances[d.id]); })
            .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });

        gRoot.selectAll('g.nvd3-link-group').each(function(d) {
            var sDist = distances[d.source] !== undefined ? distances[d.source] : Infinity;
            var tDist = distances[d.target] !== undefined ? distances[d.target] : Infinity;
            var edgeOpacity = DbRel.distanceToOpacity(Math.max(sDist, tDist));
            var isDirectlyConnected = d.source === nodeId || d.target === nodeId;
            d3.select(this).select('path').classed('nvd3-highlight', isDirectlyConnected).classed('nvd3-dimmed', false);
            d3.select(this).style('opacity', edgeOpacity);
        });
        updateLinks();
        fitToNodes([focusN].concat(neighbors));
    }

    function unfocusNode() {
        restorePositions();
        focusedNodeId = null;
        clearHighlights();
        gRoot.selectAll('g.nvd3-node-card').classed('nvd3-focused', false).classed('nvd3-dimmed', false)
            .style('opacity', null)
            .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
        gRoot.selectAll('g.nvd3-link-group path').classed('nvd3-dimmed', false);
        gRoot.selectAll('g.nvd3-link-group').style('opacity', null);
        updateLinks();
    }

    function restorePositions() {
        Object.keys(savedPositions).forEach(function(id) {
            var n = nodeById(id);
            if (n) { n.x = savedPositions[id].x; n.y = savedPositions[id].y; }
        });
        savedPositions = {};
    }

    function clearHighlights() {
        gRoot.selectAll('.nvd3-highlight').classed('nvd3-highlight', false);
        gRoot.selectAll('.nvd3-dimmed').classed('nvd3-dimmed', false);
        gRoot.selectAll('.nvd3-focused').classed('nvd3-focused', false);
    }

    /* ====================================================================
     * ZOOM / FIT (D3 v3 API)
     * ==================================================================== */

    function setZoom(pct) {
        zoomLevel = pct;
        var scale = pct / 100;
        zoomBehavior.scale(scale);
        zoomBehavior.event(svgSel.transition().duration(0));
    }

    function fitToScreen() {
        if (!svgSel || graphNodes.length === 0) return;
        fitToNodes(graphNodes);
    }

    function fitToNodes(nodeList) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodeList.forEach(function(n) {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + n.w > maxX) maxX = n.x + n.w;
            if (n.y + n.h > maxY) maxY = n.y + n.h;
        });

        var bw = maxX - minX + 80, bh = maxY - minY + 80;
        var wrap = document.getElementById('nvd3-graph-wrap');
        var cw = wrap ? wrap.clientWidth : 800;
        var ch = wrap ? wrap.clientHeight : 600;
        var scale = Math.min(cw / bw, ch / bh, 1.5);
        scale = Math.max(scale, 0.02);

        var tx = (cw - bw * scale) / 2 - (minX - 40) * scale;
        var ty = (ch - bh * scale) / 2 - (minY - 40) * scale;

        zoomBehavior.translate([tx, ty]).scale(scale);
        svgSel.transition().duration(400).call(zoomBehavior.event);
        zoomLevel = Math.round(scale * 100);
        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFilters(dbF, typeF) {
        gRoot.selectAll('g.nvd3-node-card').style('display', function(d) {
            return dbF[d.dbName] !== false ? null : 'none';
        });
        gRoot.selectAll('g.nvd3-link-group').style('display', function(d) {
            var rd = d.relData;
            if (!rd) return 'none';
            return (typeF[d.type] !== false &&
                dbF[rd.source.split('.')[0]] !== false &&
                dbF[rd.target.split('.')[0]] !== false) ? null : 'none';
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
        if (target) fitToNodes([target]);
    }

    /* ====================================================================
     * NVD3 CHARTS (unique feature)
     * ==================================================================== */

    function renderCharts() {
        if (!DbRel.data || !DbRel.data.tables || typeof nv === 'undefined') return;
        // Patch NVD3 watchTransition if missing (known 1.8.6 bug with modern browsers)
        if (nv.utils && !nv.utils.watchTransition) {
            nv.utils.watchTransition = function(renderWatch) {
                return function(wrap) {
                    var args = [wrap].concat([].slice.call(arguments, 1));
                    return renderWatch.transition ? renderWatch.transition.apply(renderWatch, args) : wrap;
                };
            };
        }
        try { renderBarChart(); } catch (e) { /* chart render error */ }
        try { renderPieChart(); } catch (e) { /* chart render error */ }
    }

    function renderBarChart() {
        var DB_COLORS = {
            'my': '#2563eb', 'kayako_v4': '#059669', 'pdns': '#d97706'
        };

        var tableKeys = Object.keys(DbRel.data.tables).sort();
        var dbGroups = {};
        tableKeys.forEach(function(tk) {
            var parts = tk.split('.');
            if (!dbGroups[parts[0]]) dbGroups[parts[0]] = [];
            dbGroups[parts[0]].push({
                label: parts[1],
                value: DbRel.data.tables[tk].total || DbRel.data.tables[tk].rows.length
            });
        });

        var series = Object.keys(dbGroups).map(function(db) {
            return {
                key: db,
                color: DB_COLORS[db] || '#888',
                values: dbGroups[db].map(function(item) { return { x: item.label, y: item.value }; })
            };
        });

        d3.select('#nvd3-bar-chart-svg').selectAll('*').remove();

        nv.addGraph(function() {
            barChart = nv.models.multiBarChart()
                .stacked(false)
                .showControls(false)
                .showLegend(true)
                .reduceXTicks(true)
                .rotateLabels(-30)
                .groupSpacing(0.3)
                .margin({ top: 10, right: 10, bottom: 50, left: 40 });

            barChart.xAxis.tickFormat(function(d) { return d.length > 12 ? d.substring(0, 10) + '..' : d; });
            barChart.yAxis.tickFormat(d3.format(',.0f'));

            d3.select('#nvd3-bar-chart-svg').datum(series).call(barChart);
            nv.utils.windowResize(barChart.update);

            // Style for dark theme
            d3.selectAll('#nvd3-bar-chart-svg .nv-axis text').style('fill', '#8b949e');
            d3.selectAll('#nvd3-bar-chart-svg .nv-axis line, #nvd3-bar-chart-svg .nv-axis path').style('stroke', '#21262d');

            return barChart;
        });
    }

    function renderPieChart() {
        var typeCounts = { direct: 0, find_in_set: 0, cross_db: 0 };
        if (DbRel.data.relationships) {
            DbRel.data.relationships.forEach(function(rel) {
                if (typeCounts[rel.type] !== undefined) typeCounts[rel.type]++;
            });
        }

        var pieData = [];
        var colorMap = { direct: '#495057', find_in_set: '#6f42c1', cross_db: '#fd7e14' };
        Object.keys(typeCounts).forEach(function(t) {
            if (typeCounts[t] > 0) pieData.push({ key: t, y: typeCounts[t], color: colorMap[t] || '#888' });
        });

        d3.select('#nvd3-pie-chart-svg').selectAll('*').remove();
        if (pieData.length === 0) return;

        nv.addGraph(function() {
            pieChart = nv.models.pieChart()
                .x(function(d) { return d.key; })
                .y(function(d) { return d.y; })
                .showLabels(true)
                .labelType('percent')
                .donut(true)
                .donutRatio(0.35)
                .showLegend(true)
                .color(pieData.map(function(d) { return d.color; }))
                .margin({ top: 5, right: 5, bottom: 5, left: 5 });

            d3.select('#nvd3-pie-chart-svg').datum(pieData).call(pieChart);
            nv.utils.windowResize(pieChart.update);

            // Style for dark theme
            d3.selectAll('#nvd3-pie-chart-svg .nv-legend text').style('fill', '#c9d1d9');
            d3.selectAll('#nvd3-pie-chart-svg .nv-label text').style('fill', '#c9d1d9');

            return pieChart;
        });
    }

    /* ====================================================================
     * MAIN BUILD
     * ==================================================================== */

    function buildAll() {
        if (!DbRel.data) return;
        buildGraphData();
        doLayoutFn();
        renderGraph();
        renderCharts();
        setTimeout(function() { if (svgSel) fitToScreen(); }, 200);
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('nvd3', {
        init: function(el) {
            containerEl = el;
            initSVG();
        },
        render: function() {
            buildAll();
        },
        doLayout: function() {
            doLayoutFn();
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
            return { nodes: graphNodes.length, links: graphLinks.length };
        },
        resize: function() {
            if (containerEl && DbRel.data && graphNodes.length > 0) {
                setTimeout(fitToScreen, 100);
                if (barChart) setTimeout(function() { if (barChart) barChart.update(); }, 200);
                if (pieChart) setTimeout(function() { if (pieChart) pieChart.update(); }, 200);
            }
        },
        highlightTable: function(tk) {
            gRoot.selectAll('g.nvd3-node-card').style('opacity', function(d) { return d.tableKey === tk ? 1 : 0.15; });
            gRoot.selectAll('g.nvd3-link-group').style('opacity', function(d) {
                return d.source.indexOf(tk) === 0 || d.target.indexOf(tk) === 0 ? 1 : 0.08;
            });
        },
        clearHighlightTable: function() {
            gRoot.selectAll('g.nvd3-node-card').style('opacity', null);
            gRoot.selectAll('g.nvd3-link-group').style('opacity', null);
        },
        destroy: function() {
            barChart = null;
            pieChart = null;
            svgSel = null;
            gRoot = null;
            zoomBehavior = null;
            graphNodes = [];
            graphLinks = [];
            focusedNodeId = null;
            savedPositions = {};
            chartsPanelVisible = true;
            containerEl = null;
        }
    });

})();
