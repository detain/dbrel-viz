/**
 * Database Relationships - force-graph Renderer
 * Canvas-based force-directed graph using vasturiano/force-graph.
 * Features: link directional particles, custom card node rendering, WebGL-ready.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var graph = null, containerEl = null, zoomLevel = 100;
    var focusedNodeId = null;
    var nodesById = {}, linksArr = [];
    var hoveredNodeId = null;

    /* ====================================================================
     * NODE CANVAS DRAWING
     * ==================================================================== */

    function drawNodeCard(node, ctx, globalScale) {
        var w = node._w || 160;
        var h = node._h || 50;
        var x = node.x - w / 2;
        var y = node.y - h / 2;
        var colors = node._colors || { header: '#007bff', bg: '#f0f7ff', border: '#b8daff' };
        var isFocused = focusedNodeId === node.id;
        var isConnected = node._connected;

        ctx.save();
        if (focusedNodeId) ctx.globalAlpha = node._focusOpacity !== undefined ? node._focusOpacity : 1;

        // Body
        ctx.fillStyle = colors.bg;
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = (hoveredNodeId === node.id || isFocused) ? 2.5 / globalScale : 1 / globalScale;
        roundRect(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.stroke();

        // Header
        ctx.fillStyle = colors.header;
        roundRectTop(ctx, x, y, w, DbRel.HDR_H, 3);
        ctx.fill();

        // Table icon + header text
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        var hdrTextX = x + 5;
        var iconInfo = node._tableName ? DbRel.getTableIconInfo(node._tableName) : null;
        if (iconInfo && iconInfo.src) {
            if (!node._iconImg) {
                node._iconImg = new Image();
                node._iconImg.src = iconInfo.src;
            }
            if (node._iconImg.complete) {
                ctx.drawImage(node._iconImg, x + 2, y + 2, 16, 16);
            }
            hdrTextX = x + 20;
        }
        ctx.font = 'bold ' + Math.max(10, 10 / globalScale * Math.min(globalScale, 1)) + 'px monospace';
        ctx.fillText(node._header || '', hdrTextX, y + DbRel.HDR_H / 2);

        // Row lines
        if (globalScale > 0.3) {
            var lines = node._lines || [];
            ctx.fillStyle = '#495057';
            ctx.font = Math.max(9, 9 / globalScale * Math.min(globalScale, 1)) + 'px monospace';
            ctx.textBaseline = 'top';
            for (var i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], x + 5, y + DbRel.HDR_H + DbRel.PAD + i * DbRel.ROW_H);
            }

            // Pivot icon for pivotable tables
            if (node._pivotable) {
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.font = Math.max(10, 11 / globalScale * Math.min(globalScale, 1)) + 'px sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillText('\u2316', x + w - 10, y + DbRel.HDR_H / 2);
                ctx.textBaseline = 'top';
                ctx.textAlign = 'left';
            }
        }

        ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function roundRectTop(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /* ====================================================================
     * BUILD NODES & LINKS
     * ==================================================================== */

    function buildGraphData() {
        if (!DbRel.data) return { nodes: [], links: [] };
        DbRel.resetTableColors();
        nodesById = {};
        linksArr = [];

        if (DbRel.displayMode === 'grouped') {
            buildGrouped();
        } else {
            buildSeparate();
        }

        return { nodes: Object.values(nodesById), links: linksArr };
    }

    function buildSeparate() {
        var tableKeys = Object.keys(DbRel.data.tables);
        var wrap = containerEl.parentElement || containerEl;
        var cw = wrap.clientWidth || 1200;
        var ch = wrap.clientHeight || 700;
        var positions = DbRel.computeLayout(cw, ch);

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
                var pos = positions[nodeId] || { x: Math.random() * cw, y: Math.random() * ch };

                var node = {
                    id: nodeId,
                    _header: header,
                    _lines: lines,
                    _w: size.w,
                    _h: size.h,
                    _colors: colors,
                    _tableKey: tableKey,
                    _dbName: dbName,
                    _tableName: tableName,
                    _rowIndex: ri,
                    _pivotable: !!DbRel.getPivotConfig(tableName),
                    _connected: false,
                    _visible: true,
                    x: pos.x + size.w / 2,
                    y: pos.y + size.h / 2
                };
                nodesById[nodeId] = node;
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                if (!nodesById[srcNodeId]) return;
                match[1].forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    if (!nodesById[tgtNodeId]) return;
                    linksArr.push({
                        source: srcNodeId,
                        target: tgtNodeId,
                        _style: style,
                        _relType: rel.type,
                        _relLabel: rel.label,
                        _relData: rel
                    });
                });
            });
        });
    }

    function buildGrouped() {
        var tableKeys = Object.keys(DbRel.data.tables);
        var wrap = containerEl.parentElement || containerEl;
        var cw = wrap.clientWidth || 1200;
        var ch = wrap.clientHeight || 700;
        var positions = DbRel.computeLayout(cw, ch);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);
            var pos = positions[tableKey] || { x: Math.random() * cw, y: Math.random() * ch };

            nodesById[tableKey] = {
                id: tableKey,
                _header: tableName + ' (' + tableInfo.total + ')',
                _lines: lines,
                _w: size.w,
                _h: size.h,
                _colors: colors,
                _tableKey: tableKey,
                _dbName: dbName,
                _tableName: tableName,
                _rowIndex: 0,
                _pivotable: !!DbRel.getPivotConfig(tableName),
                _connected: false,
                _visible: true,
                x: pos.x + size.w / 2,
                y: pos.y + size.h / 2
            };
        });

        DbRel.data.relationships.forEach(function(rel) {
            if (!nodesById[rel.source] || !nodesById[rel.target]) return;
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            linksArr.push({
                source: rel.source,
                target: rel.target,
                _style: style,
                _relType: rel.type,
                _relLabel: rel.label,
                _relData: rel
            });
        });
    }

    /* ====================================================================
     * CONNECTED NODE TRACKING
     * ==================================================================== */

    function updateConnectedFlags(focusId) {
        Object.values(nodesById).forEach(function(n) { n._connected = false; n._focusOpacity = 1; });
        if (!focusId) return;
        var distances = DbRel.computeNodeDistances(focusId);
        Object.values(nodesById).forEach(function(n) {
            var dist = distances[n.id];
            n._focusOpacity = DbRel.distanceToOpacity(dist);
            n._connected = dist !== undefined && dist <= 1;
        });
    }

    /* ====================================================================
     * INIT
     * ==================================================================== */

    function initGraph(el) {
        containerEl = el;
        el.innerHTML = '';

        graph = ForceGraph()(el)
            .backgroundColor('#fff')
            .nodeCanvasObject(function(node, ctx, globalScale) {
                drawNodeCard(node, ctx, globalScale);
            })
            .nodePointerAreaPaint(function(node, color, ctx) {
                var w = node._w || 160;
                var h = node._h || 50;
                ctx.fillStyle = color;
                ctx.fillRect(node.x - w / 2, node.y - h / 2, w, h);
            })
            .linkColor(function(link) {
                if (focusedNodeId) {
                    var sId = typeof link.source === 'object' ? link.source.id : link.source;
                    var tId = typeof link.target === 'object' ? link.target.id : link.target;
                    var sNode = nodesById[sId];
                    var tNode = nodesById[tId];
                    var sOp = sNode && sNode._focusOpacity !== undefined ? sNode._focusOpacity : 0;
                    var tOp = tNode && tNode._focusOpacity !== undefined ? tNode._focusOpacity : 0;
                    var edgeOpacity = Math.min(sOp, tOp);
                    return 'rgba(200,200,200,' + edgeOpacity + ')';
                }
                return link._style ? link._style.stroke : '#495057';
            })
            .linkWidth(function(link) {
                return link._style ? link._style.strokeWidth : 1.2;
            })
            .linkLineDash(function(link) {
                if (!link._style || link._style.strokeDasharray === '0') return null;
                return link._style.strokeDasharray.split(',').map(Number);
            })
            .linkDirectionalArrowLength(6)
            .linkDirectionalArrowRelPos(1)
            .linkDirectionalParticles(function(link) {
                if (focusedNodeId) {
                    var sId = typeof link.source === 'object' ? link.source.id : link.source;
                    var tId = typeof link.target === 'object' ? link.target.id : link.target;
                    if (sId === focusedNodeId || tId === focusedNodeId) return 3;
                }
                return 1;
            })
            .linkDirectionalParticleWidth(2)
            .linkDirectionalParticleSpeed(0.005)
            .linkDirectionalParticleColor(function(link) {
                return link._style ? link._style.stroke : '#495057';
            })
            .d3Force('charge', null)
            .d3Force('center', null)
            .d3Force('link', null)
            .cooldownTicks(0)
            .onNodeClick(function(node, event) {
                // Check if click is in pivot icon area (top-right 20x20 of header)
                if (node._pivotable && event) {
                    var w = node._w || 160;
                    var h = node._h || 50;
                    var nodeScreenX = node.x - w / 2;
                    var nodeScreenY = node.y - h / 2;
                    // Force-graph provides graph coordinates in event
                    var graphCoords = graph.screen2GraphCoords(event.offsetX, event.offsetY);
                    if (graphCoords) {
                        var relX = graphCoords.x - nodeScreenX;
                        var relY = graphCoords.y - nodeScreenY;
                        if (relX > w - 20 && relY < DbRel.HDR_H) {
                            DbRel.pivotTo(node._tableKey, node._rowIndex);
                            return;
                        }
                    }
                }

                var now = Date.now();
                if (node._lastClick && now - node._lastClick < 400 && node._lastClickId === node.id) {
                    // Double click - show modal
                    node._lastClick = 0;
                    if (node._tableKey !== undefined && node._rowIndex !== undefined) {
                        DbRel.showRowModal(node._tableKey, node._rowIndex);
                    }
                    return;
                }
                node._lastClick = now;
                node._lastClickId = node.id;
                if (focusedNodeId === node.id) {
                    unfocusNodeInternal();
                } else {
                    focusNodeInternal(node.id);
                }
            })
            .onNodeHover(function(node) {
                hoveredNodeId = node ? node.id : null;
                if (containerEl) containerEl.style.cursor = node ? 'pointer' : 'default';
            })
            .onLinkHover(function(link, prevLink) {
                if (link && link._relData) {
                    var evt = window.event || {};
                    DbRel.showTooltip(DbRel.getLinkTooltipHtml(link._relData), evt.clientX || 0, evt.clientY || 0);
                } else {
                    DbRel.hideTooltip();
                }
            })
            .onBackgroundClick(function() {
                if (focusedNodeId) unfocusNodeInternal();
            })
            .onZoom(function(transform) {
                zoomLevel = Math.round(transform.k * 100);
                DbRel.setZoomSlider(zoomLevel);
            });

        // Track mouse for tooltip positioning
        containerEl.addEventListener('mousemove', function(e) {
            if (hoveredNodeId) return; // node hover handled above
        });
    }

    /* ====================================================================
     * RENDER
     * ==================================================================== */

    function render() {
        if (!graph || !DbRel.data) return;
        var data = buildGraphData();
        graph.graphData(data);
        graph.cooldownTicks(0);

        setTimeout(function() {
            fitToScreenInternal();
            DbRel.updateSidebar();
        }, 200);
    }

    /* ====================================================================
     * LAYOUT
     * ==================================================================== */

    function doLayoutInternal() {
        if (!graph || !DbRel.data) return;
        var wrap = containerEl.parentElement || containerEl;
        var cw = wrap.clientWidth || 1200;
        var ch = wrap.clientHeight || 700;
        var positions = DbRel.computeLayout(cw, ch);
        var gd = graph.graphData();

        gd.nodes.forEach(function(node) {
            var pos = positions[node.id];
            if (pos) {
                node.x = pos.x + pos.w / 2;
                node.y = pos.y + pos.h / 2;
                node.fx = node.x;
                node.fy = node.y;
            }
        });

        graph.graphData(gd);

        // Unpin after settling
        setTimeout(function() {
            gd.nodes.forEach(function(n) { n.fx = undefined; n.fy = undefined; });
            fitToScreenInternal();
        }, 100);
    }

    /* ====================================================================
     * ZOOM / FIT
     * ==================================================================== */

    function setZoomInternal(pct) {
        if (!graph) return;
        zoomLevel = pct;
        graph.zoom(pct / 100, 300);
        DbRel.setZoomSlider(pct);
    }

    function getZoomInternal() {
        return zoomLevel;
    }

    function fitToScreenInternal() {
        if (!graph) return;
        graph.zoomToFit(400, 30);
        setTimeout(function() {
            if (!graph) return;
            var transform = graph.zoom();
            zoomLevel = Math.round(transform * 100);
            DbRel.setZoomSlider(zoomLevel);
        }, 500);
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFiltersInternal(dbF, typeF) {
        if (!graph) return;
        var gd = graph.graphData();

        gd.nodes.forEach(function(node) {
            node._visible = dbF[node._dbName] !== false;
        });

        graph
            .nodeVisibility(function(node) { return node._visible; })
            .linkVisibility(function(link) {
                var sNode = typeof link.source === 'object' ? link.source : nodesById[link.source];
                var tNode = typeof link.target === 'object' ? link.target : nodesById[link.target];
                if (!sNode || !tNode) return false;
                if (!sNode._visible || !tNode._visible) return false;
                if (typeF[link._relType] === false) return false;
                return true;
            });
    }

    /* ====================================================================
     * FOCUS / UNFOCUS
     * ==================================================================== */

    function focusNodeInternal(nodeId) {
        focusedNodeId = nodeId;
        updateConnectedFlags(nodeId);
        if (!graph) return;

        var node = nodesById[nodeId];
        if (node) {
            graph.centerAt(node.x, node.y, 600);
            setTimeout(function() {
                if (!graph) return;
                graph.zoom(1.5, 400);
                zoomLevel = 150;
                DbRel.setZoomSlider(zoomLevel);
            }, 300);
        }

        // Force re-render for dimming effect
        graph.nodeCanvasObject(graph.nodeCanvasObject());
        graph.linkColor(graph.linkColor());
        graph.linkDirectionalParticles(graph.linkDirectionalParticles());
    }

    function unfocusNodeInternal() {
        focusedNodeId = null;
        updateConnectedFlags(null);
        if (graph) {
            graph.nodeCanvasObject(graph.nodeCanvasObject());
            graph.linkColor(graph.linkColor());
            graph.linkDirectionalParticles(graph.linkDirectionalParticles());
        }
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTableInternal(tableKey) {
        var nodeId = DbRel.displayMode === 'grouped' ? tableKey : tableKey + ':0';
        var node = nodesById[nodeId];
        if (node) {
            graph.centerAt(node.x, node.y, 600);
        }
    }

    /* ====================================================================
     * STATS / RESIZE / DESTROY
     * ==================================================================== */

    function getStatsInternal() {
        if (!graph) return { nodes: 0, links: 0 };
        var gd = graph.graphData();
        return { nodes: gd.nodes.length, links: gd.links.length };
    }

    function resizeInternal() {
        if (!graph || !containerEl) return;
        var wrap = containerEl.parentElement || containerEl;
        graph.width(wrap.clientWidth).height(Math.max(wrap.clientHeight, 500));
    }

    function destroyInternal() {
        if (graph) {
            // force-graph exposes _destructor in some builds, pauseAnimation in others
            if (typeof graph._destructor === 'function') {
                graph._destructor();
            } else if (typeof graph.pauseAnimation === 'function') {
                graph.pauseAnimation();
            }
        }
        if (containerEl) containerEl.innerHTML = '';
        graph = null;
        containerEl = null;
        nodesById = {};
        linksArr = [];
        focusedNodeId = null;
        hoveredNodeId = null;
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('forcegraph', {
        init: function(el) { initGraph(el); },
        render: function() { render(); },
        doLayout: function() { doLayoutInternal(); },
        setZoom: function(pct) { setZoomInternal(pct); },
        getZoom: function() { return getZoomInternal(); },
        fitToScreen: function() { fitToScreenInternal(); },
        applyFilters: function(dbF, typeF) { applyFiltersInternal(dbF, typeF); },
        focusNode: function(nodeId) { focusNodeInternal(nodeId); },
        unfocusNode: function() { unfocusNodeInternal(); },
        centerOnTable: function(tableKey) { centerOnTableInternal(tableKey); },
        getStats: function() { return getStatsInternal(); },
        resize: function() { resizeInternal(); },
        highlightTable: function(tk) {
            var activeSet = {};
            Object.values(nodesById).forEach(function(n) {
                if (n._tableKey === tk) activeSet[n.id] = true;
            });
            linksArr.forEach(function(l) {
                var sId = typeof l.source === 'object' ? l.source.id : l.source;
                var tId = typeof l.target === 'object' ? l.target.id : l.target;
                if (activeSet[sId] || activeSet[tId]) {
                    activeSet[sId] = true;
                    activeSet[tId] = true;
                }
            });
            Object.values(nodesById).forEach(function(n) { n._connected = !!activeSet[n.id]; });
            focusedNodeId = '__table_highlight__';
            if (graph) graph.refresh();
        },
        clearHighlightTable: function() {
            if (focusedNodeId === '__table_highlight__') {
                focusedNodeId = null;
                Object.values(nodesById).forEach(function(n) { n._connected = false; });
                if (graph) graph.refresh();
            }
        },
        destroy: function() { destroyInternal(); }
    });

})();
