/**
 * Database Relationships - vis.js Network Renderer
 * Uses vis-network with box nodes, physics disabled, and compact
 * column-bin-packing layout. Interactive focus with ring arrangement.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    /* ====================================================================
     * STATE
     * ==================================================================== */

    var network = null;
    var nodesDS = null;
    var edgesDS = null;
    var containerEl = null;
    var focusedNodeId = null;
    var savedPositions = {};
    var dimmedState = false;
    var zoomLevel = 100;

    /* ====================================================================
     * EDGE STYLES
     * ==================================================================== */

    var EDGE_STYLES = {
        'direct':      { color: '#495057', dashes: false },
        'find_in_set': { color: '#6f42c1', dashes: [8, 4] },
        'cross_db':    { color: '#fd7e14', dashes: [3, 3] }
    };

    /* ====================================================================
     * BUILD NETWORK
     * ==================================================================== */

    function buildNetwork() {
        if (!DbRel.data) return;

        focusedNodeId = null;
        savedPositions = {};
        dimmedState = false;

        var nodes = [];
        var edges = [];

        if (DbRel.displayMode === 'grouped') {
            buildGroupedData(nodes, edges);
        } else {
            buildSeparateData(nodes, edges);
        }

        nodesDS = new vis.DataSet(nodes);
        edgesDS = new vis.DataSet(edges);

        if (network) {
            network.setData({ nodes: nodesDS, edges: edgesDS });
        } else {
            initNetwork(nodesDS, edgesDS);
        }

        applyCompactLayout(nodes);

        setTimeout(function() {
            if (network) {
                network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
                updateZoomFromNetwork();
            }
        }, 50);
    }

    /* ====================================================================
     * SEPARATE MODE
     * ==================================================================== */

    function buildSeparateData(nodes, edges) {
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);

            tableInfo.rows.forEach(function(row, ri) {
                var nodeId = tableKey + ':' + ri;
                var header = DbRel.getNodeHeader(tableKey, ri);
                var lines = DbRel.getNodeLines(tableKey, ri);
                var label = header + '\n' + lines.join('\n');

                nodes.push({
                    id: nodeId,
                    label: label,
                    group: tableKey,
                    _tableName: tableName,
                    _tableKey: tableKey,
                    _rowIndex: ri,
                    _headerColor: colors.header,
                    color: {
                        background: colors.bg,
                        border: colors.header,
                        highlight: { background: colors.bg, border: colors.header },
                        hover: { background: colors.bg, border: colors.header }
                    },
                    font: {
                        multi: false,
                        face: 'monospace',
                        size: 10,
                        color: '#343a40',
                        align: 'left'
                    },
                    shape: 'box',
                    borderWidth: 2,
                    borderWidthSelected: 3,
                    margin: { top: 6, bottom: 6, left: 8, right: 8 },
                    shadow: false,
                    _tableKey: tableKey,
                    _dbName: dbName,
                    _tableName: tableName,
                    _rowIndex: ri,
                    _headerLabel: header
                });
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = EDGE_STYLES[rel.type] || EDGE_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                var srcExists = nodes.some(function(n) { return n.id === srcNodeId; });
                if (!srcExists) return;

                var tgtIdxs = match[1];
                if (!Array.isArray(tgtIdxs)) tgtIdxs = [tgtIdxs];

                tgtIdxs.forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    var tgtExists = nodes.some(function(n) { return n.id === tgtNodeId; });
                    if (!tgtExists) return;

                    edges.push({
                        from: srcNodeId,
                        to: tgtNodeId,
                        color: { color: style.color, highlight: style.color, hover: style.color },
                        dashes: style.dashes,
                        width: 1.2,
                        arrows: { to: { enabled: true, scaleFactor: 0.6, type: 'arrow' } },
                        smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.4 },
                        font: {
                            size: 7,
                            color: style.color,
                            face: 'sans-serif',
                            strokeWidth: 2,
                            strokeColor: '#ffffff',
                            align: 'middle'
                        },
                        label: rel.source_field + '\u2192' + rel.target_field,
                        _relType: rel.type,
                        _relLabel: rel.label,
                        _relData: rel
                    });
                });
            });
        });
    }

    /* ====================================================================
     * GROUPED MODE
     * ==================================================================== */

    function buildGroupedData(nodes, edges) {
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var headerLine = tableName + ' (' + tableInfo.total + ')';
            var label = headerLine + '\n' + lines.join('\n');

            nodes.push({
                id: tableKey,
                label: label,
                group: tableKey,
                _tableName: tableName,
                _tableKey: tableKey,
                _rowIndex: 0,
                _headerColor: colors.header,
                color: {
                    background: colors.bg,
                    border: colors.header,
                    highlight: { background: colors.bg, border: colors.header },
                    hover: { background: colors.bg, border: colors.header }
                },
                font: {
                    multi: false,
                    face: 'monospace',
                    size: 10,
                    color: '#343a40',
                    align: 'left'
                },
                shape: 'box',
                borderWidth: 2,
                borderWidthSelected: 3,
                margin: { top: 6, bottom: 6, left: 8, right: 8 },
                shadow: false,
                _tableKey: tableKey,
                _dbName: dbName,
                _tableName: tableName,
                _rowIndex: 0,
                _headerLabel: headerLine
            });
        });

        var seenEdges = {};
        DbRel.data.relationships.forEach(function(rel) {
            var srcExists = nodes.some(function(n) { return n.id === rel.source; });
            var tgtExists = nodes.some(function(n) { return n.id === rel.target; });
            if (!srcExists || !tgtExists) return;
            var edgeKey = rel.source + '|' + rel.target + '|' + rel.type;
            if (seenEdges[edgeKey]) return;
            seenEdges[edgeKey] = true;

            var style = EDGE_STYLES[rel.type] || EDGE_STYLES['direct'];
            var cardParts = rel.cardinality ? rel.cardinality.split(':') : ['1', 'N'];
            var targetMany = cardParts[1] === 'N' || cardParts[1] === 'M';

            edges.push({
                from: rel.source,
                to: rel.target,
                color: { color: style.color, highlight: style.color, hover: style.color },
                dashes: style.dashes,
                width: 1.5,
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: targetMany ? 0.8 : 0.5,
                        type: targetMany ? 'arrow' : 'bar'
                    }
                },
                smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.4 },
                font: {
                    size: 8,
                    color: style.color,
                    face: 'sans-serif',
                    strokeWidth: 2,
                    strokeColor: '#ffffff',
                    align: 'middle'
                },
                label: rel.label + ' [' + rel.cardinality + ']',
                _relType: rel.type,
                _relLabel: rel.label,
                _relData: rel
            });
        });
    }

    /* ====================================================================
     * COMPACT COLUMN-BIN-PACKING LAYOUT
     * ==================================================================== */

    var CORRIDOR = 100;
    var GAP_Y = 8;
    var GROUP_GAP = 18;
    var MARGIN = 20;

    function estimateNodeSize(node) {
        var label = node.label || '';
        var nodeLines = label.split('\n');
        var maxChars = 0;
        for (var i = 0; i < nodeLines.length; i++) {
            if (nodeLines[i].length > maxChars) maxChars = nodeLines[i].length;
        }
        var charW = 6.1;
        var lineH = 14;
        var marginX = 16;
        var marginY = 12;
        var borderW = 4;
        var maxW = DbRel.showFullContent ? 800 : 300;
        var minW = 120;
        var w = Math.min(maxW, Math.max(minW, maxChars * charW + marginX + borderW));
        var h = nodeLines.length * lineH + marginY + borderW;
        return { w: w, h: h };
    }

    function applyCompactLayout(nodesList) {
        if (!network || !nodesDS || nodesList.length === 0) return;

        var cw = containerEl ? containerEl.clientWidth : 1200;
        var ch = containerEl ? containerEl.clientHeight : 800;

        // BFS from accounts to assign layers
        var tableKeys = Object.keys(DbRel.data.tables);
        var tableAdj = {};
        tableKeys.forEach(function(tk) { tableAdj[tk] = {}; });
        DbRel.data.relationships.forEach(function(rel) {
            if (tableAdj[rel.source] && tableAdj[rel.target]) {
                tableAdj[rel.source][rel.target] = true;
                tableAdj[rel.target][rel.source] = true;
            }
        });

        var layers = {};
        var visited = {};
        var root = tableKeys.find(function(tk) {
            return tk.indexOf('.accounts') > -1 && tk.indexOf('accounts_') === -1;
        }) || tableKeys[0];
        var queue = [root];
        visited[root] = true;
        layers[root] = 0;
        while (queue.length) {
            var cur = queue.shift();
            var nl = layers[cur] + 1;
            Object.keys(tableAdj[cur] || {}).forEach(function(nb) {
                if (!visited[nb]) {
                    visited[nb] = true;
                    layers[nb] = nl;
                    queue.push(nb);
                }
            });
        }
        var maxLayer = 0;
        Object.values(layers).forEach(function(l) { if (l > maxLayer) maxLayer = l; });
        tableKeys.forEach(function(tk) {
            if (layers[tk] === undefined) layers[tk] = maxLayer + 1;
        });

        // Group nodes by tableKey
        var groupsByTable = {};
        nodesList.forEach(function(node) {
            var tk = node._tableKey || node.group;
            if (!groupsByTable[tk]) groupsByTable[tk] = [];
            groupsByTable[tk].push(node);
        });

        var sortedTableKeys = Object.keys(groupsByTable).sort(function(a, b) {
            var la = layers[a] || 0, lb = layers[b] || 0;
            if (la !== lb) return la - lb;
            return a < b ? -1 : a > b ? 1 : 0;
        });

        // Measure each table group block
        var groupBlocks = [];
        var totalArea = 0;
        sortedTableKeys.forEach(function(tk) {
            var gnodes = groupsByTable[tk];
            var maxW = 0;
            var totalH = 0;
            var gNodeSizes = [];
            gnodes.forEach(function(node, idx) {
                var sz = estimateNodeSize(node);
                gNodeSizes.push(sz);
                if (sz.w > maxW) maxW = sz.w;
                totalH += sz.h;
                if (idx > 0) totalH += GAP_Y;
            });
            groupBlocks.push({
                tableKey: tk,
                nodes: gnodes,
                nodeSizes: gNodeSizes,
                w: maxW,
                h: totalH,
                layer: layers[tk] || 0
            });
            totalArea += maxW * totalH;
        });

        // Calculate target aspect ratio and max column height
        var viewportRatio = cw / Math.max(ch, 1);
        var targetRatio = Math.min(viewportRatio, 16 / 9) * 0.85;
        var idealH = Math.sqrt(totalArea / targetRatio);
        var maxColH = Math.max(idealH, ch * 0.6);
        groupBlocks.forEach(function(b) {
            if (b.h > maxColH) maxColH = b.h + GROUP_GAP;
        });

        // Column bin-packing
        var columns = [];
        groupBlocks.forEach(function(block) {
            var bestCol = -1;
            var bestFit = Infinity;

            for (var ci = 0; ci < columns.length; ci++) {
                var remaining = maxColH - columns[ci].y;
                if (remaining >= block.h) {
                    var fit = remaining - block.h;
                    if (fit < bestFit) {
                        bestFit = fit;
                        bestCol = ci;
                    }
                }
            }

            if (bestCol === -1) {
                var newX = MARGIN;
                if (columns.length > 0) {
                    var lastCol = columns[columns.length - 1];
                    newX = lastCol.x + lastCol.w + CORRIDOR;
                }
                columns.push({ x: newX, y: MARGIN, w: 0 });
                bestCol = columns.length - 1;
            }

            var col = columns[bestCol];
            var blockX = col.x;
            var blockY = col.y;

            var curY = blockY;
            block.nodes.forEach(function(node, ni) {
                var sz = block.nodeSizes[ni];
                var nodeX = blockX + block.w / 2;
                var nodeY = curY + sz.h / 2;

                nodesDS.update({ id: node.id, x: nodeX, y: nodeY });
                curY += sz.h + GAP_Y;
            });

            col.y = blockY + block.h + GROUP_GAP;
            if (block.w > col.w) col.w = block.w;
        });
    }

    /* ====================================================================
     * INIT VIS.JS NETWORK
     * ==================================================================== */

    function initNetwork(nodesData, edgesData) {
        var options = {
            nodes: {
                shape: 'box',
                font: { face: 'monospace', size: 10, align: 'left', multi: false },
                margin: { top: 6, bottom: 6, left: 8, right: 8 },
                borderWidth: 2,
                shadow: false,
                widthConstraint: { minimum: 120, maximum: DbRel.showFullContent ? 800 : 300 }
            },
            edges: {
                width: 1.2,
                smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.4 },
                arrows: { to: { enabled: true, scaleFactor: 0.6 } },
                font: { size: 7, align: 'middle', strokeWidth: 2, strokeColor: '#ffffff' },
                chosen: true
            },
            layout: {
                hierarchical: false
            },
            physics: {
                enabled: false
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true,
                tooltipDelay: 100,
                multiselect: false,
                navigationButtons: false,
                keyboard: false
            }
        };

        network = new vis.Network(containerEl, { nodes: nodesData, edges: edgesData }, options);

        // Image cache for myadmin PNG icons
        var iconImgCache = {};

        // Draw table icons and pivot icons on nodes after main rendering
        network.on('afterDrawing', function(ctx) {
            if (!nodesDS) return;
            nodesDS.forEach(function(node) {
                if (!node._tableName) return;
                var bbox = network.getBoundingBox(node.id);
                if (!bbox) return;

                // Draw table icon in top-left of node
                var iconInfo = DbRel.getTableIconInfo(node._tableName);
                if (iconInfo && iconInfo.src) {
                    ctx.save();
                    ctx.globalAlpha = node.opacity !== undefined ? node.opacity : 1;
                    if (!iconImgCache[iconInfo.src]) {
                        var img = new Image();
                        img.src = iconInfo.src;
                        iconImgCache[iconInfo.src] = img;
                        img.onload = function() { if (network) network.redraw(); };
                    }
                    var cached = iconImgCache[iconInfo.src];
                    if (cached.complete && cached.naturalWidth > 0) {
                        ctx.drawImage(cached, bbox.left + 4, bbox.top + 2, 16, 16);
                    }
                    ctx.restore();
                }

                // Draw pivot icon in top-right
                var pivotInfo = DbRel.getNodePivotInfo(node._tableKey, node._rowIndex);
                if (pivotInfo) {
                    ctx.save();
                    ctx.globalAlpha = node.opacity !== undefined ? node.opacity : 1;
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.font = '11px sans-serif';
                    ctx.textBaseline = 'top';
                    ctx.textAlign = 'center';
                    ctx.fillText('\u2316', bbox.right - 10, bbox.top + 5);
                    ctx.restore();
                }
            });
        });

        setupInteractions();
    }

    /* ====================================================================
     * INTERACTIONS
     * ==================================================================== */

    function setupInteractions() {
        // Single click: focus/unfocus (with pivot support)
        network.on('click', function(params) {
            if (params.nodes.length > 0) {
                var clickedId = params.nodes[0];
                var nodeData = nodesDS.get(clickedId);

                // Check if click is in the pivot icon area (top-right of header)
                if (nodeData && nodeData._tableName) {
                    var pivotInfo = DbRel.getNodePivotInfo(nodeData._tableKey, nodeData._rowIndex);
                    if (pivotInfo && params.pointer && params.pointer.canvas) {
                        var bbox = network.getBoundingBox(clickedId);
                        if (bbox) {
                            var canvasX = params.pointer.canvas.x;
                            var canvasY = params.pointer.canvas.y;
                            var nodeW = bbox.right - bbox.left;
                            var relX = canvasX - bbox.left;
                            var relY = canvasY - bbox.top;
                            if (relX > nodeW - 24 && relY < 22) {
                                DbRel.pivotTo(nodeData._tableKey, nodeData._rowIndex);
                                return;
                            }
                        }
                    }
                }

                if (focusedNodeId === clickedId) {
                    unfocusNodeInternal();
                } else {
                    focusNodeInternal(clickedId);
                }
            } else {
                if (focusedNodeId) unfocusNodeInternal();
            }
        });

        // Double click: show row modal
        network.on('doubleClick', function(params) {
            if (params.nodes.length > 0) {
                var nodeId = params.nodes[0];
                var nodeData = nodesDS.get(nodeId);
                if (nodeData) {
                    DbRel.showRowModal(nodeData._tableKey, nodeData._rowIndex);
                }
            }
        });

        // Hover node: highlight connected
        network.on('hoverNode', function(params) {
            if (focusedNodeId) return;
            highlightConnected(params.node);
        });

        network.on('blurNode', function() {
            if (focusedNodeId) return;
            clearAllDimming();
        });

        // Hover edge: tooltip
        network.on('hoverEdge', function(params) {
            var eData = edgesDS.get(params.edge);
            if (!eData || !eData._relData) return;
            var rd = eData._relData;
            var dom = params.pointer && params.pointer.DOM;
            if (dom) {
                var rect = containerEl.getBoundingClientRect();
                DbRel.showTooltip(DbRel.getLinkTooltipHtml(rd), rect.left + dom.x, rect.top + dom.y);
            }
            if (!focusedNodeId) {
                highlightEdgeEndpoints(params.edge);
            }
        });

        network.on('blurEdge', function() {
            DbRel.hideTooltip();
            if (!focusedNodeId) clearAllDimming();
        });

        // Track zoom
        network.on('zoom', function() {
            updateZoomFromNetwork();
        });
    }

    /* ====================================================================
     * FOCUS / HIGHLIGHT
     * ==================================================================== */

    function focusNodeInternal(nodeId) {
        if (focusedNodeId && focusedNodeId !== nodeId) {
            restorePositions();
        }

        focusedNodeId = nodeId;

        var connectedNodes = {};
        connectedNodes[nodeId] = true;
        var connectedEdges = {};

        edgesDS.forEach(function(edge) {
            if (edge.from === nodeId || edge.to === nodeId) {
                connectedNodes[edge.from] = true;
                connectedNodes[edge.to] = true;
                connectedEdges[edge.id] = true;
            }
        });

        var focusPos = network.getPositions([nodeId])[nodeId];
        if (!focusPos) return;

        var neighbors = [];
        nodesDS.forEach(function(node) {
            if (node.id !== nodeId && connectedNodes[node.id]) {
                neighbors.push(node.id);
            }
        });

        // Save original positions
        savedPositions = {};
        var allPositions = network.getPositions(neighbors);
        neighbors.forEach(function(nid) {
            if (allPositions[nid]) {
                savedPositions[nid] = { x: allPositions[nid].x, y: allPositions[nid].y };
            }
        });

        // Ring layout around focus
        var radius = Math.max(250, neighbors.length * 35);
        var angleStep = (2 * Math.PI) / Math.max(neighbors.length, 1);
        var updates = [];
        neighbors.forEach(function(nid, i) {
            var angle = -Math.PI / 2 + i * angleStep;
            updates.push({
                id: nid,
                x: focusPos.x + radius * Math.cos(angle),
                y: focusPos.y + radius * Math.sin(angle)
            });
        });
        if (updates.length > 0) {
            nodesDS.update(updates);
        }

        applyDistanceDimming(nodeId);

        var focusIds = [nodeId].concat(neighbors);
        network.fit({
            nodes: focusIds,
            animation: { duration: 400, easingFunction: 'easeInOutQuad' }
        });
    }

    function unfocusNodeInternal() {
        restorePositions();
        focusedNodeId = null;
        clearAllDimming();
    }

    function restorePositions() {
        var updates = [];
        Object.keys(savedPositions).forEach(function(nid) {
            updates.push({
                id: nid,
                x: savedPositions[nid].x,
                y: savedPositions[nid].y
            });
        });
        if (updates.length > 0) {
            nodesDS.update(updates);
        }
        savedPositions = {};
    }

    function highlightConnected(nodeId) {
        var connected = {};
        connected[nodeId] = true;
        var connEdges = {};
        edgesDS.forEach(function(edge) {
            if (edge.from === nodeId || edge.to === nodeId) {
                connected[edge.from] = true;
                connected[edge.to] = true;
                connEdges[edge.id] = true;
            }
        });
        applyDimming(connected, connEdges);
    }

    function highlightEdgeEndpoints(edgeId) {
        var edge = edgesDS.get(edgeId);
        if (!edge) return;
        var connected = {};
        connected[edge.from] = true;
        connected[edge.to] = true;
        var connEdges = {};
        connEdges[edgeId] = true;
        applyDimming(connected, connEdges);
    }

    function applyDimming(activeNodes, activeEdges) {
        dimmedState = true;

        var nodeUpdates = [];
        nodesDS.forEach(function(node) {
            var isActive = activeNodes[node.id];
            nodeUpdates.push({
                id: node.id,
                opacity: isActive ? 1.0 : 0.15,
                borderWidth: isActive ? 3 : 1,
                font: {
                    multi: false,
                    face: 'monospace',
                    size: 10,
                    color: isActive ? '#343a40' : '#ccc',
                    align: 'left'
                }
            });
        });
        nodesDS.update(nodeUpdates);

        var edgeUpdates = [];
        edgesDS.forEach(function(edge) {
            var isActive = activeEdges[edge.id];
            var origStyle = EDGE_STYLES[edge._relType] || EDGE_STYLES['direct'];
            edgeUpdates.push({
                id: edge.id,
                width: isActive ? 2.5 : 0.3,
                color: {
                    color: isActive ? origStyle.color : '#e0e0e0',
                    highlight: origStyle.color,
                    hover: origStyle.color,
                    opacity: isActive ? 1.0 : 0.1
                },
                font: {
                    size: isActive ? 8 : 0,
                    color: isActive ? origStyle.color : 'transparent',
                    strokeWidth: 2,
                    strokeColor: '#ffffff'
                }
            });
        });
        edgesDS.update(edgeUpdates);
    }

    function applyDistanceDimming(focusId) {
        dimmedState = true;
        var distances = DbRel.computeNodeDistances(focusId);

        var nodeUpdates = [];
        nodesDS.forEach(function(node) {
            var dist = distances[node.id];
            var opacity = DbRel.distanceToOpacity(dist);
            // Preserve original font face
            var origFont = node.font || {};
            nodeUpdates.push({
                id: node.id,
                opacity: opacity,
                borderWidth: dist !== undefined && dist <= 1 ? 3 : 1,
                font: {
                    multi: origFont.multi !== undefined ? origFont.multi : false,
                    face: origFont.face || 'monospace',
                    size: origFont.size || 10,
                    color: opacity >= 0.5 ? '#343a40' : '#ccc',
                    align: origFont.align || 'left'
                }
            });
        });
        nodesDS.update(nodeUpdates);

        var edgeUpdates = [];
        edgesDS.forEach(function(edge) {
            var sDist = distances[edge.from] !== undefined ? distances[edge.from] : Infinity;
            var tDist = distances[edge.to] !== undefined ? distances[edge.to] : Infinity;
            var edgeDist = Math.max(sDist, tDist);
            var edgeOpacity = DbRel.distanceToOpacity(edgeDist);
            var origStyle = EDGE_STYLES[edge._relType] || EDGE_STYLES['direct'];
            edgeUpdates.push({
                id: edge.id,
                width: edgeOpacity >= 0.5 ? 2.5 : Math.max(0.3, 1.2 * edgeOpacity),
                color: {
                    color: edgeOpacity >= 0.5 ? origStyle.color : '#e0e0e0',
                    highlight: origStyle.color,
                    hover: origStyle.color,
                    opacity: edgeOpacity
                },
                font: {
                    size: edgeOpacity >= 0.5 ? 8 : 0,
                    color: edgeOpacity >= 0.5 ? origStyle.color : 'transparent',
                    strokeWidth: 2,
                    strokeColor: '#ffffff'
                }
            });
        });
        edgesDS.update(edgeUpdates);
    }

    function clearAllDimming() {
        if (!dimmedState) return;
        dimmedState = false;

        var nodeUpdates = [];
        nodesDS.forEach(function(node) {
            var origFont = node.font || {};
            nodeUpdates.push({
                id: node.id,
                opacity: 1.0,
                borderWidth: 2,
                font: {
                    multi: origFont.multi !== undefined ? origFont.multi : false,
                    face: origFont.face || 'monospace',
                    size: origFont.size || 10,
                    color: '#343a40',
                    align: origFont.align || 'left'
                }
            });
        });
        nodesDS.update(nodeUpdates);

        var edgeUpdates = [];
        edgesDS.forEach(function(edge) {
            var origStyle = EDGE_STYLES[edge._relType] || EDGE_STYLES['direct'];
            edgeUpdates.push({
                id: edge.id,
                width: 1.2,
                color: { color: origStyle.color, highlight: origStyle.color, hover: origStyle.color, opacity: 1.0 },
                font: {
                    size: 7,
                    color: origStyle.color,
                    strokeWidth: 2,
                    strokeColor: '#ffffff'
                }
            });
        });
        edgesDS.update(edgeUpdates);
    }

    /* ====================================================================
     * FILTER LOGIC
     * ==================================================================== */

    function applyFiltersInternal(dbF, typeF) {
        if (!nodesDS || !edgesDS) return;

        var hiddenNodes = {};
        nodesDS.forEach(function(node) {
            var visible = dbF[node._dbName] !== false;
            hiddenNodes[node.id] = !visible;
        });

        var nodeUpdates = [];
        nodesDS.forEach(function(node) {
            nodeUpdates.push({ id: node.id, hidden: hiddenNodes[node.id] });
        });
        nodesDS.update(nodeUpdates);

        var edgeUpdates = [];
        edgesDS.forEach(function(edge) {
            var typeVis = typeF[edge._relType] !== false;
            var fromVis = !hiddenNodes[edge.from];
            var toVis = !hiddenNodes[edge.to];
            edgeUpdates.push({ id: edge.id, hidden: !typeVis || !fromVis || !toVis });
        });
        edgesDS.update(edgeUpdates);
    }

    /* ====================================================================
     * ZOOM HELPERS
     * ==================================================================== */

    function updateZoomFromNetwork() {
        if (!network) return;
        var scale = network.getScale();
        zoomLevel = Math.round(scale * 100);
        zoomLevel = Math.max(5, Math.min(300, zoomLevel));
        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('visjs', {
        init: function(el) {
            containerEl = el;
        },

        render: function() {
            buildNetwork();
        },

        doLayout: function() {
            if (!network || !nodesDS || !DbRel.data) return;
            var nodesList = [];
            nodesDS.forEach(function(node) { nodesList.push(node); });
            applyCompactLayout(nodesList);
            setTimeout(function() {
                if (network) {
                    network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
                    updateZoomFromNetwork();
                }
            }, 50);
        },

        setZoom: function(pct) {
            if (!network) return;
            zoomLevel = pct;
            var scale = pct / 100;
            var viewPos = network.getViewPosition();
            network.moveTo({
                position: viewPos,
                scale: scale,
                animation: false
            });
            DbRel.setZoomSlider(pct);
        },

        getZoom: function() {
            return zoomLevel;
        },

        fitToScreen: function() {
            if (!network) return;
            network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
            updateZoomFromNetwork();
        },

        applyFilters: function(dbF, typeF) {
            applyFiltersInternal(dbF, typeF);
        },

        focusNode: function(nodeId) {
            focusNodeInternal(nodeId);
        },

        unfocusNode: function() {
            unfocusNodeInternal();
        },

        centerOnTable: function(tableKey) {
            if (!network) return;
            var nodeId = DbRel.displayMode === 'grouped' ? tableKey : tableKey + ':0';
            var nodeData = nodesDS ? nodesDS.get(nodeId) : null;
            if (nodeData) {
                network.focus(nodeId, {
                    scale: 1.2,
                    animation: { duration: 400, easingFunction: 'easeInOutQuad' }
                });
            }
        },

        getStats: function() {
            return {
                nodes: nodesDS ? nodesDS.length : 0,
                links: edgesDS ? edgesDS.length : 0
            };
        },

        resize: function() {
            if (network) network.redraw();
        },

        highlightTable: function(tk) {
            if (!nodesDS || !edgesDS) return;
            var activeNodes = {};
            nodesDS.forEach(function(node) {
                if (node._tableKey === tk) activeNodes[node.id] = true;
            });
            var activeEdges = {};
            edgesDS.forEach(function(edge) {
                if (activeNodes[edge.from] || activeNodes[edge.to]) {
                    activeEdges[edge.id] = true;
                    activeNodes[edge.from] = true;
                    activeNodes[edge.to] = true;
                }
            });
            applyDimming(activeNodes, activeEdges);
        },

        clearHighlightTable: function() {
            clearAllDimming();
        },

        destroy: function() {
            if (network) {
                network.destroy();
                network = null;
            }
            nodesDS = null;
            edgesDS = null;
            containerEl = null;
            focusedNodeId = null;
            savedPositions = {};
            dimmedState = false;
            zoomLevel = 100;
        }
    });

})();
