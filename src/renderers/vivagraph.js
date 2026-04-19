/**
 * Database Relationships - VivaGraphJS Renderer
 * SVG-based graph with WebGL-capable layout engine using anvaka/VivaGraphJS.
 * Features: fast force-directed layout, SVG custom nodes, smooth panning/zoom.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var vivaGraph = null, vivaLayout = null, vivaRenderer = null, vivaGraphics = null;
    var containerEl = null, zoomLevel = 100;
    var focusedNodeId = null;
    var nodeDataMap = {}, linkDataMap = {};
    var nodeCount = 0, linkCount = 0;

    /* ====================================================================
     * SVG HELPERS
     * ==================================================================== */

    var SVG_NS = 'http://www.w3.org/2000/svg';

    function createSvgEl(tag, attrs) {
        var el = document.createElementNS(SVG_NS, tag);
        if (attrs) {
            Object.keys(attrs).forEach(function(k) { el.setAttribute(k, attrs[k]); });
        }
        return el;
    }

    function buildNodeSvg(nodeData) {
        var w = nodeData.w;
        var h = nodeData.h;
        var colors = nodeData.colors;
        var header = nodeData.header;
        var lines = nodeData.lines;

        var g = createSvgEl('g');

        // Body rect
        var body = createSvgEl('rect', {
            width: w, height: h, rx: 3, ry: 3,
            fill: colors.bg, stroke: colors.border, 'stroke-width': 1
        });
        g.appendChild(body);

        // Header rect
        var hdrRect = createSvgEl('rect', {
            width: w, height: DbRel.HDR_H, rx: 3, ry: 3,
            fill: colors.header
        });
        g.appendChild(hdrRect);

        // Header mask (square bottom corners of header)
        var hdrMask = createSvgEl('rect', {
            width: w, height: 10, y: 12, fill: colors.header
        });
        g.appendChild(hdrMask);

        // Table icon in header
        var hdrTextX = 6;
        var tblName = nodeData.tableKey ? nodeData.tableKey.split('.')[1] : null;
        var iconInfo = tblName ? DbRel.getTableIconInfo(tblName) : null;
        if (iconInfo && iconInfo.src) {
            var imgIcon = createSvgEl('image', {
                x: 3, y: 3, width: 16, height: 16
            });
            imgIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'href', iconInfo.src);
            g.appendChild(imgIcon);
            hdrTextX = 22;
        }

        // Header text
        var hdrText = createSvgEl('text', {
            x: hdrTextX, y: 15,
            'font-size': 10, 'font-weight': 'bold', 'font-family': 'monospace',
            fill: '#fff', 'text-anchor': 'start'
        });
        hdrText.textContent = header;
        g.appendChild(hdrText);

        // Row lines
        for (var i = 0; i < lines.length; i++) {
            var txt = createSvgEl('text', {
                x: 6, y: DbRel.HDR_H + DbRel.PAD + (i + 1) * DbRel.ROW_H,
                'font-size': 10, 'font-family': 'monospace',
                fill: '#495057', 'pointer-events': 'none'
            });
            txt.textContent = lines[i];
            g.appendChild(txt);
        }

        // Pivot icon for pivotable tables
        if (nodeData.tableKey) {
            var tableName = nodeData.tableKey.split('.')[1];
            if (tableName && DbRel.getPivotConfig(tableName)) {
                var pivotIcon = createSvgEl('text', {
                    x: w - 14, y: 15,
                    'font-size': 11, 'font-family': 'sans-serif',
                    fill: '#fff', cursor: 'pointer',
                    'pointer-events': 'all', opacity: 0.6,
                    'data-table-key': nodeData.tableKey,
                    'data-row-index': String(nodeData.rowIndex)
                });
                pivotIcon.textContent = '\u2316';
                pivotIcon.classList.add('dbrel-viva-pivot');
                pivotIcon.addEventListener('mouseenter', function() { this.setAttribute('opacity', '1'); });
                pivotIcon.addEventListener('mouseleave', function() { this.setAttribute('opacity', '0.6'); });
                pivotIcon.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var tk = this.getAttribute('data-table-key');
                    var ri = parseInt(this.getAttribute('data-row-index'), 10);
                    DbRel.pivotTo(tk, ri);
                });
                g.appendChild(pivotIcon);
            }
        }

        return g;
    }

    /* ====================================================================
     * BUILD GRAPH DATA
     * ==================================================================== */

    function buildGraphData() {
        if (!DbRel.data) return;
        DbRel.resetTableColors();
        nodeDataMap = {};
        linkDataMap = {};
        nodeCount = 0;
        linkCount = 0;

        if (vivaGraph) {
            vivaGraph.clear();
        } else {
            vivaGraph = Viva.Graph.graph();
        }

        if (DbRel.displayMode === 'grouped') {
            buildGrouped();
        } else {
            buildSeparate();
        }
    }

    function buildSeparate() {
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

                var data = {
                    header: header,
                    lines: lines,
                    w: size.w,
                    h: size.h,
                    colors: colors,
                    tableKey: tableKey,
                    dbName: dbName,
                    tableName: tableName,
                    rowIndex: ri,
                    visible: true
                };
                nodeDataMap[nodeId] = data;
                vivaGraph.addNode(nodeId, data);
                nodeCount++;
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                if (!nodeDataMap[srcNodeId]) return;
                match[1].forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    if (!nodeDataMap[tgtNodeId]) return;
                    var linkId = srcNodeId + '>' + tgtNodeId;
                    var data = {
                        style: style,
                        relType: rel.type,
                        relLabel: rel.label,
                        relData: rel
                    };
                    linkDataMap[linkId] = data;
                    vivaGraph.addLink(srcNodeId, tgtNodeId, data);
                    linkCount++;
                });
            });
        });
    }

    function buildGrouped() {
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);

            var data = {
                header: tableName + ' (' + tableInfo.total + ')',
                lines: lines,
                w: size.w,
                h: size.h,
                colors: colors,
                tableKey: tableKey,
                dbName: dbName,
                tableName: tableName,
                rowIndex: 0,
                visible: true
            };
            nodeDataMap[tableKey] = data;
            vivaGraph.addNode(tableKey, data);
            nodeCount++;
        });

        DbRel.data.relationships.forEach(function(rel) {
            if (!nodeDataMap[rel.source] || !nodeDataMap[rel.target]) return;
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            var linkId = rel.source + '>' + rel.target;
            var data = {
                style: style,
                relType: rel.type,
                relLabel: rel.label,
                relData: rel
            };
            linkDataMap[linkId] = data;
            vivaGraph.addLink(rel.source, rel.target, data);
            linkCount++;
        });
    }

    /* ====================================================================
     * INIT GRAPHICS & RENDERER
     * ==================================================================== */

    function initRenderer(el) {
        containerEl = el;
        el.innerHTML = '';

        vivaGraph = Viva.Graph.graph();
        vivaGraphics = Viva.Graph.View.svgGraphics();

        // Custom node rendering
        vivaGraphics.node(function(node) {
            var data = node.data;
            if (!data) {
                // Fallback for nodes without data
                var circle = createSvgEl('circle', { r: 5, fill: '#007bff' });
                return circle;
            }
            var g = buildNodeSvg(data);
            g.setAttribute('data-node-id', node.id);

            // Click handler
            g.addEventListener('click', function(e) {
                e.stopPropagation();
                if (focusedNodeId === node.id) {
                    unfocusNodeInternal();
                } else {
                    focusNodeInternal(node.id);
                }
            });

            // Double-click handler
            g.addEventListener('dblclick', function(e) {
                e.stopPropagation();
                if (data.tableKey !== undefined && data.rowIndex !== undefined) {
                    DbRel.showRowModal(data.tableKey, data.rowIndex);
                }
            });

            // Hover tooltip
            g.addEventListener('mouseenter', function() {
                g.querySelector('rect').setAttribute('stroke-width', '2.5');
                containerEl.style.cursor = 'pointer';
            });
            g.addEventListener('mouseleave', function() {
                g.querySelector('rect').setAttribute('stroke-width', '1');
                containerEl.style.cursor = 'default';
            });

            return g;
        }).placeNode(function(nodeUI, pos) {
            var data = nodeUI.node && nodeUI.node.data;
            var w = data ? data.w : 10;
            var h = data ? data.h : 10;
            nodeUI.setAttribute('transform', 'translate(' + (pos.x - w / 2) + ',' + (pos.y - h / 2) + ')');
        });

        // Custom link rendering
        vivaGraphics.link(function(link) {
            var data = link.data || {};
            var style = data.style || DbRel.LINK_STYLES['direct'];
            var line = createSvgEl('line', {
                stroke: style.stroke,
                'stroke-width': style.strokeWidth,
                'stroke-dasharray': style.strokeDasharray === '0' ? '' : style.strokeDasharray
            });
            line.setAttribute('data-link-id', (link.fromId || '') + '>' + (link.toId || ''));

            // Link hover tooltip
            line.addEventListener('mouseenter', function(e) {
                line.setAttribute('stroke-width', String(style.strokeWidth + 1.5));
                if (data.relData) {
                    DbRel.showTooltip(DbRel.getLinkTooltipHtml(data.relData), e.clientX, e.clientY);
                }
            });
            line.addEventListener('mousemove', function(e) {
                if (data.relData) {
                    DbRel.showTooltip(DbRel.getLinkTooltipHtml(data.relData), e.clientX, e.clientY);
                }
            });
            line.addEventListener('mouseleave', function() {
                line.setAttribute('stroke-width', String(style.strokeWidth));
                DbRel.hideTooltip();
            });

            return line;
        }).placeLink(function(linkUI, fromPos, toPos) {
            linkUI.setAttribute('x1', fromPos.x);
            linkUI.setAttribute('y1', fromPos.y);
            linkUI.setAttribute('x2', toPos.x);
            linkUI.setAttribute('y2', toPos.y);
        });

        vivaLayout = Viva.Graph.Layout.forceDirected(vivaGraph, {
            springLength: 200,
            springCoeff: 0.0002,
            dragCoeff: 0.02,
            gravity: -1.5,
            theta: 0.8
        });

        vivaRenderer = Viva.Graph.View.renderer(vivaGraph, {
            graphics: vivaGraphics,
            container: containerEl,
            layout: vivaLayout,
            prerender: 50
        });

        vivaRenderer.run();
        zoomLevel = 100;

        // Background click to unfocus
        containerEl.addEventListener('click', function(e) {
            if (e.target === containerEl || e.target.tagName === 'svg') {
                if (focusedNodeId) unfocusNodeInternal();
            }
        });
    }

    /* ====================================================================
     * RENDER
     * ==================================================================== */

    function render() {
        if (!DbRel.data || !containerEl) return;

        // Ensure container has dimensions (VivaGraph needs them for SVG sizing)
        if (!containerEl.clientWidth || !containerEl.clientHeight) {
            var wrap = containerEl.parentElement;
            if (wrap) {
                var rect = wrap.getBoundingClientRect();
                if (rect.width > 0) containerEl.style.width = Math.floor(rect.width) + 'px';
                if (rect.height > 0) containerEl.style.height = Math.floor(rect.height) + 'px';
            }
        }

        // Pause, rebuild, and restart
        if (vivaRenderer) {
            vivaRenderer.pause();
        }

        buildGraphData();

        // Apply initial positions from DbRel layout
        applyComputedLayout();

        // Recreate renderer with updated graph
        containerEl.innerHTML = '';
        vivaGraphics = Viva.Graph.View.svgGraphics();

        vivaGraphics.node(function(node) {
            var data = node.data;
            if (!data) {
                return createSvgEl('circle', { r: 5, fill: '#007bff' });
            }
            var g = buildNodeSvg(data);
            g.setAttribute('data-node-id', node.id);

            g.addEventListener('click', function(e) {
                e.stopPropagation();
                if (focusedNodeId === node.id) {
                    unfocusNodeInternal();
                } else {
                    focusNodeInternal(node.id);
                }
            });

            g.addEventListener('dblclick', function(e) {
                e.stopPropagation();
                if (data.tableKey !== undefined && data.rowIndex !== undefined) {
                    DbRel.showRowModal(data.tableKey, data.rowIndex);
                }
            });

            g.addEventListener('mouseenter', function() {
                g.querySelector('rect').setAttribute('stroke-width', '2.5');
                containerEl.style.cursor = 'pointer';
            });
            g.addEventListener('mouseleave', function() {
                g.querySelector('rect').setAttribute('stroke-width', '1');
                containerEl.style.cursor = 'default';
            });

            return g;
        }).placeNode(function(nodeUI, pos) {
            var data = nodeUI.node && nodeUI.node.data;
            var w = data ? data.w : 10;
            var h = data ? data.h : 10;
            nodeUI.setAttribute('transform', 'translate(' + (pos.x - w / 2) + ',' + (pos.y - h / 2) + ')');
        });

        vivaGraphics.link(function(link) {
            var data = link.data || {};
            var style = data.style || DbRel.LINK_STYLES['direct'];
            var line = createSvgEl('line', {
                stroke: style.stroke,
                'stroke-width': style.strokeWidth,
                'stroke-dasharray': style.strokeDasharray === '0' ? '' : style.strokeDasharray
            });

            line.addEventListener('mouseenter', function(e) {
                line.setAttribute('stroke-width', String(style.strokeWidth + 1.5));
                if (data.relData) {
                    DbRel.showTooltip(DbRel.getLinkTooltipHtml(data.relData), e.clientX, e.clientY);
                }
            });
            line.addEventListener('mousemove', function(e) {
                if (data.relData) {
                    DbRel.showTooltip(DbRel.getLinkTooltipHtml(data.relData), e.clientX, e.clientY);
                }
            });
            line.addEventListener('mouseleave', function() {
                line.setAttribute('stroke-width', String(style.strokeWidth));
                DbRel.hideTooltip();
            });

            return line;
        }).placeLink(function(linkUI, fromPos, toPos) {
            linkUI.setAttribute('x1', fromPos.x);
            linkUI.setAttribute('y1', fromPos.y);
            linkUI.setAttribute('x2', toPos.x);
            linkUI.setAttribute('y2', toPos.y);
        });

        vivaLayout = Viva.Graph.Layout.forceDirected(vivaGraph, {
            springLength: 200,
            springCoeff: 0.0002,
            dragCoeff: 0.02,
            gravity: -1.5,
            theta: 0.8
        });

        vivaRenderer = Viva.Graph.View.renderer(vivaGraph, {
            graphics: vivaGraphics,
            container: containerEl,
            layout: vivaLayout,
            prerender: 50
        });

        vivaRenderer.run();

        // Fix SVG dimensions - VivaGraph doesn't set width/height on the SVG element
        var svgEl = containerEl.querySelector('svg');
        if (svgEl) {
            svgEl.setAttribute('width', containerEl.clientWidth);
            svgEl.setAttribute('height', containerEl.clientHeight);
            svgEl.style.width = '100%';
            svgEl.style.height = '100%';
        }

        // Let layout stabilize briefly then pause
        setTimeout(function() {
            if (vivaRenderer && vivaGraph) {
                vivaRenderer.pause();
                DbRel.updateSidebar();
            }
        }, 2000);
    }

    /* ====================================================================
     * LAYOUT
     * ==================================================================== */

    function applyComputedLayout() {
        var wrap = containerEl.parentElement || containerEl;
        var cw = wrap.clientWidth || 1200;
        var ch = wrap.clientHeight || 700;
        var positions = DbRel.computeLayout(cw, ch);

        vivaGraph.forEachNode(function(node) {
            var pos = positions[node.id];
            if (pos && vivaLayout) {
                var nodePos = vivaLayout.getNodePosition(node.id);
                nodePos.x = pos.x + pos.w / 2;
                nodePos.y = pos.y + pos.h / 2;
            }
        });
    }

    function doLayoutInternal() {
        applyComputedLayout();
        if (vivaRenderer && vivaGraph) {
            vivaRenderer.resume();
            setTimeout(function() {
                if (vivaRenderer) vivaRenderer.pause();
            }, 1000);
        }
    }

    /* ====================================================================
     * ZOOM / FIT
     * ==================================================================== */

    function setZoomInternal(pct) {
        zoomLevel = pct;
        if (vivaRenderer) {
            var scale = pct / 100;
            var transform = vivaGraphics.getTransform ? vivaGraphics.getTransform() : null;
            if (transform) {
                vivaGraphics.scale(scale, { x: containerEl.clientWidth / 2, y: containerEl.clientHeight / 2 });
            }
        }
        DbRel.setZoomSlider(pct);
    }

    function fitToScreenInternal() {
        if (!vivaGraph || !vivaLayout) return;

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        vivaGraph.forEachNode(function(node) {
            var pos = vivaLayout.getNodePosition(node.id);
            var data = node.data || {};
            var w = data.w || 100;
            var h = data.h || 50;
            if (pos.x - w / 2 < minX) minX = pos.x - w / 2;
            if (pos.y - h / 2 < minY) minY = pos.y - h / 2;
            if (pos.x + w / 2 > maxX) maxX = pos.x + w / 2;
            if (pos.y + h / 2 > maxY) maxY = pos.y + h / 2;
        });

        if (minX === Infinity) return;

        var graphW = maxX - minX + 60;
        var graphH = maxY - minY + 60;
        var cw = containerEl.clientWidth || 800;
        var ch = containerEl.clientHeight || 600;
        var scale = Math.min(cw / graphW, ch / graphH, 1.5);
        scale = Math.max(scale, 0.05);

        zoomLevel = Math.round(scale * 100);

        var cx = (minX + maxX) / 2;
        var cy = (minY + maxY) / 2;

        if (vivaRenderer && vivaGraphics.graphCenterChanged) {
            vivaGraphics.graphCenterChanged(cw / 2 - cx * scale, ch / 2 - cy * scale);
        }

        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFiltersInternal(dbF, typeF) {
        if (!vivaGraph) return;
        var svgRoot = containerEl.querySelector('svg');
        if (!svgRoot) return;

        // Filter nodes
        vivaGraph.forEachNode(function(node) {
            var data = node.data || {};
            var visible = dbF[data.dbName] !== false;
            data.visible = visible;
            var nodeUI = vivaGraphics.getNodeUI(node.id);
            if (nodeUI) {
                nodeUI.setAttribute('visibility', visible ? 'visible' : 'hidden');
            }
        });

        // Filter links
        vivaGraph.forEachLink(function(link) {
            var data = link.data || {};
            var srcData = nodeDataMap[link.fromId] || {};
            var tgtData = nodeDataMap[link.toId] || {};
            var visible = srcData.visible !== false && tgtData.visible !== false && typeF[data.relType] !== false;
            var linkUI = vivaGraphics.getLinkUI(link.id);
            if (linkUI) {
                linkUI.setAttribute('visibility', visible ? 'visible' : 'hidden');
            }
        });
    }

    /* ====================================================================
     * FOCUS / UNFOCUS
     * ==================================================================== */

    function focusNodeInternal(nodeId) {
        focusedNodeId = nodeId;
        if (!vivaGraph || !vivaGraphics || !vivaLayout) return;

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(nodeId);

        vivaGraph.forEachNode(function(node) {
            var nodeUI = vivaGraphics.getNodeUI(node.id);
            if (nodeUI) {
                var dist = distances[node.id];
                var opacity = DbRel.distanceToOpacity(dist);
                nodeUI.setAttribute('opacity', String(opacity));
            }
        });

        vivaGraph.forEachLink(function(link) {
            var linkUI = vivaGraphics.getLinkUI(link.id);
            if (linkUI) {
                var sDist = distances[link.fromId] !== undefined ? distances[link.fromId] : Infinity;
                var tDist = distances[link.toId] !== undefined ? distances[link.toId] : Infinity;
                var edgeDist = Math.max(sDist, tDist);
                var edgeOpacity = DbRel.distanceToOpacity(edgeDist);
                linkUI.setAttribute('opacity', String(edgeOpacity));
                if (link.fromId === nodeId || link.toId === nodeId) linkUI.setAttribute('stroke-width', '3');
            }
        });

        // Center on the focused node
        var pos = vivaLayout.getNodePosition(nodeId);
        if (pos && vivaGraphics.graphCenterChanged) {
            var cw = containerEl.clientWidth || 800;
            var ch = containerEl.clientHeight || 600;
            var scale = (zoomLevel || 100) / 100;
            vivaGraphics.graphCenterChanged(cw / 2 - pos.x * scale, ch / 2 - pos.y * scale);
        }
    }

    function unfocusNodeInternal() {
        focusedNodeId = null;
        if (!vivaGraph || !vivaGraphics) return;

        vivaGraph.forEachNode(function(node) {
            var nodeUI = vivaGraphics.getNodeUI(node.id);
            if (nodeUI) nodeUI.setAttribute('opacity', '1');
        });

        vivaGraph.forEachLink(function(link) {
            var linkUI = vivaGraphics.getLinkUI(link.id);
            if (linkUI) {
                var data = link.data || {};
                var style = data.style || DbRel.LINK_STYLES['direct'];
                linkUI.setAttribute('opacity', '1');
                linkUI.setAttribute('stroke-width', String(style.strokeWidth));
            }
        });
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTableInternal(tableKey) {
        if (!vivaGraph || !vivaLayout) return;
        var nodeId = DbRel.displayMode === 'grouped' ? tableKey : tableKey + ':0';
        var pos = vivaLayout.getNodePosition(nodeId);
        if (pos && vivaGraphics.graphCenterChanged) {
            var cw = containerEl.clientWidth || 800;
            var ch = containerEl.clientHeight || 600;
            var scale = (zoomLevel || 100) / 100;
            vivaGraphics.graphCenterChanged(cw / 2 - pos.x * scale, ch / 2 - pos.y * scale);
        }
    }

    /* ====================================================================
     * STATS / RESIZE / DESTROY
     * ==================================================================== */

    function getStatsInternal() {
        return { nodes: nodeCount, links: linkCount };
    }

    function resizeInternal() {
        // VivaGraph auto-sizes to container; trigger a re-render
        if (vivaRenderer && vivaGraph) {
            vivaRenderer.resume();
            setTimeout(function() { if (vivaRenderer) vivaRenderer.pause(); }, 100);
        }
    }

    function destroyInternal() {
        if (vivaRenderer) {
            try { vivaRenderer.dispose(); } catch(e) { /* ignore dispose errors */ }
        }
        if (containerEl) containerEl.innerHTML = '';
        containerEl = null;
        vivaGraph = null;
        vivaLayout = null;
        vivaRenderer = null;
        vivaGraphics = null;
        nodeDataMap = {};
        linkDataMap = {};
        nodeCount = 0;
        linkCount = 0;
        focusedNodeId = null;
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('vivagraph', {
        init: function(el) { initRenderer(el); },
        render: function() {
            requestAnimationFrame(function() { render(); });
        },
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
            if (!vivaGraph || !containerEl) return;
            var activeIds = {};
            vivaGraph.forEachNode(function(node) {
                var data = node.data;
                if (data && data.tableKey === tk) activeIds[node.id] = true;
            });
            vivaGraph.forEachLink(function(link) {
                if (activeIds[link.fromId] || activeIds[link.toId]) {
                    activeIds[link.fromId] = true;
                    activeIds[link.toId] = true;
                }
            });
            var svgEls = containerEl.querySelectorAll('[data-node-id]');
            for (var i = 0; i < svgEls.length; i++) {
                var nid = svgEls[i].getAttribute('data-node-id');
                svgEls[i].style.opacity = activeIds[nid] ? '1' : '0.12';
            }
            var linkEls = containerEl.querySelectorAll('[data-link-id]');
            for (var j = 0; j < linkEls.length; j++) {
                var parts = linkEls[j].getAttribute('data-link-id').split('>');
                var active = activeIds[parts[0]] && activeIds[parts[1]];
                linkEls[j].style.opacity = active ? '1' : '0.06';
            }
        },
        clearHighlightTable: function() {
            if (!containerEl) return;
            var svgEls = containerEl.querySelectorAll('[data-node-id]');
            for (var i = 0; i < svgEls.length; i++) { svgEls[i].style.opacity = '1'; }
            var linkEls = containerEl.querySelectorAll('[data-link-id]');
            for (var j = 0; j < linkEls.length; j++) { linkEls[j].style.opacity = '1'; }
        },
        destroy: function() { destroyInternal(); }
    });

})();
