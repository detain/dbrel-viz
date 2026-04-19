/**
 * Database Relationships - maxGraph Renderer
 * Uses maxGraph (successor to mxGraph) loaded via dynamic ESM import from esm.sh.
 * Graph visualization with HTML label nodes, orthogonal edge routing,
 * hierarchical layout, and interactive exploration.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var deps = null;
    var graph = null;
    var containerEl = null;
    var zoomLevel = 100;
    var focusedNodeId = null;
    var savedPositions = {};
    var cellMeta = {};
    var edgeMeta = {};
    var nodeCount = 0;
    var linkCount = 0;
    var loadingEl = null;

    /* ====================================================================
     * DEPENDENCY LOADING
     * ==================================================================== */

    function loadDeps() {
        if (deps) return Promise.resolve(deps);
        return import('https://esm.sh/@maxgraph/core@0.23.0').then(function(mod) {
            deps = {
                Graph: mod.Graph,
                InternalEvent: mod.InternalEvent,
                Rectangle: mod.Rectangle,
                HierarchicalLayout: mod.HierarchicalLayout,
                constants: mod.constants
            };
            return deps;
        });
    }

    function showLoading() {
        if (!containerEl) return;
        loadingEl = document.createElement('div');
        loadingEl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;z-index:100;font-family:sans-serif;';
        loadingEl.innerHTML = '<div style="font-size:14px;color:#666;margin-bottom:8px;">Loading maxGraph library...</div>' +
            '<div style="width:40px;height:40px;border:3px solid #dee2e6;border-top-color:#007bff;border-radius:50%;animation:dbrel-spin 1s linear infinite;margin:0 auto;"></div>';
        var style = document.createElement('style');
        style.textContent = '@keyframes dbrel-spin{to{transform:rotate(360deg)}}';
        containerEl.appendChild(style);
        containerEl.appendChild(loadingEl);
    }

    function hideLoading() {
        if (loadingEl && loadingEl.parentNode) {
            loadingEl.parentNode.removeChild(loadingEl);
            loadingEl = null;
        }
    }

    /* ====================================================================
     * ESCAPE HELPER
     * ==================================================================== */

    function escHtml(s) {
        var d = document.createElement('span');
        d.textContent = String(s || '');
        return d.innerHTML;
    }

    /* ====================================================================
     * GRAPH INITIALIZATION
     * ==================================================================== */

    function initGraphInternal() {
        if (!containerEl || !deps) return;

        var Graph = deps.Graph;
        var InternalEvent = deps.InternalEvent;

        InternalEvent.disableContextMenu(containerEl);

        graph = new Graph(containerEl);
        graph.setHtmlLabels(true);
        graph.setPanning(true);

        try {
            var panHandler = graph.getPlugin('PanningHandler');
            if (panHandler) panHandler.useLeftButtonForPanning = false;
        } catch(e) { /* ignore */ }

        graph.setConnectable(false);
        graph.setAllowDanglingEdges(false);
        graph.setCellsEditable(false);
        graph.setCellsResizable(false);
        graph.setCellsMovable(true);
        graph.setTooltips(false);

        configureStyles();
        setupEventHandlers();
    }

    function configureStyles() {
        if (!graph) return;

        var vertexStyle = graph.getStylesheet().getDefaultVertexStyle();
        vertexStyle.shape = 'label';
        vertexStyle.rounded = true;
        vertexStyle.arcSize = 8;
        vertexStyle.fillColor = '#ffffff';
        vertexStyle.strokeColor = '#dee2e6';
        vertexStyle.strokeWidth = 1;
        vertexStyle.fontColor = '#333333';
        vertexStyle.fontSize = 10;
        vertexStyle.fontFamily = 'Consolas, Monaco, monospace';
        vertexStyle.align = 'left';
        vertexStyle.verticalAlign = 'top';
        vertexStyle.spacingLeft = 6;
        vertexStyle.spacingTop = 2;
        vertexStyle.spacingRight = 6;
        vertexStyle.spacingBottom = 4;
        vertexStyle.overflow = 'hidden';
        vertexStyle.whiteSpace = 'wrap';

        var edgeStyle = graph.getStylesheet().getDefaultEdgeStyle();
        edgeStyle.edgeStyle = 'entityRelationEdgeStyle';
        edgeStyle.rounded = true;
        edgeStyle.segment = 20;
        edgeStyle.strokeColor = '#64748b';
        edgeStyle.strokeWidth = 1.5;
        edgeStyle.fontColor = '#64748b';
        edgeStyle.fontSize = 8;
        edgeStyle.fontFamily = 'sans-serif';
        edgeStyle.labelBackgroundColor = '#f8f9fa';
        edgeStyle.endArrow = 'classic';
        edgeStyle.endSize = 6;
        edgeStyle.startArrow = 'none';
    }

    /* ====================================================================
     * EVENT HANDLERS
     * ==================================================================== */

    function setupEventHandlers() {
        if (!graph) return;

        graph.addListener('click', function(sender, evt) {
            var cell = evt.getProperty('cell');
            var mouseEvt = evt.getProperty('event');

            // Check for pivot icon click
            if (mouseEvt && mouseEvt.target) {
                var target = mouseEvt.target;
                if (target.classList && target.classList.contains('dbrel-maxgraph-pivot')) {
                    var tk = target.getAttribute('data-table-key');
                    var ri = parseInt(target.getAttribute('data-row-index'), 10);
                    if (tk) {
                        DbRel.pivotTo(tk, ri);
                        return;
                    }
                }
            }

            if (!cell) {
                unfocusInternal();
                return;
            }
            if (cell.isVertex()) {
                var nodeId = cell.getId();
                if (focusedNodeId === nodeId) {
                    unfocusInternal();
                } else {
                    focusNodeInternal(nodeId);
                }
            }
        });

        graph.addListener('doubleClick', function(sender, evt) {
            var cell = evt.getProperty('cell');
            if (!cell || !cell.isVertex()) return;
            var nodeId = cell.getId();
            var meta = cellMeta[nodeId];
            if (!meta) return;
            DbRel.showRowModal(meta.tableKey, meta.rowIndex);
        });

        // Tooltip on edge hover
        graph.addMouseListener({
            mouseDown: function() {},
            mouseUp: function() {},
            mouseMove: function(sender, me) {
                var cell = me.getCell();
                if (cell && cell.isEdge()) {
                    var eId = cell.getId();
                    var em = edgeMeta[eId];
                    if (em && em.relData) {
                        var html = DbRel.getLinkTooltipHtml(em.relData);
                        DbRel.showTooltip(html, me.getEvent().clientX + 12, me.getEvent().clientY + 12);
                    }
                } else {
                    DbRel.hideTooltip();
                }
            }
        });
    }

    /* ====================================================================
     * BUILD VERTEX HTML
     * ==================================================================== */

    function buildVertexHtml(header, lines, colors, meta) {
        var parts = [];
        parts.push('<div style="font-family:Consolas,Monaco,monospace;font-size:10px;line-height:1.2;overflow:hidden;">');
        parts.push('<div style="background:');
        parts.push(escHtml(colors.header));
        parts.push(';color:#fff;padding:3px 6px;font-weight:bold;');
        parts.push('border-radius:4px 4px 0 0;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative;">');
        var tblName = meta && meta.tableKey ? meta.tableKey.split('.')[1] : null;
        if (tblName) {
            var iconHtml = DbRel.getTableIconHtml(tblName);
            if (iconHtml) parts.push(iconHtml);
        }
        parts.push(escHtml(header));
        // Pivot icon for pivotable tables
        if (meta && meta.tableKey) {
            var tableName = meta.tableKey.split('.')[1];
            if (tableName && DbRel.getPivotConfig(tableName)) {
                parts.push('<span class="dbrel-maxgraph-pivot" data-table-key="');
                parts.push(escHtml(meta.tableKey));
                parts.push('" data-row-index="');
                parts.push(String(meta.rowIndex));
                parts.push('" style="position:absolute;right:4px;top:2px;cursor:pointer;opacity:0.7;font-family:sans-serif;font-size:11px;" title="Pivot">&#x2316;</span>');
            }
        }
        parts.push('</div>');
        parts.push('<div style="padding:3px 6px;font-size:9px;color:#495057;white-space:pre;line-height:1.35;">');
        for (var i = 0; i < lines.length; i++) {
            parts.push(escHtml(lines[i]));
            parts.push('\n');
        }
        parts.push('</div></div>');
        return parts.join('');
    }

    /* ====================================================================
     * BUILD EDGE STYLE
     * ==================================================================== */

    function buildEdgeStyle(type) {
        var ls = DbRel.LINK_STYLES[type] || DbRel.LINK_STYLES['direct'];
        var style = {
            edgeStyle: 'orthogonalEdgeStyle',
            rounded: true,
            jettySize: 'auto',
            strokeColor: ls.stroke,
            strokeWidth: ls.strokeWidth,
            fontColor: ls.stroke,
            fontSize: 8,
            fontFamily: 'sans-serif',
            labelBackgroundColor: '#f8f9fa',
            endArrow: 'classic',
            endSize: 6,
            startArrow: 'none'
        };
        if (ls.strokeDasharray && ls.strokeDasharray !== '0') {
            style.dashed = true;
            style.dashPattern = ls.strokeDasharray.replace(/,/g, ' ');
        }
        return style;
    }

    /* ====================================================================
     * BUILD GRAPH
     * ==================================================================== */

    function buildGraph() {
        if (!DbRel.data || !graph) return;

        focusedNodeId = null;
        savedPositions = {};
        cellMeta = {};
        edgeMeta = {};
        nodeCount = 0;
        linkCount = 0;
        DbRel.resetTableColors();

        var model = graph.getDataModel();
        model.beginUpdate();
        try {
            graph.removeCells(graph.getChildCells(graph.getDefaultParent(), true, true));

            if (DbRel.displayMode === 'grouped') {
                buildGrouped();
            } else {
                buildSeparate();
            }
        } finally {
            model.endUpdate();
        }

        doLayoutInternal();
        setTimeout(function() { fitToScreenInternal(); }, 100);
    }

    /* ====================================================================
     * SEPARATE MODE
     * ==================================================================== */

    function buildSeparate() {
        var parent = graph.getDefaultParent();
        var tableKeys = Object.keys(DbRel.data.tables);
        var vertexMap = {};

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
                var label = buildVertexHtml(header, lines, colors, { tableKey: tableKey, rowIndex: ri });

                var cell = graph.insertVertex({
                    parent: parent,
                    id: nodeId,
                    value: label,
                    position: [0, 0],
                    size: [size.w, size.h],
                    style: {
                        shape: 'label',
                        rounded: true,
                        arcSize: 6,
                        fillColor: colors.bg,
                        strokeColor: colors.border,
                        strokeWidth: 1,
                        fontColor: '#333',
                        fontSize: 10,
                        fontFamily: 'Consolas, Monaco, monospace',
                        align: 'left',
                        verticalAlign: 'top',
                        overflow: 'fill',
                        spacingLeft: 0,
                        spacingTop: 0,
                        spacingRight: 0,
                        spacingBottom: 0,
                        html: true
                    }
                });

                vertexMap[nodeId] = cell;
                cellMeta[nodeId] = { tableKey: tableKey, dbName: dbName, tableName: tableName, rowIndex: ri, colors: colors };
                nodeCount++;
            });
        });

        // Edges
        DbRel.data.relationships.forEach(function(rel) {
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                var srcCell = vertexMap[srcNodeId];
                if (!srcCell) return;

                match[1].forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    var tgtCell = vertexMap[tgtNodeId];
                    if (!tgtCell) return;

                    var edgeLabel = rel.source_field + '\u2192' + rel.target_field;
                    var edge = graph.insertEdge({
                        parent: graph.getDefaultParent(),
                        value: edgeLabel,
                        source: srcCell,
                        target: tgtCell,
                        style: buildEdgeStyle(rel.type)
                    });

                    var eId = edge.getId();
                    edgeMeta[eId] = { relType: rel.type, relLabel: rel.label, relData: rel };
                    linkCount++;
                });
            });
        });
    }

    /* ====================================================================
     * GROUPED MODE
     * ==================================================================== */

    function buildGrouped() {
        var parent = graph.getDefaultParent();
        var tableKeys = Object.keys(DbRel.data.tables);
        var vertexMap = {};

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var headerLabel = tableName + ' (' + tableInfo.total + ')';
            var size = DbRel.computeGroupedNodeSize(tableName, lines);
            var label = buildVertexHtml(headerLabel, lines, colors, { tableKey: tableKey, rowIndex: 0 });

            var cell = graph.insertVertex({
                parent: parent,
                id: tableKey,
                value: label,
                position: [0, 0],
                size: [size.w, size.h],
                style: {
                    shape: 'label',
                    rounded: true,
                    arcSize: 6,
                    fillColor: colors.bg,
                    strokeColor: colors.border,
                    strokeWidth: 1,
                    fontColor: '#333',
                    fontSize: 10,
                    fontFamily: 'Consolas, Monaco, monospace',
                    align: 'left',
                    verticalAlign: 'top',
                    overflow: 'fill',
                    spacingLeft: 0,
                    spacingTop: 0,
                    spacingRight: 0,
                    spacingBottom: 0,
                    html: true
                }
            });

            vertexMap[tableKey] = cell;
            cellMeta[tableKey] = { tableKey: tableKey, dbName: dbName, tableName: tableName, rowIndex: 0, colors: colors };
            nodeCount++;
        });

        // One edge per relationship
        var edgeMap = {};
        DbRel.data.relationships.forEach(function(rel) {
            var edgeKey = rel.source + '->' + rel.target + '::' + rel.type;
            if (edgeMap[edgeKey]) return;
            edgeMap[edgeKey] = true;

            var srcCell = vertexMap[rel.source];
            var tgtCell = vertexMap[rel.target];
            if (!srcCell || !tgtCell) return;

            var edge = graph.insertEdge({
                parent: graph.getDefaultParent(),
                value: rel.label,
                source: srcCell,
                target: tgtCell,
                style: buildEdgeStyle(rel.type)
            });

            var eId = edge.getId();
            edgeMeta[eId] = { relType: rel.type, relLabel: rel.label, relData: rel };
            linkCount++;
        });
    }

    /* ====================================================================
     * LAYOUT (column bin-pack matching other renderers)
     * ==================================================================== */

    function doLayoutInternal() {
        if (!graph || !DbRel.data) return;
        var layout = DbRel.computeLayout(
            containerEl ? containerEl.clientWidth : 1200,
            containerEl ? containerEl.clientHeight : 700
        );
        if (!layout) return;

        var model = graph.getDataModel();
        model.beginUpdate();
        try {
            var parent = graph.getDefaultParent();
            var vertices = graph.getChildVertices(parent);
            vertices.forEach(function(v) {
                var nodeId = v.getId();
                var pos = layout[nodeId];
                if (pos) {
                    var geo = v.getGeometry().clone();
                    geo.x = pos.x;
                    geo.y = pos.y;
                    model.setGeometry(v, geo);
                }
            });
        } finally {
            model.endUpdate();
        }
    }

    /* ====================================================================
     * ZOOM & FIT
     * ==================================================================== */

    function setZoomInternal(pct) {
        if (!graph) return;
        zoomLevel = pct;
        var scale = pct / 100;
        graph.getView().setScale(scale);
        DbRel.setZoomSlider(pct);
    }

    function fitToScreenInternal() {
        if (!graph || !containerEl) return;
        try {
            if (typeof graph.fit === 'function') {
                graph.fit(20);
            } else {
                // Manual fit for maxGraph versions without graph.fit()
                var bounds = graph.getGraphBounds();
                if (!bounds || bounds.width === 0 || bounds.height === 0) return;
                var cw = containerEl.clientWidth || 800;
                var ch = containerEl.clientHeight || 600;
                var pad = 20;
                var sx = (cw - 2 * pad) / bounds.width;
                var sy = (ch - 2 * pad) / bounds.height;
                var s = Math.min(sx, sy, 1.5);
                s = Math.max(s, 0.02);
                var view = graph.getView();
                view.scaleAndTranslate(s,
                    (cw / s - bounds.width) / 2 - bounds.x,
                    (ch / s - bounds.height) / 2 - bounds.y
                );
            }
        } catch (e) { /* ignore fit errors */ }
        var scale = graph.getView ? graph.getView().getScale() : 1;
        zoomLevel = Math.round(scale * 100);
        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * FOCUS / UNFOCUS
     * ==================================================================== */

    function focusNodeInternal(nodeId) {
        if (!graph) return;
        focusedNodeId = nodeId;

        var parent = graph.getDefaultParent();
        var vertices = graph.getChildVertices(parent);
        var edges = graph.getChildEdges(parent);

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(nodeId);

        var model = graph.getDataModel();
        model.beginUpdate();
        try {
            vertices.forEach(function(v) {
                var vid = v.getId();
                var dist = distances[vid];
                var opacity = DbRel.distanceToOpacity(dist);
                // Clone existing style to avoid mutating computed style
                var style = Object.assign({}, graph.getCellStyle(v));
                style.opacity = Math.round(opacity * 100);
                if (vid === nodeId) {
                    style.strokeWidth = 3;
                    style.strokeColor = '#0d6efd';
                }
                model.setStyle(v, style);
            });
            edges.forEach(function(e) {
                var src = e.source;
                var tgt = e.target;
                if (!src || !tgt) return;
                var srcId = src.getId();
                var tgtId = tgt.getId();
                var sDist = distances[srcId] !== undefined ? distances[srcId] : Infinity;
                var tDist = distances[tgtId] !== undefined ? distances[tgtId] : Infinity;
                var edgeDist = Math.max(sDist, tDist);
                var edgeOpacity = DbRel.distanceToOpacity(edgeDist);
                // Clone existing style to avoid mutating computed style
                var style = Object.assign({}, graph.getCellStyle(e));
                style.opacity = Math.round(edgeOpacity * 100);
                if (srcId === nodeId || tgtId === nodeId) {
                    style.strokeWidth = 3;
                }
                model.setStyle(e, style);
            });
        } finally {
            model.endUpdate();
        }

        // Center on node
        var cell = graph.getDataModel().getCell(nodeId);
        if (cell) {
            graph.scrollCellToVisible(cell, true);
        }
    }

    function unfocusInternal() {
        if (!graph) return;
        focusedNodeId = null;

        // Rebuild to reset styles
        buildGraph();
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFiltersInternal(dbF, typeF) {
        if (!graph) return;
        var parent = graph.getDefaultParent();
        var vertices = graph.getChildVertices(parent);
        var edges = graph.getChildEdges(parent);

        var model = graph.getDataModel();
        model.beginUpdate();
        try {
            vertices.forEach(function(v) {
                var meta = cellMeta[v.getId()];
                if (!meta) return;
                var visible = dbF[meta.dbName] !== false;
                graph.getDataModel().setVisible(v, visible);
            });
            edges.forEach(function(e) {
                var em = edgeMeta[e.getId()];
                if (!em) return;
                var typeVisible = typeF[em.relType] !== false;
                var srcVisible = e.source && graph.getDataModel().isVisible(e.source);
                var tgtVisible = e.target && graph.getDataModel().isVisible(e.target);
                graph.getDataModel().setVisible(e, typeVisible && srcVisible && tgtVisible);
            });
        } finally {
            model.endUpdate();
        }
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTableInternal(tableKey) {
        if (!graph) return;
        var targetId = DbRel.displayMode === 'grouped' ? tableKey : tableKey + ':0';
        var cell = graph.getDataModel().getCell(targetId);
        if (cell) {
            graph.scrollCellToVisible(cell, true);
        }
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('maxgraph', {
        init: function(el) {
            containerEl = el;
            containerEl.style.position = 'relative';
            showLoading();
        },

        render: function() {
            loadDeps().then(function() {
                hideLoading();
                if (!graph) {
                    initGraphInternal();
                }
                buildGraph();
            }).catch(function(err) {
                hideLoading();
                if (containerEl) {
                    containerEl.innerHTML = '<div style="text-align:center;padding:40px;color:#dc3545;">Failed to load maxGraph: ' + escHtml(err.message) + '</div>';
                }
            });
        },

        doLayout: function() {
            doLayoutInternal();
        },

        setZoom: function(pct) {
            setZoomInternal(pct);
        },

        getZoom: function() {
            return zoomLevel;
        },

        fitToScreen: function() {
            fitToScreenInternal();
        },

        applyFilters: function(dbF, typeF) {
            applyFiltersInternal(dbF, typeF);
        },

        focusNode: function(nodeId) {
            focusNodeInternal(nodeId);
        },

        unfocusNode: function() {
            unfocusInternal();
        },

        centerOnTable: function(tableKey) {
            centerOnTableInternal(tableKey);
        },

        getStats: function() {
            return { nodes: nodeCount, links: linkCount };
        },

        resize: function() {
            if (graph && containerEl) {
                var w = containerEl.clientWidth;
                var h = containerEl.clientHeight;
                if (w > 0 && h > 0) {
                    graph.sizeDidChange();
                }
            }
        },

        highlightTable: function(tk) {
            if (!graph) return;
            var parent = graph.getDefaultParent();
            var cells = graph.getChildCells(parent, true, false);
            var activeIds = {};
            cells.forEach(function(cell) {
                var id = cell.getId();
                var meta = cellMeta[id];
                if (meta && meta.tableKey === tk) activeIds[id] = true;
            });
            var edges = graph.getChildCells(parent, false, true);
            edges.forEach(function(edge) {
                var src = edge.getTerminal(true);
                var tgt = edge.getTerminal(false);
                if (src && tgt && (activeIds[src.getId()] || activeIds[tgt.getId()])) {
                    activeIds[src.getId()] = true;
                    activeIds[tgt.getId()] = true;
                }
            });
            var model = graph.getDataModel();
            model.beginUpdate();
            try {
                cells.forEach(function(cell) {
                    var active = activeIds[cell.getId()];
                    graph.setCellStyles('opacity', active ? 100 : 12, [cell]);
                });
                edges.forEach(function(edge) {
                    var src = edge.getTerminal(true);
                    var tgt = edge.getTerminal(false);
                    var active = src && tgt && activeIds[src.getId()] && activeIds[tgt.getId()];
                    graph.setCellStyles('opacity', active ? 100 : 6, [edge]);
                });
            } finally {
                model.endUpdate();
            }
        },

        clearHighlightTable: function() {
            if (!graph) return;
            var parent = graph.getDefaultParent();
            var allCells = graph.getChildCells(parent, true, true);
            var model = graph.getDataModel();
            model.beginUpdate();
            try {
                allCells.forEach(function(cell) {
                    graph.setCellStyles('opacity', 100, [cell]);
                });
            } finally {
                model.endUpdate();
            }
        },

        destroy: function() {
            if (graph) {
                graph.destroy();
                graph = null;
            }
            if (containerEl) containerEl.innerHTML = '';
            containerEl = null;
            focusedNodeId = null;
            savedPositions = {};
            cellMeta = {};
            edgeMeta = {};
            nodeCount = 0;
            linkCount = 0;
            zoomLevel = 100;
        }
    });

})();
