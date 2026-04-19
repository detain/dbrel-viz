/**
 * Database Relationships - AntV G6 v4 Renderer
 * Full-featured graph with custom card nodes, dagre layout, minimap plugin,
 * and built-in tooltips using AntV G6 v4.
 * Features: dagre layout, minimap, radial/circular layout options, custom card shape.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var g6Graph = null, containerEl = null, zoomLevel = 100;
    var focusedNodeId = null;
    var nodeCount = 0, linkCount = 0;
    var minimapPlugin = null;

    /* ====================================================================
     * CUSTOM NODE REGISTRATION
     * ==================================================================== */

    var customNodeRegistered = false;

    function registerCustomNode() {
        if (customNodeRegistered) return;
        customNodeRegistered = true;
        G6.registerNode('db-card', {
            draw: function(cfg, group) {
                var w = cfg._w || 160;
                var h = cfg._h || 50;
                var colors = cfg._colors || { header: '#007bff', bg: '#f0f7ff', border: '#b8daff' };
                var header = cfg._header || '';
                var lines = cfg._lines || [];

                // Body rect (also serves as keyShape)
                var keyShape = group.addShape('rect', {
                    attrs: {
                        x: 0, y: 0, width: w, height: h,
                        fill: colors.bg, stroke: colors.border,
                        lineWidth: 1, radius: 3, cursor: 'pointer'
                    },
                    name: 'body-rect',
                    draggable: true
                });

                // Header background
                group.addShape('rect', {
                    attrs: {
                        x: 0, y: 0, width: w, height: DbRel.HDR_H,
                        fill: colors.header, radius: [3, 3, 0, 0]
                    },
                    name: 'header-rect',
                    draggable: true
                });

                // Table icon in header
                var hdrTextX = 6;
                var tblName = cfg._tableName || (cfg.id && cfg.id.indexOf('.') > -1 ? cfg.id.split('.')[1] : '');
                var iconInfo = tblName ? DbRel.getTableIconInfo(tblName) : null;
                if (iconInfo && iconInfo.src) {
                    group.addShape('image', {
                        attrs: {
                            x: 3, y: 3, width: 16, height: 16,
                            img: iconInfo.src
                        },
                        name: 'header-icon'
                    });
                    hdrTextX = 22;
                }

                // Header text
                group.addShape('text', {
                    attrs: {
                        x: hdrTextX, y: DbRel.HDR_H / 2 + 1,
                        text: header,
                        fontSize: 10, fontWeight: 'bold', fontFamily: 'monospace',
                        fill: '#fff', textBaseline: 'middle', textAlign: 'left',
                        cursor: 'pointer'
                    },
                    name: 'header-text',
                    draggable: true
                });

                // Row lines
                for (var i = 0; i < lines.length; i++) {
                    group.addShape('text', {
                        attrs: {
                            x: 6, y: DbRel.HDR_H + DbRel.PAD + (i + 1) * DbRel.ROW_H,
                            text: lines[i],
                            fontSize: 9, fontFamily: 'monospace',
                            fill: '#495057', textBaseline: 'alphabetic', textAlign: 'left'
                        },
                        name: 'line-text-' + i
                    });
                }

                // Pivot icon for pivotable tables
                if (cfg._pivotable) {
                    group.addShape('text', {
                        attrs: {
                            x: w - 14, y: DbRel.HDR_H / 2 + 1,
                            text: '\u2316',
                            fontSize: 11, fontFamily: 'sans-serif',
                            fill: '#fff', textBaseline: 'middle', textAlign: 'center',
                            cursor: 'pointer', opacity: 0.7
                        },
                        name: 'pivot-icon'
                    });
                }

                return keyShape;
            },
            getAnchorPoints: function() {
                return [
                    [0, 0.5],   // left center
                    [1, 0.5],   // right center
                    [0.5, 0],   // top center
                    [0.5, 1]    // bottom center
                ];
            },
            setState: function(name, value, item) {
                var group = item.getContainer();
                var bodyRect = group.find(function(el) { return el.get('name') === 'body-rect'; });
                if (!bodyRect) return;

                if (name === 'highlight') {
                    bodyRect.attr('lineWidth', value ? 3 : 1);
                    bodyRect.attr('stroke', value ? '#000' : (item.getModel()._colors || {}).border || '#dee2e6');
                }
                if (name === 'dimmed') {
                    group.attr('opacity', value ? 0.12 : 1);
                }
            }
        }, 'single-node');
    }

    /* ====================================================================
     * CUSTOM EDGE REGISTRATION
     * ==================================================================== */

    var customEdgeRegistered = false;

    function registerCustomEdge() {
        if (customEdgeRegistered) return;
        customEdgeRegistered = true;
        G6.registerEdge('db-link', {
            afterDraw: function(cfg, group) {
                var shape = group.get('children')[0];
                if (!shape) return;
                var style = cfg._style || DbRel.LINK_STYLES['direct'];

                // Animate dash for non-direct links
                if (style.strokeDasharray && style.strokeDasharray !== '0') {
                    var dashArr = style.strokeDasharray.split(',').map(Number);
                    var totalLen = 0;
                    for (var i = 0; i < dashArr.length; i++) totalLen += dashArr[i];
                    if (totalLen > 0) {
                        var idx = 0;
                        shape.animate(function() {
                            idx = (idx + 0.5) % totalLen;
                            return { lineDashOffset: -idx };
                        }, { repeat: true, duration: 3000 });
                    }
                }
            },
            setState: function(name, value, item) {
                var group = item.getContainer();
                var shape = group.get('children')[0];
                if (!shape) return;
                var model = item.getModel();
                var style = model._style || DbRel.LINK_STYLES['direct'];

                if (name === 'highlight') {
                    shape.attr('lineWidth', value ? style.strokeWidth + 2 : style.strokeWidth);
                    shape.attr('shadowBlur', value ? 6 : 0);
                    shape.attr('shadowColor', value ? style.stroke : 'transparent');
                }
                if (name === 'dimmed') {
                    shape.attr('opacity', value ? 0.06 : 1);
                }
            }
        }, 'line');
    }

    /* ====================================================================
     * BUILD GRAPH DATA
     * ==================================================================== */

    function buildGraphData() {
        if (!DbRel.data) return { nodes: [], edges: [] };
        DbRel.resetTableColors();
        nodeCount = 0;
        linkCount = 0;
        var nodes = [], edges = [];

        if (DbRel.displayMode === 'grouped') {
            buildGroupedData(nodes, edges);
        } else {
            buildSeparateData(nodes, edges);
        }

        return { nodes: nodes, edges: edges };
    }

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
                var size = DbRel.computeNodeSize(header, lines);

                nodes.push({
                    id: nodeId,
                    type: 'db-card',
                    size: [size.w, size.h],
                    _w: size.w,
                    _h: size.h,
                    _header: header,
                    _lines: lines,
                    _colors: colors,
                    _tableKey: tableKey,
                    _dbName: dbName,
                    _tableName: tableName,
                    _rowIndex: ri,
                    _pivotable: !!DbRel.getPivotConfig(tableName)
                });
                nodeCount++;
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                match[1].forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    // Verify both nodes exist
                    var srcExists = false, tgtExists = false;
                    for (var n = 0; n < nodes.length; n++) {
                        if (nodes[n].id === srcNodeId) srcExists = true;
                        if (nodes[n].id === tgtNodeId) tgtExists = true;
                        if (srcExists && tgtExists) break;
                    }
                    if (!srcExists || !tgtExists) return;

                    var dashArr = style.strokeDasharray === '0' ? undefined :
                        style.strokeDasharray.split(',').map(Number);

                    edges.push({
                        id: 'e-' + linkCount,
                        source: srcNodeId,
                        target: tgtNodeId,
                        type: 'db-link',
                        _style: style,
                        _relType: rel.type,
                        _relLabel: rel.label,
                        _relData: rel,
                        style: {
                            stroke: style.stroke,
                            lineWidth: style.strokeWidth,
                            lineDash: dashArr,
                            endArrow: {
                                path: G6.Arrow.triangle(6, 8, 0),
                                fill: style.stroke,
                                d: 0
                            }
                        },
                        labelCfg: {
                            autoRotate: true,
                            style: {
                                fill: style.stroke,
                                fontSize: 7,
                                fontFamily: 'sans-serif',
                                background: {
                                    fill: '#fff',
                                    padding: [2, 4, 2, 4],
                                    radius: 2
                                }
                            }
                        },
                        label: rel.source_field + '\u2192' + rel.target_field
                    });
                    linkCount++;
                });
            });
        });
    }

    function buildGroupedData(nodes, edges) {
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);

            nodes.push({
                id: tableKey,
                type: 'db-card',
                size: [size.w, size.h],
                _w: size.w,
                _h: size.h,
                _header: tableName + ' (' + tableInfo.total + ')',
                _lines: lines,
                _colors: colors,
                _tableKey: tableKey,
                _dbName: dbName,
                _tableName: tableName,
                _rowIndex: 0,
                _pivotable: !!DbRel.getPivotConfig(tableName)
            });
            nodeCount++;
        });

        DbRel.data.relationships.forEach(function(rel) {
            var srcExists = false, tgtExists = false;
            for (var n = 0; n < nodes.length; n++) {
                if (nodes[n].id === rel.source) srcExists = true;
                if (nodes[n].id === rel.target) tgtExists = true;
                if (srcExists && tgtExists) break;
            }
            if (!srcExists || !tgtExists) return;

            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            var dashArr = style.strokeDasharray === '0' ? undefined :
                style.strokeDasharray.split(',').map(Number);

            edges.push({
                id: 'e-' + linkCount,
                source: rel.source,
                target: rel.target,
                type: 'db-link',
                _style: style,
                _relType: rel.type,
                _relLabel: rel.label,
                _relData: rel,
                style: {
                    stroke: style.stroke,
                    lineWidth: style.strokeWidth,
                    lineDash: dashArr,
                    endArrow: {
                        path: G6.Arrow.triangle(6, 8, 0),
                        fill: style.stroke,
                        d: 0
                    }
                },
                labelCfg: {
                    autoRotate: true,
                    style: {
                        fill: style.stroke,
                        fontSize: 8,
                        fontFamily: 'sans-serif',
                        background: {
                            fill: '#fff',
                            padding: [2, 4, 2, 4],
                            radius: 2
                        }
                    }
                },
                label: rel.label
            });
            linkCount++;
        });
    }

    /* ====================================================================
     * INIT GRAPH
     * ==================================================================== */

    function initGraph(el) {
        containerEl = el;
        el.innerHTML = '';

        registerCustomNode();
        registerCustomEdge();

        var wrap = el.parentElement || el;
        var width = wrap.clientWidth || 1200;
        var height = Math.max(wrap.clientHeight || 600, 500);

        // Minimap plugin -- unique G6 feature
        minimapPlugin = new G6.Minimap({
            size: [180, 120],
            className: 'db-rel-g6-minimap',
            type: 'keyShape'
        });

        // Tooltip for edges
        var edgeTooltip = new G6.Tooltip({
            offsetX: 12,
            offsetY: 12,
            itemTypes: ['edge'],
            getContent: function(e) {
                var model = e.item.getModel();
                if (model._relData) {
                    var div = document.createElement('div');
                    div.style.padding = '6px 10px';
                    div.style.fontSize = '12px';
                    div.style.background = '#fff';
                    div.style.borderRadius = '4px';
                    div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                    div.innerHTML = DbRel.getLinkTooltipHtml(model._relData);
                    return div;
                }
                return '';
            }
        });

        g6Graph = new G6.Graph({
            container: el,
            width: width,
            height: height,
            fitView: true,
            fitViewPadding: 30,
            animate: true,
            animateCfg: { duration: 400, easing: 'easeCubic' },
            modes: {
                default: [
                    'drag-canvas',
                    'zoom-canvas',
                    'drag-node',
                    'activate-relations'
                ]
            },
            layout: {
                type: 'dagre',
                rankdir: 'LR',
                nodesep: 8,
                ranksep: 50,
                controlPoints: true
            },
            defaultEdge: {
                type: 'db-link',
                style: {
                    stroke: '#495057',
                    lineWidth: 1.2,
                    endArrow: true
                }
            },
            nodeStateStyles: {
                highlight: {},
                dimmed: {}
            },
            edgeStateStyles: {
                highlight: {},
                dimmed: {}
            },
            plugins: [minimapPlugin, edgeTooltip]
        });

        // Event handlers
        setupEvents();
        zoomLevel = 100;
    }

    /* ====================================================================
     * EVENTS
     * ==================================================================== */

    function setupEvents() {
        // Single click to focus/unfocus (with pivot support)
        g6Graph.on('node:click', function(e) {
            var model = e.item.getModel();
            var nodeId = model.id;

            // Check if click was on pivot icon
            if (model._pivotable && e.shape && e.shape.get('name') === 'pivot-icon') {
                DbRel.pivotTo(model._tableKey, model._rowIndex);
                return;
            }

            if (focusedNodeId === nodeId) {
                unfocusNodeInternal();
            } else {
                focusNodeInternal(nodeId);
            }
        });

        // Double-click to show modal
        g6Graph.on('node:dblclick', function(e) {
            var model = e.item.getModel();
            if (model._tableKey !== undefined && model._rowIndex !== undefined) {
                DbRel.showRowModal(model._tableKey, model._rowIndex);
            }
        });

        // Node hover highlight
        g6Graph.on('node:mouseenter', function(e) {
            if (focusedNodeId) return;
            g6Graph.setItemState(e.item, 'highlight', true);
            containerEl.style.cursor = 'pointer';
        });
        g6Graph.on('node:mouseleave', function(e) {
            if (focusedNodeId) return;
            g6Graph.setItemState(e.item, 'highlight', false);
            containerEl.style.cursor = 'default';
        });

        // Background click unfocus
        g6Graph.on('canvas:click', function() {
            if (focusedNodeId) unfocusNodeInternal();
        });

        // Zoom tracking
        g6Graph.on('viewportchange', function(e) {
            if (e.action === 'zoom') {
                zoomLevel = Math.round(g6Graph.getZoom() * 100);
                DbRel.setZoomSlider(zoomLevel);
            }
        });
    }

    /* ====================================================================
     * RENDER
     * ==================================================================== */

    function render() {
        if (!g6Graph || !DbRel.data) return;
        var data = buildGraphData();

        // Apply initial positions from DbRel's layout if dagre doesn't apply
        var wrap = containerEl.parentElement || containerEl;
        var cw = wrap.clientWidth || 1200;
        var ch = wrap.clientHeight || 700;
        var positions = DbRel.computeLayout(cw, ch);

        data.nodes.forEach(function(node) {
            var pos = positions[node.id];
            if (pos) {
                node.x = pos.x + pos.w / 2;
                node.y = pos.y + pos.h / 2;
            }
        });

        g6Graph.data(data);
        g6Graph.render();

        // Use dagre layout for better visual hierarchy
        g6Graph.updateLayout({
            type: 'dagre',
            rankdir: 'LR',
            nodesep: 8,
            ranksep: 50
        });

        setTimeout(function() {
            g6Graph.fitView(30);
            zoomLevel = Math.round(g6Graph.getZoom() * 100);
            DbRel.setZoomSlider(zoomLevel);
            DbRel.updateSidebar();
        }, 500);
    }

    /* ====================================================================
     * LAYOUT
     * ==================================================================== */

    function doLayoutInternal() {
        if (!g6Graph) return;

        // Re-apply dagre layout
        g6Graph.updateLayout({
            type: 'dagre',
            rankdir: 'LR',
            nodesep: 8,
            ranksep: 50
        });

        setTimeout(function() {
            g6Graph.fitView(30);
            zoomLevel = Math.round(g6Graph.getZoom() * 100);
            DbRel.setZoomSlider(zoomLevel);
        }, 300);
    }

    /* ====================================================================
     * ZOOM / FIT
     * ==================================================================== */

    function setZoomInternal(pct) {
        if (!g6Graph) return;
        zoomLevel = pct;
        g6Graph.zoomTo(pct / 100);
        DbRel.setZoomSlider(pct);
    }

    function fitToScreenInternal() {
        if (!g6Graph) return;
        g6Graph.fitView(30);
        zoomLevel = Math.round(g6Graph.getZoom() * 100);
        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFiltersInternal(dbF, typeF) {
        if (!g6Graph) return;
        var nodes = g6Graph.getNodes();
        var edges = g6Graph.getEdges();

        nodes.forEach(function(nodeItem) {
            var model = nodeItem.getModel();
            var visible = dbF[model._dbName] !== false;
            if (visible) {
                nodeItem.show();
            } else {
                nodeItem.hide();
            }
        });

        edges.forEach(function(edgeItem) {
            var model = edgeItem.getModel();
            var sourceModel = g6Graph.findById(model.source);
            var targetModel = g6Graph.findById(model.target);
            var srcVisible = sourceModel && sourceModel.isVisible();
            var tgtVisible = targetModel && targetModel.isVisible();
            var typeVisible = typeF[model._relType] !== false;
            if (srcVisible && tgtVisible && typeVisible) {
                edgeItem.show();
            } else {
                edgeItem.hide();
            }
        });
    }

    /* ====================================================================
     * FOCUS / UNFOCUS
     * ==================================================================== */

    function focusNodeInternal(nodeId) {
        focusedNodeId = nodeId;
        if (!g6Graph) return;

        var focusItem = g6Graph.findById(nodeId);
        if (!focusItem) return;

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(nodeId);

        g6Graph.getNodes().forEach(function(nodeItem) {
            var nid = nodeItem.getModel().id;
            var dist = distances[nid];
            var opacity = DbRel.distanceToOpacity(dist);
            g6Graph.setItemState(nodeItem, 'highlight', dist !== undefined && dist <= 1);
            g6Graph.setItemState(nodeItem, 'dimmed', false);
            g6Graph.updateItem(nodeItem, { style: { opacity: opacity } });
        });

        var edges = g6Graph.getEdges();
        edges.forEach(function(edgeItem) {
            var model = edgeItem.getModel();
            var sDist = distances[model.source] !== undefined ? distances[model.source] : Infinity;
            var tDist = distances[model.target] !== undefined ? distances[model.target] : Infinity;
            var edgeDist = Math.max(sDist, tDist);
            var edgeOpacity = DbRel.distanceToOpacity(edgeDist);
            var isDirectlyConnected = model.source === nodeId || model.target === nodeId;
            g6Graph.setItemState(edgeItem, 'highlight', isDirectlyConnected);
            g6Graph.setItemState(edgeItem, 'dimmed', false);
            g6Graph.updateItem(edgeItem, { style: { opacity: edgeOpacity } });
        });

        // Focus/center on node with animation
        g6Graph.focusItem(focusItem, true, {
            easing: 'easeCubic',
            duration: 400
        });
    }

    function unfocusNodeInternal() {
        focusedNodeId = null;
        if (!g6Graph) return;

        // Clear all states and reset opacity
        g6Graph.getNodes().forEach(function(nodeItem) {
            g6Graph.setItemState(nodeItem, 'highlight', false);
            g6Graph.setItemState(nodeItem, 'dimmed', false);
            g6Graph.updateItem(nodeItem, { style: { opacity: 1 } });
        });
        g6Graph.getEdges().forEach(function(edgeItem) {
            g6Graph.setItemState(edgeItem, 'highlight', false);
            g6Graph.setItemState(edgeItem, 'dimmed', false);
            g6Graph.updateItem(edgeItem, { style: { opacity: 1 } });
        });
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTableInternal(tableKey) {
        if (!g6Graph) return;
        var nodeId = DbRel.displayMode === 'grouped' ? tableKey : tableKey + ':0';
        var item = g6Graph.findById(nodeId);
        if (item) {
            g6Graph.focusItem(item, true, {
                easing: 'easeCubic',
                duration: 400
            });
        }
    }

    /* ====================================================================
     * STATS / RESIZE / DESTROY
     * ==================================================================== */

    function getStatsInternal() {
        if (!g6Graph) return { nodes: 0, links: 0 };
        return {
            nodes: g6Graph.getNodes().length,
            links: g6Graph.getEdges().length
        };
    }

    function resizeInternal() {
        if (!g6Graph || !containerEl) return;
        var wrap = containerEl.parentElement || containerEl;
        var w = wrap.clientWidth || 800;
        var h = Math.max(wrap.clientHeight || 500, 500);
        g6Graph.changeSize(w, h);
    }

    function destroyInternal() {
        if (g6Graph) {
            g6Graph.destroy();
        }
        if (containerEl) containerEl.innerHTML = '';
        g6Graph = null;
        containerEl = null;
        minimapPlugin = null;
        focusedNodeId = null;
        nodeCount = 0;
        linkCount = 0;
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('g6', {
        init: function(el) { initGraph(el); },
        render: function() { render(); },
        doLayout: function() { doLayoutInternal(); },
        setZoom: function(pct) { setZoomInternal(pct); },
        getZoom: function() { return zoomLevel; },
        fitToScreen: function() { fitToScreenInternal(); },
        applyFilters: function(dbF, typeF) { applyFiltersInternal(dbF, typeF); },
        focusNode: function(nodeId) { focusNodeInternal(nodeId); },
        unfocusNode: function() { unfocusNodeInternal(); },
        centerOnTable: function(tableKey) { centerOnTableInternal(tableKey); },
        getStats: function() { return getStatsInternal(); },
        resize: function() { resizeInternal(); },
        highlightTable: function(tk) {
            if (!g6Graph) return;
            var activeNodes = {};
            g6Graph.getNodes().forEach(function(node) {
                var model = node.getModel();
                if (model._tableKey === tk) activeNodes[model.id] = true;
            });
            g6Graph.getEdges().forEach(function(edge) {
                var model = edge.getModel();
                if (activeNodes[model.source] || activeNodes[model.target]) {
                    activeNodes[model.source] = true;
                    activeNodes[model.target] = true;
                }
            });
            g6Graph.getNodes().forEach(function(node) {
                var id = node.getModel().id;
                g6Graph.setItemState(node, 'highlight', !!activeNodes[id]);
                g6Graph.setItemState(node, 'dimmed', !activeNodes[id]);
            });
            g6Graph.getEdges().forEach(function(edge) {
                var m = edge.getModel();
                var active = activeNodes[m.source] && activeNodes[m.target];
                g6Graph.setItemState(edge, 'highlight', !!active);
                g6Graph.setItemState(edge, 'dimmed', !active);
            });
        },
        clearHighlightTable: function() {
            if (!g6Graph) return;
            g6Graph.getNodes().forEach(function(node) {
                g6Graph.clearItemStates(node, ['highlight', 'dimmed']);
            });
            g6Graph.getEdges().forEach(function(edge) {
                g6Graph.clearItemStates(edge, ['highlight', 'dimmed']);
            });
        },
        destroy: function() { destroyInternal(); }
    });

})();
