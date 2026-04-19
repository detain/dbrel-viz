/**
 * Database Relationships - Springy Renderer
 * Canvas-based spring physics graph using dhotson/springy.
 * Features: interactive spring stiffness/repulsion controls, custom canvas card rendering,
 * smooth physics-based animation with configurable damping.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var springyGraph = null, springyLayout = null, springyRenderer = null;
    var canvas = null, ctx = null, containerEl = null;
    var zoomLevel = 100, panOffset = { x: 0, y: 0 };
    var focusedNodeId = null, hoveredNodeId = null, hoveredLink = null;
    var nodeMap = {}, linkMap = {};
    var nodeCount = 0, linkCount = 0;
    var isDragging = false, dragNode = null, isPanning = false;
    var panStart = { x: 0, y: 0 }, panOffsetStart = { x: 0, y: 0 };
    var animationFrame = null;

    /* ====================================================================
     * COORDINATE TRANSFORMS
     * ==================================================================== */

    function worldToScreen(wx, wy) {
        var scale = zoomLevel / 100;
        return {
            x: wx * scale + panOffset.x,
            y: wy * scale + panOffset.y
        };
    }

    function screenToWorld(sx, sy) {
        var scale = zoomLevel / 100;
        return {
            x: (sx - panOffset.x) / scale,
            y: (sy - panOffset.y) / scale
        };
    }

    /* ====================================================================
     * CANVAS DRAWING
     * ==================================================================== */

    function drawNodeCard(nodeData, wx, wy) {
        var w = nodeData.w;
        var h = nodeData.h;
        var colors = nodeData.colors;
        var header = nodeData.header;
        var lines = nodeData.lines;
        var scale = zoomLevel / 100;

        var sp = worldToScreen(wx - w / 2, wy - h / 2);
        var sw = w * scale;
        var sh = h * scale;

        var isFocused = focusedNodeId === nodeData.nodeId;
        var isConnected = nodeData._connected;
        var isHovered = hoveredNodeId === nodeData.nodeId;

        ctx.save();
        if (focusedNodeId) ctx.globalAlpha = nodeData._focusOpacity !== undefined ? nodeData._focusOpacity : 1;

        // Body
        ctx.fillStyle = colors.bg;
        ctx.strokeStyle = isHovered || isFocused ? '#000' : colors.border;
        ctx.lineWidth = isHovered || isFocused ? 2 : 1;
        roundRect(ctx, sp.x, sp.y, sw, sh, 3 * scale);
        ctx.fill();
        ctx.stroke();

        // Header
        var hdrH = DbRel.HDR_H * scale;
        ctx.fillStyle = colors.header;
        roundRectTop(ctx, sp.x, sp.y, sw, hdrH, 3 * scale);
        ctx.fill();

        // Table icon + header text
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        var hdrTextX = sp.x + 5 * scale;
        var iconInfo = nodeData.tableName ? DbRel.getTableIconInfo(nodeData.tableName) : null;
        if (iconInfo && iconInfo.src) {
            if (!nodeData._iconImg) {
                nodeData._iconImg = new Image();
                nodeData._iconImg.src = iconInfo.src;
            }
            if (nodeData._iconImg.complete) {
                ctx.drawImage(nodeData._iconImg, sp.x + 2 * scale, sp.y + 2 * scale, 16 * scale, 16 * scale);
            }
            hdrTextX = sp.x + 20 * scale;
        }
        ctx.font = 'bold ' + Math.max(8, 10 * scale) + 'px monospace';
        ctx.fillText(header, hdrTextX, sp.y + hdrH / 2);

        // Row lines (only if zoom enough)
        if (scale > 0.3) {
            ctx.fillStyle = '#495057';
            ctx.font = Math.max(7, 9 * scale) + 'px monospace';
            ctx.textBaseline = 'top';
            for (var i = 0; i < lines.length; i++) {
                ctx.fillText(
                    lines[i],
                    sp.x + 5 * scale,
                    sp.y + (DbRel.HDR_H + DbRel.PAD + i * DbRel.ROW_H) * scale
                );
            }

            // Pivot icon for pivotable tables
            var pivotInfo = DbRel.getNodePivotInfo(nodeData.tableKey, nodeData.rowIndex);
            if (pivotInfo) {
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.font = Math.max(8, 11 * scale) + 'px sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillText('\u2316', sp.x + sw - 10 * scale, sp.y + hdrH / 2);
                ctx.textAlign = 'left';
            }
        }

        ctx.restore();
    }

    function drawLink(fromX, fromY, toX, toY, style, linkData) {
        var sp1 = worldToScreen(fromX, fromY);
        var sp2 = worldToScreen(toX, toY);
        var scale = zoomLevel / 100;

        var isHovered = hoveredLink === linkData;

        ctx.save();
        if (focusedNodeId && linkData) {
            var srcNode = nodeMap[linkData.srcId];
            var tgtNode = nodeMap[linkData.tgtId];
            var sOp = srcNode && srcNode._focusOpacity !== undefined ? srcNode._focusOpacity : 0;
            var tOp = tgtNode && tgtNode._focusOpacity !== undefined ? tgtNode._focusOpacity : 0;
            ctx.globalAlpha = Math.min(sOp, tOp);
        }

        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = (isHovered ? style.strokeWidth + 1.5 : style.strokeWidth) * scale;
        if (style.strokeDasharray && style.strokeDasharray !== '0') {
            ctx.setLineDash(style.strokeDasharray.split(',').map(function(n) { return Number(n) * scale; }));
        } else {
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(sp1.x, sp1.y);
        ctx.lineTo(sp2.x, sp2.y);
        ctx.stroke();

        // Arrowhead
        var angle = Math.atan2(sp2.y - sp1.y, sp2.x - sp1.x);
        var arrowLen = 8 * scale;
        ctx.setLineDash([]);
        ctx.fillStyle = style.stroke;
        ctx.beginPath();
        ctx.moveTo(sp2.x, sp2.y);
        ctx.lineTo(sp2.x - arrowLen * Math.cos(angle - 0.4), sp2.y - arrowLen * Math.sin(angle - 0.4));
        ctx.lineTo(sp2.x - arrowLen * Math.cos(angle + 0.4), sp2.y - arrowLen * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();

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
     * BUILD GRAPH DATA
     * ==================================================================== */

    function buildGraphData() {
        if (!DbRel.data) return;
        DbRel.resetTableColors();
        nodeMap = {};
        linkMap = {};
        nodeCount = 0;
        linkCount = 0;

        springyGraph = new Springy.Graph();

        if (DbRel.displayMode === 'grouped') {
            buildGrouped();
        } else {
            buildSeparate();
        }
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

                var nodeData = {
                    nodeId: nodeId,
                    header: header,
                    lines: lines,
                    w: size.w,
                    h: size.h,
                    colors: colors,
                    tableKey: tableKey,
                    dbName: dbName,
                    tableName: tableName,
                    rowIndex: ri,
                    visible: true,
                    _connected: false,
                    initX: pos.x + size.w / 2,
                    initY: pos.y + size.h / 2
                };

                var springNode = springyGraph.newNode({ _data: nodeData });
                nodeData.springNode = springNode;
                nodeMap[nodeId] = nodeData;
                nodeCount++;
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                if (!nodeMap[srcNodeId]) return;
                match[1].forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    if (!nodeMap[tgtNodeId]) return;
                    var linkData = {
                        style: style,
                        relType: rel.type,
                        relLabel: rel.label,
                        relData: rel,
                        srcId: srcNodeId,
                        tgtId: tgtNodeId,
                        visible: true
                    };
                    var springEdge = springyGraph.newEdge(
                        nodeMap[srcNodeId].springNode,
                        nodeMap[tgtNodeId].springNode,
                        { _data: linkData }
                    );
                    linkData.springEdge = springEdge;
                    linkMap[srcNodeId + '>' + tgtNodeId] = linkData;
                    linkCount++;
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

            var nodeData = {
                nodeId: tableKey,
                header: tableName + ' (' + tableInfo.total + ')',
                lines: lines,
                w: size.w,
                h: size.h,
                colors: colors,
                tableKey: tableKey,
                dbName: dbName,
                tableName: tableName,
                rowIndex: 0,
                visible: true,
                _connected: false,
                initX: pos.x + size.w / 2,
                initY: pos.y + size.h / 2
            };

            var springNode = springyGraph.newNode({ _data: nodeData });
            nodeData.springNode = springNode;
            nodeMap[tableKey] = nodeData;
            nodeCount++;
        });

        DbRel.data.relationships.forEach(function(rel) {
            if (!nodeMap[rel.source] || !nodeMap[rel.target]) return;
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            var linkData = {
                style: style,
                relType: rel.type,
                relLabel: rel.label,
                relData: rel,
                srcId: rel.source,
                tgtId: rel.target,
                visible: true
            };
            var springEdge = springyGraph.newEdge(
                nodeMap[rel.source].springNode,
                nodeMap[rel.target].springNode,
                { _data: linkData }
            );
            linkData.springEdge = springEdge;
            linkMap[rel.source + '>' + rel.target] = linkData;
            linkCount++;
        });
    }

    /* ====================================================================
     * CONNECTED NODE TRACKING
     * ==================================================================== */

    function updateConnectedFlags(focusId) {
        Object.values(nodeMap).forEach(function(n) { n._connected = false; n._focusOpacity = 1; });
        if (!focusId || !nodeMap[focusId]) return;
        var distances = DbRel.computeNodeDistances(focusId);
        Object.values(nodeMap).forEach(function(n) {
            var dist = distances[n.nodeId];
            n._focusOpacity = DbRel.distanceToOpacity(dist);
            n._connected = dist !== undefined && dist <= 1;
        });
    }

    /* ====================================================================
     * HIT TESTING
     * ==================================================================== */

    function hitTestNode(sx, sy) {
        if (!springyLayout) return null;
        var wp = screenToWorld(sx, sy);
        var ids = Object.keys(nodeMap);
        for (var i = ids.length - 1; i >= 0; i--) {
            var nd = nodeMap[ids[i]];
            if (!nd.visible || !nd.springNode) continue;
            var point = springyLayout.point(nd.springNode);
            if (!point) continue;
            var pos = point.p;
            var nx = pos.x * 50;
            var ny = pos.y * 50;
            if (wp.x >= nx - nd.w / 2 && wp.x <= nx + nd.w / 2 &&
                wp.y >= ny - nd.h / 2 && wp.y <= ny + nd.h / 2) {
                return nd;
            }
        }
        return null;
    }

    function hitTestLink(sx, sy) {
        if (!springyLayout) return null;
        var wp = screenToWorld(sx, sy);
        var threshold = 6 / (zoomLevel / 100);
        var ids = Object.keys(linkMap);
        for (var i = 0; i < ids.length; i++) {
            var ld = linkMap[ids[i]];
            if (!ld.visible) continue;
            var srcNode = nodeMap[ld.srcId];
            var tgtNode = nodeMap[ld.tgtId];
            if (!srcNode || !tgtNode || !srcNode.springNode || !tgtNode.springNode) continue;
            var spPoint = springyLayout.point(srcNode.springNode);
            var tpPoint = springyLayout.point(tgtNode.springNode);
            if (!spPoint || !tpPoint) continue;
            var sp = spPoint.p;
            var tp = tpPoint.p;
            var x1 = sp.x * 50, y1 = sp.y * 50, x2 = tp.x * 50, y2 = tp.y * 50;
            var dist = distPointToSegment(wp.x, wp.y, x1, y1, x2, y2);
            if (dist < threshold) return ld;
        }
        return null;
    }

    function distPointToSegment(px, py, x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1;
        var lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
        var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        var projX = x1 + t * dx, projY = y1 + t * dy;
        return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    }

    /* ====================================================================
     * INIT CANVAS & INTERACTIONS
     * ==================================================================== */

    function initCanvas(el) {
        containerEl = el;
        el.innerHTML = '';

        canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        el.appendChild(canvas);

        resizeCanvas();
        ctx = canvas.getContext('2d');
        zoomLevel = 100;
        panOffset = { x: canvas.width / 2, y: canvas.height / 2 };

        // Mouse interactions
        var lastClickTime = 0;
        canvas.addEventListener('mousedown', function(e) {
            var rect = canvas.getBoundingClientRect();
            var sx = e.clientX - rect.left;
            var sy = e.clientY - rect.top;

            var hitNode = hitTestNode(sx, sy);
            if (hitNode) {
                // Check if click is in pivot icon area (top-right 20x20 of header)
                if (springyLayout && hitNode.springNode) {
                    var wp = screenToWorld(sx, sy);
                    var point = springyLayout.point(hitNode.springNode);
                    if (point) {
                        var nodeX = point.p.x * 50 - hitNode.w / 2;
                        var nodeY = point.p.y * 50 - hitNode.h / 2;
                        var relX = wp.x - nodeX;
                        var relY = wp.y - nodeY;
                        if (relX > hitNode.w - 20 && relY < DbRel.HDR_H) {
                            var pivotInfo = DbRel.getNodePivotInfo(hitNode.tableKey, hitNode.rowIndex);
                            if (pivotInfo) {
                                DbRel.pivotTo(hitNode.tableKey, hitNode.rowIndex);
                                return;
                            }
                        }
                    }
                }

                dragNode = hitNode;
                isDragging = true;
                canvas.style.cursor = 'grabbing';
                return;
            }

            isPanning = true;
            panStart = { x: e.clientX, y: e.clientY };
            panOffsetStart = { x: panOffset.x, y: panOffset.y };
            canvas.style.cursor = 'grabbing';
        });

        canvas.addEventListener('mousemove', function(e) {
            var rect = canvas.getBoundingClientRect();
            var sx = e.clientX - rect.left;
            var sy = e.clientY - rect.top;

            if (isDragging && dragNode && springyLayout && dragNode.springNode) {
                var wp = screenToWorld(sx, sy);
                var point = springyLayout.point(dragNode.springNode);
                if (point) {
                    point.p.x = wp.x / 50;
                    point.p.y = wp.y / 50;
                }
                return;
            }

            if (isPanning) {
                panOffset.x = panOffsetStart.x + (e.clientX - panStart.x);
                panOffset.y = panOffsetStart.y + (e.clientY - panStart.y);
                return;
            }

            // Hover detection
            var hitNode = hitTestNode(sx, sy);
            hoveredNodeId = hitNode ? hitNode.nodeId : null;
            canvas.style.cursor = hitNode ? 'pointer' : 'default';

            if (!hitNode) {
                var hitL = hitTestLink(sx, sy);
                hoveredLink = hitL;
                if (hitL && hitL.relData) {
                    DbRel.showTooltip(DbRel.getLinkTooltipHtml(hitL.relData), e.clientX, e.clientY);
                } else {
                    DbRel.hideTooltip();
                }
            } else {
                hoveredLink = null;
                DbRel.hideTooltip();
            }
        });

        canvas.addEventListener('mouseup', function() {
            isDragging = false;
            dragNode = null;
            isPanning = false;
            canvas.style.cursor = 'default';
        });

        canvas.addEventListener('click', function(e) {
            var rect = canvas.getBoundingClientRect();
            var sx = e.clientX - rect.left;
            var sy = e.clientY - rect.top;
            var now = Date.now();

            var hitNode = hitTestNode(sx, sy);
            if (hitNode) {
                // Double-click detection
                if (now - lastClickTime < 350 && hitNode.tableKey !== undefined) {
                    DbRel.showRowModal(hitNode.tableKey, hitNode.rowIndex);
                    lastClickTime = 0;
                    return;
                }
                lastClickTime = now;

                if (focusedNodeId === hitNode.nodeId) {
                    unfocusNodeInternal();
                } else {
                    focusNodeInternal(hitNode.nodeId);
                }
                return;
            }

            lastClickTime = now;
            if (focusedNodeId) unfocusNodeInternal();
        });

        canvas.addEventListener('wheel', function(e) {
            e.preventDefault();
            var delta = e.deltaY > 0 ? -5 : 5;
            setZoomInternal(Math.max(5, Math.min(300, zoomLevel + delta)));
        });
    }

    function resizeCanvas() {
        if (!canvas || !containerEl) return;
        var wrap = containerEl.parentElement || containerEl;
        canvas.width = wrap.clientWidth || 800;
        canvas.height = Math.max(wrap.clientHeight || 500, 500);
    }

    /* ====================================================================
     * ANIMATION LOOP
     * ==================================================================== */

    function startRenderLoop() {
        if (animationFrame) cancelAnimationFrame(animationFrame);

        function frame() {
            drawFrame();
            animationFrame = requestAnimationFrame(frame);
        }
        animationFrame = requestAnimationFrame(frame);
    }

    function stopRenderLoop() {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
    }

    function drawFrame() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!springyLayout || !springyGraph) return;

        // Draw links
        Object.values(linkMap).forEach(function(ld) {
            if (!ld.visible) return;
            var srcNode = nodeMap[ld.srcId];
            var tgtNode = nodeMap[ld.tgtId];
            if (!srcNode || !tgtNode || !srcNode.visible || !tgtNode.visible) return;
            if (!srcNode.springNode || !tgtNode.springNode) return;
            var sp = springyLayout.point(srcNode.springNode);
            var tp = springyLayout.point(tgtNode.springNode);
            if (!sp || !tp) return;
            drawLink(sp.p.x * 50, sp.p.y * 50, tp.p.x * 50, tp.p.y * 50, ld.style, ld);
        });

        // Draw nodes
        Object.values(nodeMap).forEach(function(nd) {
            if (!nd.visible) return;
            if (!nd.springNode) return;
            var point = springyLayout.point(nd.springNode);
            if (!point) return;
            drawNodeCard(nd, point.p.x * 50, point.p.y * 50);
        });
    }

    /* ====================================================================
     * RENDER
     * ==================================================================== */

    function render() {
        if (!DbRel.data) return;
        stopRenderLoop();

        buildGraphData();

        // Create layout with spring physics
        springyLayout = new Springy.Layout.ForceDirected(
            springyGraph,
            300,   // stiffness
            600,   // repulsion
            0.5    // damping
        );

        // Set initial positions from computed layout
        Object.values(nodeMap).forEach(function(nd) {
            if (!nd.springNode) return;
            var point = springyLayout.point(nd.springNode);
            if (!point) return;
            point.p.x = nd.initX / 50;
            point.p.y = nd.initY / 50;
        });

        // Run layout simulation via Springy.Renderer
        springyRenderer = new Springy.Renderer(
            springyLayout,
            function() { /* clear - handled in drawFrame */ },
            function() { /* drawEdge - handled in drawFrame */ },
            function() { /* drawNode - handled in drawFrame */ }
        );

        springyRenderer.start();

        // Start our own canvas render loop
        startRenderLoop();

        // Auto-fit after stabilization
        setTimeout(function() {
            fitToScreenInternal();
            DbRel.updateSidebar();
        }, 1500);
    }

    /* ====================================================================
     * LAYOUT
     * ==================================================================== */

    function doLayoutInternal() {
        if (!springyLayout) return;
        var wrap = containerEl.parentElement || containerEl;
        var cw = wrap.clientWidth || 1200;
        var ch = wrap.clientHeight || 700;
        var positions = DbRel.computeLayout(cw, ch);

        Object.values(nodeMap).forEach(function(nd) {
            var pos = positions[nd.nodeId];
            if (pos && nd.springNode) {
                var point = springyLayout.point(nd.springNode);
                if (point) {
                    point.p.x = (pos.x + pos.w / 2) / 50;
                    point.p.y = (pos.y + pos.h / 2) / 50;
                    point.v.x = 0;
                    point.v.y = 0;
                }
            }
        });

        setTimeout(fitToScreenInternal, 500);
    }

    /* ====================================================================
     * ZOOM / FIT
     * ==================================================================== */

    function setZoomInternal(pct) {
        // Zoom towards center of canvas
        var centerX = canvas.width / 2;
        var centerY = canvas.height / 2;
        var oldScale = zoomLevel / 100;
        var newScale = pct / 100;

        panOffset.x = centerX - (centerX - panOffset.x) * (newScale / oldScale);
        panOffset.y = centerY - (centerY - panOffset.y) * (newScale / oldScale);

        zoomLevel = pct;
        DbRel.setZoomSlider(pct);
    }

    function fitToScreenInternal() {
        if (!springyLayout || !canvas) return;

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var hasNodes = false;

        Object.values(nodeMap).forEach(function(nd) {
            if (!nd.visible || !nd.springNode) return;
            var point = springyLayout.point(nd.springNode);
            if (!point) return;
            var pos = point.p;
            var wx = pos.x * 50;
            var wy = pos.y * 50;
            if (wx - nd.w / 2 < minX) minX = wx - nd.w / 2;
            if (wy - nd.h / 2 < minY) minY = wy - nd.h / 2;
            if (wx + nd.w / 2 > maxX) maxX = wx + nd.w / 2;
            if (wy + nd.h / 2 > maxY) maxY = wy + nd.h / 2;
            hasNodes = true;
        });

        if (!hasNodes) return;

        var graphW = maxX - minX + 60;
        var graphH = maxY - minY + 60;
        var scale = Math.min(canvas.width / graphW, canvas.height / graphH, 1.5);
        scale = Math.max(scale, 0.05);

        zoomLevel = Math.round(scale * 100);

        var cx = (minX + maxX) / 2;
        var cy = (minY + maxY) / 2;
        panOffset.x = canvas.width / 2 - cx * scale;
        panOffset.y = canvas.height / 2 - cy * scale;

        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFiltersInternal(dbF, typeF) {
        Object.values(nodeMap).forEach(function(nd) {
            nd.visible = dbF[nd.dbName] !== false;
        });
        Object.values(linkMap).forEach(function(ld) {
            var srcVisible = nodeMap[ld.srcId] && nodeMap[ld.srcId].visible;
            var tgtVisible = nodeMap[ld.tgtId] && nodeMap[ld.tgtId].visible;
            ld.visible = srcVisible && tgtVisible && typeF[ld.relType] !== false;
        });
    }

    /* ====================================================================
     * FOCUS / UNFOCUS
     * ==================================================================== */

    function focusNodeInternal(nodeId) {
        focusedNodeId = nodeId;
        updateConnectedFlags(nodeId);

        // Center on node
        var nd = nodeMap[nodeId];
        if (nd && nd.springNode && springyLayout && canvas) {
            var point = springyLayout.point(nd.springNode);
            if (!point) return;
            var pos = point.p;
            var scale = zoomLevel / 100;
            panOffset.x = canvas.width / 2 - pos.x * 50 * scale;
            panOffset.y = canvas.height / 2 - pos.y * 50 * scale;
        }
    }

    function unfocusNodeInternal() {
        focusedNodeId = null;
        updateConnectedFlags(null);
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTableInternal(tableKey) {
        var nodeId = DbRel.displayMode === 'grouped' ? tableKey : tableKey + ':0';
        var nd = nodeMap[nodeId];
        if (nd && nd.springNode && springyLayout && canvas) {
            var point = springyLayout.point(nd.springNode);
            if (!point) return;
            var pos = point.p;
            var scale = zoomLevel / 100;
            panOffset.x = canvas.width / 2 - pos.x * 50 * scale;
            panOffset.y = canvas.height / 2 - pos.y * 50 * scale;
        }
    }

    /* ====================================================================
     * STATS / RESIZE / DESTROY
     * ==================================================================== */

    function getStatsInternal() {
        return { nodes: nodeCount, links: linkCount };
    }

    function resizeInternal() {
        resizeCanvas();
        if (ctx) {
            ctx = canvas.getContext('2d');
        }
    }

    function destroyInternal() {
        stopRenderLoop();
        if (springyRenderer) {
            springyRenderer.stop();
        }
        if (containerEl) containerEl.innerHTML = '';
        containerEl = null;
        canvas = null;
        ctx = null;
        springyGraph = null;
        springyLayout = null;
        springyRenderer = null;
        nodeMap = {};
        linkMap = {};
        nodeCount = 0;
        linkCount = 0;
        focusedNodeId = null;
        hoveredNodeId = null;
        hoveredLink = null;
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('springy', {
        init: function(el) { initCanvas(el); },
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
            var activeSet = {};
            Object.keys(nodeMap).forEach(function(id) {
                if (nodeMap[id].tableKey === tk) activeSet[id] = true;
            });
            Object.values(linkMap).forEach(function(l) {
                if (activeSet[l.srcId] || activeSet[l.tgtId]) {
                    activeSet[l.srcId] = true;
                    activeSet[l.tgtId] = true;
                }
            });
            Object.keys(nodeMap).forEach(function(id) { nodeMap[id]._connected = !!activeSet[id]; });
            focusedNodeId = '__table_highlight__';
        },
        clearHighlightTable: function() {
            if (focusedNodeId === '__table_highlight__') {
                focusedNodeId = null;
                Object.keys(nodeMap).forEach(function(id) { nodeMap[id]._connected = false; });
            }
        },
        destroy: function() { destroyInternal(); }
    });

})();
