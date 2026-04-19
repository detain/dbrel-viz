/**
 * Database Relationships - Cytoscape.js Renderer
 * Uses SVG data URIs as node background images to render rich card-style
 * nodes that edges connect to directly. No HTML overlay plugin needed.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var cy = null;
    var containerEl = null;
    var zoomLevel = 100;
    var focusedNodeId = null;

    var EDGE_STYLES = {
        'direct':      { lineStyle: 'solid',  color: '#e94560' },
        'find_in_set': { lineStyle: 'dashed', color: '#ffc107' },
        'cross_db':    { lineStyle: 'dotted', color: '#17a2b8' }
    };

    function escSvg(s) {
        return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    /* ====================================================================
     * SVG CARD GENERATOR - renders a card with colored header + body rows
     * ==================================================================== */

    function createCardSvg(w, h, headerLabel, lines, colors, isPivotable, tableName) {
        var hdrH = 22;
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + w + '" height="' + h + '">';
        // Body rect
        svg += '<rect width="' + w + '" height="' + h + '" rx="3" ry="3" fill="' + escSvg(colors.bg) + '" stroke="' + escSvg(colors.border) + '" stroke-width="1"/>';
        // Header rect
        svg += '<rect width="' + w + '" height="' + hdrH + '" rx="3" ry="3" fill="' + escSvg(colors.header) + '"/>';
        // Square off bottom corners of header
        svg += '<rect y="' + (hdrH - 4) + '" width="' + w + '" height="4" fill="' + escSvg(colors.header) + '"/>';
        // Table icon + header text
        var textX = 6;
        var iconInfo = tableName ? DbRel.getTableIconInfo(tableName) : null;
        if (iconInfo && iconInfo.src) {
            svg += '<image xlink:href="' + escSvg(iconInfo.src) + '" x="3" y="3" width="16" height="16"/>';
            textX = 22;
        }
        svg += '<text x="' + textX + '" y="15" font-size="11" font-weight="bold" font-family="Consolas,Monaco,monospace" fill="#fff">' + escSvg(headerLabel) + '</text>';
        // Body lines
        for (var i = 0; i < lines.length; i++) {
            svg += '<text x="6" y="' + (hdrH + 4 + (i + 1) * 14) + '" font-size="10" font-family="Consolas,Monaco,monospace" fill="#ccc">' + escSvg(lines[i]) + '</text>';
        }
        // Pivot crosshair icon in top-right of header
        if (isPivotable) {
            svg += '<text x="' + (w - 14) + '" y="15" font-size="11" fill="#fff" opacity="0.7" font-family="sans-serif" title="Pivot">&#x2316;</text>';
        }
        svg += '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    /* ====================================================================
     * NODE COLORS (dark theme like standalone)
     * ==================================================================== */

    function getNodeColors(tableKey) {
        var c = DbRel.getTableColor(tableKey);
        var hdr = c.header;
        var r = parseInt(hdr.slice(1, 3), 16), g = parseInt(hdr.slice(3, 5), 16), b = parseInt(hdr.slice(5, 7), 16);
        var bg = 'rgb(' + Math.round(r * 0.15 + 20) + ',' + Math.round(g * 0.15 + 20) + ',' + Math.round(b * 0.15 + 20) + ')';
        var border = 'rgb(' + Math.round(r * 0.5 + 40) + ',' + Math.round(g * 0.5 + 40) + ',' + Math.round(b * 0.5 + 40) + ')';
        return { header: hdr, bg: bg, border: border };
    }

    /* ====================================================================
     * BUILD ELEMENTS
     * ==================================================================== */

    function buildSeparateElements() {
        var nodes = [], edges = [];
        if (!DbRel.data || !DbRel.data.tables) return { nodes: nodes, edges: edges };

        var tables = DbRel.data.tables;
        var tableKeys = Object.keys(tables);
        var maxTrunc = DbRel.showFullContent ? 100 : 24;

        for (var t = 0; t < tableKeys.length; t++) {
            var tk = tableKeys[t];
            var tbl = tables[tk];
            var rows = tbl.rows || [];
            var cols = tbl.columns || [];
            var dbName = tk.split('.')[0];
            var tableName = tk.split('.')[1];
            var colors = getNodeColors(tk);
            var hiddenFields = (DbRel.data.hiddenFields) || [];
            var pkCol = DbRel.getPrimaryKey(tableName);

            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                var pkVal = pkCol && row[pkCol] !== undefined ? row[pkCol] : null;
                var nodeId = tk + ':' + r;
                var headerLabel = tableName + (pkVal !== null ? ' ' + pkVal : ' [' + r + ']');

                var lines = [];
                for (var c = 0; c < cols.length; c++) {
                    if (hiddenFields.indexOf(cols[c]) > -1) continue;
                    if (cols[c] === pkCol) continue;
                    var cname = DbRel.shortenColName(cols[c], tableName);
                    var cval = row[cols[c]];
                    if (cval === null || cval === undefined) cval = 'NULL';
                    else cval = String(cval);
                    if (cval.length > maxTrunc) cval = cval.substring(0, maxTrunc - 2) + '..';
                    lines.push(cname + ': ' + cval);
                }

                var maxLineLen = headerLabel.length + 2;
                for (var li = 0; li < lines.length; li++) {
                    if (lines[li].length > maxLineLen) maxLineLen = lines[li].length;
                }
                var nodeW = Math.max(140, Math.min(DbRel.showFullContent ? 500 : 260, maxLineLen * 7 + 20));
                var nodeH = 22 + 4 + Math.max(lines.length, 1) * 14 + 6;

                var isPivotable = !!DbRel.getPivotConfig(tableName);
                var cardSvg = createCardSvg(nodeW, nodeH, headerLabel, lines, colors, isPivotable, tableName);

                nodes.push({
                    data: {
                        id: nodeId, label: headerLabel,
                        nodeW: nodeW, nodeH: nodeH, cardSvg: cardSvg,
                        tableKey: tk, rowIndex: r, db: dbName,
                        pivotable: isPivotable,
                        sourceTable: tk, targetTable: tk
                    }
                });
            }
        }

        var rels = DbRel.data.relationships || [];
        for (var e = 0; e < rels.length; e++) {
            var rel = rels[e];
            var matches = rel.matches || [];
            var es = EDGE_STYLES[rel.type] || EDGE_STYLES['direct'];
            for (var m = 0; m < matches.length; m++) {
                var srcIdx = matches[m][0];
                var tgtIdxs = matches[m][1];
                var srcNodeId = rel.source + ':' + srcIdx;
                if (!Array.isArray(tgtIdxs)) tgtIdxs = [tgtIdxs];
                for (var ti = 0; ti < tgtIdxs.length; ti++) {
                    var tgtNodeId = rel.target + ':' + tgtIdxs[ti];
                    edges.push({
                        data: {
                            id: 'e_' + e + '_' + m + '_' + ti,
                            source: srcNodeId, target: tgtNodeId,
                            relType: rel.type, cardinality: rel.cardinality || '',
                            sourceField: rel.source_field, targetField: rel.target_field,
                            sourceTable: rel.source, targetTable: rel.target,
                            lineStyle: es.lineStyle, color: es.color,
                            label: rel.label || ''
                        }
                    });
                }
            }
        }
        return { nodes: nodes, edges: edges };
    }

    function buildGroupedElements() {
        var nodes = [], edges = [];
        if (!DbRel.data || !DbRel.data.tables) return { nodes: nodes, edges: edges };

        var tables = DbRel.data.tables;
        var tableKeys = Object.keys(tables);

        for (var t = 0; t < tableKeys.length; t++) {
            var tk = tableKeys[t];
            var tbl = tables[tk];
            var dbName = tk.split('.')[0];
            var tableName = tk.split('.')[1];
            var total = tbl.total || (tbl.rows || []).length;
            var headerLabel = tableName + ' (' + total + ')';
            var colors = getNodeColors(tk);
            var hiddenFields = (DbRel.data.hiddenFields) || [];
            var cols = tbl.columns || [];

            var colLines = [];
            for (var c = 0; c < cols.length; c++) {
                if (hiddenFields.indexOf(cols[c]) === -1) {
                    colLines.push(DbRel.shortenColName(cols[c], tableName));
                }
            }

            var maxLineLen = headerLabel.length + 2;
            for (var li = 0; li < colLines.length; li++) {
                if (colLines[li].length > maxLineLen) maxLineLen = colLines[li].length;
            }
            var nodeW = Math.max(140, Math.min(300, maxLineLen * 7 + 20));
            var nodeH = 22 + 4 + Math.max(colLines.length, 1) * 14 + 6;

            var cardSvg = createCardSvg(nodeW, nodeH, headerLabel, colLines, colors, false, tableName);

            nodes.push({
                data: {
                    id: tk, label: headerLabel,
                    nodeW: nodeW, nodeH: nodeH, cardSvg: cardSvg,
                    tableKey: tk, rowIndex: -1, db: dbName,
                    sourceTable: tk, targetTable: tk
                }
            });
        }

        var edgeMap = {};
        var rels = DbRel.data.relationships || [];
        for (var e = 0; e < rels.length; e++) {
            var rel = rels[e];
            var edgeKey = rel.source + '->' + rel.target + '::' + rel.type;
            if (edgeMap[edgeKey]) continue;
            edgeMap[edgeKey] = true;
            var es = EDGE_STYLES[rel.type] || EDGE_STYLES['direct'];
            var cardLabel = rel.cardinality || '';
            edges.push({
                data: {
                    id: 'ge_' + e,
                    source: rel.source, target: rel.target,
                    relType: rel.type, cardinality: cardLabel,
                    sourceField: rel.source_field, targetField: rel.target_field,
                    sourceTable: rel.source, targetTable: rel.target,
                    lineStyle: es.lineStyle, color: es.color,
                    label: (rel.label || '') + (cardLabel ? ' [' + cardLabel + ']' : '')
                }
            });
        }
        return { nodes: nodes, edges: edges };
    }

    /* ====================================================================
     * BUILD GRAPH
     * ==================================================================== */

    function buildGraph() {
        if (!DbRel.data) return;
        focusedNodeId = null;

        var elems = DbRel.displayMode === 'grouped' ? buildGroupedElements() : buildSeparateElements();
        var allElements = elems.nodes.concat(elems.edges);

        if (cy) cy.destroy();

        cy = cytoscape({
            container: containerEl,
            elements: allElements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'label': '',
                        'shape': 'rectangle',
                        'width': 'data(nodeW)',
                        'height': 'data(nodeH)',
                        'background-image': 'data(cardSvg)',
                        'background-fit': 'cover',
                        'background-opacity': 1,
                        'border-width': 0,
                        'transition-property': 'opacity, border-color, border-width',
                        'transition-duration': '0.2s'
                    }
                },
                { selector: 'node.dimmed', style: { 'opacity': 0.15 } },
                { selector: 'node.highlighted', style: { 'border-width': 3, 'border-color': '#e94560', 'z-index': 10 } },
                { selector: 'node.focused', style: { 'border-width': 4, 'border-color': '#fff', 'z-index': 20 } },
                {
                    selector: 'edge',
                    style: {
                        'width': 1.5,
                        'line-color': 'data(color)',
                        'target-arrow-color': 'data(color)',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'arrow-scale': 0.8,
                        'line-style': 'data(lineStyle)',
                        'opacity': 0.7,
                        'transition-property': 'opacity, width, line-color',
                        'transition-duration': '0.2s'
                    }
                },
                { selector: 'edge.dimmed', style: { 'opacity': 0.08 } },
                { selector: 'edge.highlighted', style: { 'width': 3, 'opacity': 1, 'z-index': 10 } },
                { selector: 'edge.focused-edge', style: { 'width': 3.5, 'opacity': 1, 'z-index': 15 } }
            ],
            layout: { name: 'preset' },
            wheelSensitivity: 0.3,
            minZoom: 0.1,
            maxZoom: 5,
            boxSelectionEnabled: false
        });

        runLayout();
        attachEvents();
        updateZoom();
    }

    /* ====================================================================
     * LAYOUT (from standalone - operates on cy.nodes() directly)
     * ==================================================================== */

    function runLayout() {
        if (!cy || cy.nodes().length === 0) return;

        var CORRIDOR = 100, GAP_Y = 8, GROUP_GAP = 18, MARGIN = 20;

        var tableGroups = {};
        cy.nodes().forEach(function(n) {
            var tk = n.data('tableKey') || n.id();
            if (!tableGroups[tk]) tableGroups[tk] = [];
            tableGroups[tk].push(n);
        });
        var tableKeys = Object.keys(tableGroups);
        if (!tableKeys.length) return;

        var adj = {};
        tableKeys.forEach(function(tk) { adj[tk] = {}; });
        cy.edges().forEach(function(e) {
            var st = e.data('sourceTable');
            var tt = e.data('targetTable');
            if (adj[st] && adj[tt]) { adj[st][tt] = true; adj[tt][st] = true; }
        });

        var layers = {}, visited = {}, queue = [];
        var root = tableKeys.find(function(tk) {
            return tk.indexOf('accounts') > -1 && tk.indexOf('accounts_') === -1;
        }) || tableKeys[0];
        if (root) { queue.push(root); visited[root] = true; layers[root] = 0; }
        while (queue.length) {
            var cur = queue.shift();
            var nl = layers[cur] + 1;
            Object.keys(adj[cur] || {}).forEach(function(nb) {
                if (!visited[nb]) { visited[nb] = true; layers[nb] = nl; queue.push(nb); }
            });
        }
        var maxLayer = 0;
        Object.keys(layers).forEach(function(k) { if (layers[k] > maxLayer) maxLayer = layers[k]; });
        tableKeys.forEach(function(tk) { if (layers[tk] === undefined) layers[tk] = maxLayer + 1; });

        var blocks = tableKeys.map(function(tk) {
            var els = tableGroups[tk];
            var maxW = 0, totalH = 0, nodeSizes = [];
            els.forEach(function(n, i) {
                var w = n.data('nodeW') || 180;
                var h = n.data('nodeH') || 60;
                nodeSizes.push({ w: w, h: h });
                if (w > maxW) maxW = w;
                totalH += h + (i > 0 ? GAP_Y : 0);
            });
            return { tableKey: tk, nodes: els, nodeSizes: nodeSizes, w: maxW, h: totalH,
                     layer: layers[tk] || 0, degree: Object.keys(adj[tk] || {}).length };
        });

        blocks.sort(function(a, b) {
            if (a.layer !== b.layer) return a.layer - b.layer;
            if (a.degree !== b.degree) return b.degree - a.degree;
            return b.h - a.h;
        });

        var canvasW = Math.max(cy.width() || 1200, 400);
        var canvasH = Math.max(cy.height() || 700, 300);
        var viewportRatio = canvasW / canvasH;
        var targetRatio = Math.min(viewportRatio, 16 / 9) * 0.85;

        var totalArea = 0;
        blocks.forEach(function(b) { totalArea += (b.w + CORRIDOR) * (b.h + GROUP_GAP); });
        var tallest = 0;
        blocks.forEach(function(b) { if (b.h > tallest) tallest = b.h; });
        var idealH = Math.sqrt(Math.max(totalArea, 1) / targetRatio);
        var maxColH = Math.max(idealH, canvasH * 0.6);
        if (tallest + GROUP_GAP > maxColH) maxColH = tallest + GROUP_GAP;

        var columns = [];
        blocks.forEach(function(block) {
            var bestCol = -1, bestFit = Infinity;
            for (var ci = 0; ci < columns.length; ci++) {
                var remaining = maxColH - columns[ci].y;
                if (remaining >= block.h) {
                    var fit = remaining - block.h;
                    if (fit < bestFit) { bestFit = fit; bestCol = ci; }
                }
            }
            if (bestCol === -1) {
                var newX = MARGIN;
                if (columns.length > 0) {
                    var last = columns[columns.length - 1];
                    newX = last.x + last.w + CORRIDOR;
                }
                columns.push({ x: newX, y: MARGIN, w: 0 });
                bestCol = columns.length - 1;
            }
            var col = columns[bestCol];
            var curY = col.y;
            block.nodes.forEach(function(node, ni) {
                var sz = block.nodeSizes[ni];
                node.position({ x: col.x + block.w / 2, y: curY + sz.h / 2 });
                curY += sz.h + GAP_Y;
            });
            col.y = col.y + block.h + GROUP_GAP;
            if (block.w > col.w) col.w = block.w;
        });

        cy.layout({ name: 'preset', fit: true, padding: 30, animate: true, animationDuration: 350 }).run();
    }

    /* ====================================================================
     * EVENTS
     * ==================================================================== */

    function attachEvents() {
        if (!cy) return;

        cy.on('tap', 'node', function(evt) {
            var node = evt.target;
            var d = node.data();

            // Check if tap was in top-right corner (pivot icon area) of a pivotable node
            if (d.pivotable && d.rowIndex >= 0) {
                var pos = evt.position; // model position of click
                var nodePos = node.position();
                var w = d.nodeW || 150;
                var relX = pos.x - (nodePos.x - w / 2); // click X relative to node left
                var relY = pos.y - (nodePos.y - (d.nodeH || 50) / 2); // click Y relative to node top
                if (relX > w - 24 && relY < 22) {
                    // Clicked pivot icon area
                    DbRel.pivotTo(d.tableKey, d.rowIndex);
                    return;
                }
            }

            var nid = node.id();
            if (focusedNodeId === nid) { clearFocus(); return; }
            applyFocus(node);
        });

        cy.on('dbltap', 'node', function(evt) {
            var d = evt.target.data();
            if (d.tableKey !== undefined && d.rowIndex !== undefined && d.rowIndex >= 0) {
                DbRel.showRowModal(d.tableKey, d.rowIndex);
            }
        });

        cy.on('mouseover', 'node', function(evt) {
            if (focusedNodeId) return;
            var node = evt.target;
            var neighborhood = node.neighborhood().add(node);
            cy.elements().not(neighborhood).addClass('dimmed');
            neighborhood.edges().addClass('highlighted');
            neighborhood.nodes().not(node).addClass('highlighted');
        });

        cy.on('mouseout', 'node', function() {
            if (focusedNodeId) return;
            cy.elements().removeClass('dimmed highlighted');
        });

        cy.on('mouseover', 'edge', function(evt) {
            var d = evt.target.data();
            if (d) {
                var html = '<strong>' + (d.label || '') + '</strong><br>' +
                    '<small>' + (d.sourceField || '') + ' &rarr; ' + (d.targetField || '') + '</small><br>' +
                    '<small>' + (d.relType || '') + ' | ' + (d.cardinality || '') + '</small>';
                DbRel.showTooltip(html, evt.originalEvent.clientX, evt.originalEvent.clientY);
            }
            if (!focusedNodeId) {
                evt.target.addClass('highlighted');
                evt.target.source().addClass('highlighted');
                evt.target.target().addClass('highlighted');
            }
        });

        cy.on('mouseout', 'edge', function(evt) {
            DbRel.hideTooltip();
            if (!focusedNodeId) {
                evt.target.removeClass('highlighted');
                evt.target.source().removeClass('highlighted');
                evt.target.target().removeClass('highlighted');
            }
        });

        cy.on('tap', function(evt) { if (evt.target === cy) clearFocus(); });
        cy.on('zoom', function() { updateZoom(); });
    }

    /* ====================================================================
     * FOCUS / UNFOCUS
     * ==================================================================== */

    function applyFocus(node) {
        clearFocus();
        focusedNodeId = node.id();

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(node.id());

        cy.nodes().forEach(function(n) {
            var dist = distances[n.id()];
            var opacity = DbRel.distanceToOpacity(dist);
            n.style('opacity', opacity);
            n.removeClass('dimmed highlighted focused');
            if (dist === 0) n.addClass('focused');
            else if (dist === 1) n.addClass('highlighted');
        });

        cy.edges().forEach(function(e) {
            var sDist = distances[e.source().id()];
            var tDist = distances[e.target().id()];
            var eDist = Math.max(
                sDist !== undefined ? sDist : Infinity,
                tDist !== undefined ? tDist : Infinity
            );
            var opacity = DbRel.distanceToOpacity(eDist);
            e.style('opacity', opacity);
            e.removeClass('dimmed highlighted focused-edge');
            if (eDist <= 1) e.addClass('focused-edge');
        });

        cy.animate({ center: { eles: node }, duration: 300 });

        // Arrange direct neighbors in a ring
        var connectedNodes = node.neighborhood().nodes();
        if (connectedNodes.length > 0) {
            var center = node.position();
            var radius = 150;
            var angleStep = (2 * Math.PI) / connectedNodes.length;
            connectedNodes.forEach(function(cn, i) {
                cn.animate({
                    position: {
                        x: center.x + radius * Math.cos(angleStep * i - Math.PI / 2),
                        y: center.y + radius * Math.sin(angleStep * i - Math.PI / 2)
                    },
                    duration: 400
                });
            });
        }
    }

    function clearFocus() {
        if (!focusedNodeId || !cy) return;
        focusedNodeId = null;
        cy.elements().removeClass('dimmed highlighted focused focused-edge');
        // Reset opacity set by distance-based fading
        cy.elements().style('opacity', '');
    }

    function updateZoom() {
        if (!cy) return;
        zoomLevel = Math.round(cy.zoom() * 100);
        DbRel.setZoomSlider(Math.max(5, Math.min(300, zoomLevel)));
    }

    function applyFilters(dbF, typeF) {
        if (!cy) return;
        cy.nodes().forEach(function(n) {
            n.style('display', dbF[n.data('db')] === false ? 'none' : 'element');
        });
        cy.edges().forEach(function(e) {
            var d = e.data();
            var srcDb = (d.sourceTable || '').split('.')[0];
            var tgtDb = (d.targetTable || '').split('.')[0];
            var vis = typeF[d.relType] !== false && dbF[srcDb] !== false && dbF[tgtDb] !== false;
            e.style('display', vis ? 'element' : 'none');
        });
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('cytoscape', {
        init: function(el) {
            containerEl = el;
        },

        render: function() {
            DbRel.resetTableColors();
            buildGraph();
            DbRel.updateSidebar();
        },

        doLayout: function() { if (cy) runLayout(); },

        setZoom: function(pct) {
            if (!cy) return;
            cy.zoom(pct / 100);
            cy.center();
            zoomLevel = pct;
        },

        getZoom: function() { return zoomLevel; },

        fitToScreen: function() {
            if (!cy) return;
            cy.fit(30);
            updateZoom();
        },

        applyFilters: function(dbF, typeF) { applyFilters(dbF, typeF); },

        focusNode: function(nodeId) {
            if (!cy) return;
            var n = cy.getElementById(nodeId);
            if (n && n.length) applyFocus(n);
        },

        unfocusNode: function() { clearFocus(); },

        centerOnTable: function(tableKey) {
            if (!cy) return;
            var nodes;
            if (DbRel.displayMode === 'grouped') {
                nodes = cy.getElementById(tableKey);
            } else {
                nodes = cy.nodes().filter(function(n) { return n.data('tableKey') === tableKey; });
            }
            if (nodes && nodes.length) {
                cy.animate({ fit: { eles: nodes, padding: 50 }, duration: 400 });
                nodes.addClass('highlighted');
                setTimeout(function() { if (cy) nodes.removeClass('highlighted'); }, 1200);
            }
        },

        highlightTable: function(tk) {
            if (!cy) return;
            var tableNodes = cy.nodes().filter(function(n) { return n.data('tableKey') === tk; });
            var neighborhood = tableNodes.neighborhood().add(tableNodes);
            cy.elements().not(neighborhood).addClass('dimmed');
            neighborhood.edges().addClass('highlighted');
            tableNodes.addClass('highlighted');
        },
        clearHighlightTable: function() {
            if (!cy) return;
            cy.elements().removeClass('dimmed highlighted');
        },

        getStats: function() {
            return { nodes: cy ? cy.nodes().length : 0, links: cy ? cy.edges().length : 0 };
        },

        resize: function() {
            if (cy) cy.resize();
        },

        destroy: function() {
            if (cy) { cy.destroy(); cy = null; }
            containerEl = null;
            focusedNodeId = null;
            zoomLevel = 100;
        }
    });

})();
