/**
 * Database Relationships - Sigma.js v2 + Graphology Renderer
 * Uses graphology for graph data structure, a canvas overlay for edges,
 * and HTML card overlays for rich node content. Sigma camera math
 * concepts replicated for zoom/pan while HTML cards provide table detail.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    /* ====================================================================
     * STATE
     * ==================================================================== */

    var graph = null;           // graphology instance
    var containerEl = null;
    var wrapperEl = null;       // internal wrapper div
    var cardOverlay = null;     // HTML overlay for node cards
    var edgeCanvas = null;      // canvas for edge rendering
    var edgeCtx = null;
    var cameraState = { x: 0, y: 0, ratio: 1 };
    var nodePositions = {};     // { nodeId: { x, y } } in graph coords
    var nodeSizes = {};         // { nodeId: { w, h } } in pixels at zoom=1
    var edgeDataMap = {};       // { edgeId: { source, target, relType, relData, style } }
    var focusedNodeId = null;
    var hoveredNode = null;
    var hoveredEdge = null;
    var dragState = null;
    var panState = null;
    var lastClickTime = 0;
    var lastClickNode = null;
    var renderRAF = null;
    var zoomLevel = 100;
    var sigmaDocMoveHandler = null;
    var sigmaDocUpHandler = null;

    /* ====================================================================
     * LINK STYLES (canvas rendering)
     * ==================================================================== */

    var LINK_STYLES = {
        'direct':      { stroke: '#495057', dash: [],           width: 1.2 },
        'find_in_set': { stroke: '#6f42c1', dash: [8, 4],       width: 1.5 },
        'cross_db':    { stroke: '#fd7e14', dash: [4, 4, 1, 4], width: 1.5 }
    };

    /* ====================================================================
     * COORDINATE TRANSFORMS
     * ==================================================================== */

    function getViewSize() {
        if (!wrapperEl) return { w: 800, h: 600 };
        var r = wrapperEl.getBoundingClientRect();
        return { w: r.width || 800, h: r.height || 600 };
    }

    function getCurrentScale() {
        return 1 / cameraState.ratio;
    }

    function graphToScreen(gx, gy) {
        var vs = getViewSize();
        var scale = getCurrentScale();
        return {
            x: (gx - cameraState.x) * scale + vs.w / 2,
            y: (gy - cameraState.y) * scale + vs.h / 2
        };
    }

    function screenToGraph(sx, sy) {
        var vs = getViewSize();
        var scale = getCurrentScale();
        return {
            x: (sx - vs.w / 2) / scale + cameraState.x,
            y: (sy - vs.h / 2) / scale + cameraState.y
        };
    }

    /* ====================================================================
     * RENDER SCHEDULING
     * ==================================================================== */

    function requestRender() {
        if (renderRAF) return;
        renderRAF = requestAnimationFrame(function() {
            renderRAF = null;
            renderAll();
        });
    }

    function renderAll() {
        renderEdges();
        renderCards();
    }

    /* ====================================================================
     * BUILD GRAPH
     * ==================================================================== */

    function buildGraph() {
        if (!DbRel.data) return;

        nodePositions = {};
        nodeSizes = {};
        edgeDataMap = {};
        focusedNodeId = null;
        hoveredNode = null;
        hoveredEdge = null;

        graph = new graphology.Graph({ multi: true, type: 'directed' });

        if (DbRel.displayMode === 'grouped') {
            buildGrouped();
        } else {
            buildSeparate();
        }

        doLayoutInternal();
        resetCamera();
        requestRender();
    }

    /* ====================================================================
     * SEPARATE MODE
     * ==================================================================== */

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

                graph.addNode(nodeId, {
                    tableKey: tableKey,
                    dbName: dbName,
                    tableName: tableName,
                    rowIndex: ri,
                    headerLabel: header,
                    lines: lines,
                    colors: colors,
                    x: 0, y: 0, size: 10
                });

                nodeSizes[nodeId] = { w: size.w, h: size.h };
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = LINK_STYLES[rel.type] || LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                if (!graph.hasNode(srcNodeId)) return;
                var tgtIdxs = match[1];
                if (!Array.isArray(tgtIdxs)) tgtIdxs = [tgtIdxs];

                tgtIdxs.forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    if (!graph.hasNode(tgtNodeId)) return;
                    var edgeId = srcNodeId + '>' + tgtNodeId + ':' + rel.source_field;
                    try {
                        graph.addEdgeWithKey(edgeId, srcNodeId, tgtNodeId, {
                            relType: rel.type,
                            relLabel: rel.label,
                            relData: rel,
                            style: style
                        });
                        edgeDataMap[edgeId] = {
                            source: srcNodeId, target: tgtNodeId,
                            relType: rel.type, relData: rel, style: style
                        };
                    } catch (e) { /* duplicate edge */ }
                });
            });
        });
    }

    /* ====================================================================
     * GROUPED MODE
     * ==================================================================== */

    function buildGrouped() {
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);
            var headerLabel = tableName + ' (' + tableInfo.total + ')';

            graph.addNode(tableKey, {
                tableKey: tableKey,
                dbName: dbName,
                tableName: tableName,
                rowIndex: 0,
                headerLabel: headerLabel,
                lines: lines,
                colors: colors,
                x: 0, y: 0, size: 10
            });

            nodeSizes[tableKey] = { w: size.w, h: size.h };
        });

        DbRel.data.relationships.forEach(function(rel) {
            if (!graph.hasNode(rel.source) || !graph.hasNode(rel.target)) return;
            var style = LINK_STYLES[rel.type] || LINK_STYLES['direct'];
            var edgeId = rel.source + '>' + rel.target + ':' + rel.source_field;
            try {
                graph.addEdgeWithKey(edgeId, rel.source, rel.target, {
                    relType: rel.type,
                    relLabel: rel.label,
                    relData: rel,
                    style: style
                });
                edgeDataMap[edgeId] = {
                    source: rel.source, target: rel.target,
                    relType: rel.type, relData: rel, style: style
                };
            } catch (e) { /* dup */ }
        });
    }

    /* ====================================================================
     * LAYOUT (via shared DbRel.computeLayout)
     * ==================================================================== */

    function doLayoutInternal() {
        if (!graph || graph.order === 0) return;

        var vs = getViewSize();
        var positions = DbRel.computeLayout(vs.w, vs.h);

        graph.forEachNode(function(nodeId) {
            var pos = positions[nodeId];
            if (pos) {
                nodePositions[nodeId] = { x: pos.x, y: pos.y };
                graph.setNodeAttribute(nodeId, 'x', pos.x);
                graph.setNodeAttribute(nodeId, 'y', pos.y);
            }
        });
    }

    /* ====================================================================
     * CAMERA
     * ==================================================================== */

    function resetCamera() {
        cameraState = { x: 0, y: 0, ratio: 1 };
        fitToScreenInternal();
    }

    function fitToScreenInternal() {
        if (!graph || graph.order === 0) return;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        graph.forEachNode(function(nodeId) {
            var pos = nodePositions[nodeId];
            var sz = nodeSizes[nodeId] || { w: 150, h: 50 };
            if (!pos) return;
            if (pos.x < minX) minX = pos.x;
            if (pos.y < minY) minY = pos.y;
            if (pos.x + sz.w > maxX) maxX = pos.x + sz.w;
            if (pos.y + sz.h > maxY) maxY = pos.y + sz.h;
        });
        if (minX === Infinity) return;

        var vs = getViewSize();
        var padding = 40;
        var contentW = maxX - minX + padding * 2;
        var contentH = maxY - minY + padding * 2;
        var scaleX = vs.w / contentW;
        var scaleY = vs.h / contentH;
        var scale = Math.min(scaleX, scaleY, 2);
        scale = Math.max(scale, 0.02);

        cameraState.ratio = 1 / scale;
        cameraState.x = (minX + maxX) / 2;
        cameraState.y = (minY + maxY) / 2;
        zoomLevel = Math.round(scale * 100);
        DbRel.setZoomSlider(zoomLevel);
        requestRender();
    }

    /* ====================================================================
     * GET CONNECTED SETS
     * ==================================================================== */

    function getConnectedSets(targetNodeId) {
        var connNodes = {}, connEdges = {};
        connNodes[targetNodeId] = true;
        graph.forEachEdge(function(edgeId, attrs, source, target) {
            if (source === targetNodeId || target === targetNodeId) {
                connNodes[source] = true;
                connNodes[target] = true;
                connEdges[edgeId] = true;
            }
        });
        return { nodes: connNodes, edges: connEdges };
    }

    /* ====================================================================
     * RENDER EDGES (canvas)
     * ==================================================================== */

    function renderEdges() {
        if (!edgeCanvas || !edgeCtx) return;
        var vs = getViewSize();
        var dpr = window.devicePixelRatio || 1;

        edgeCanvas.width = vs.w * dpr;
        edgeCanvas.height = vs.h * dpr;
        edgeCanvas.style.width = vs.w + 'px';
        edgeCanvas.style.height = vs.h + 'px';
        edgeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        edgeCtx.clearRect(0, 0, vs.w, vs.h);

        if (!graph || graph.size === 0) return;

        var scale = getCurrentScale();
        var dbF = DbRel.getDbFilters();
        var typeF = DbRel.getTypeFilters();
        var focusDistances = focusedNodeId ? DbRel.computeNodeDistances(focusedNodeId) : null;
        var hoverConn = (hoveredNode && !focusedNodeId) ? getConnectedSets(hoveredNode) : null;

        graph.forEachEdge(function(edgeId, attrs, source, target) {
            var rd = attrs.relData;
            if (!rd) return;
            var sDb = rd.source.split('.')[0];
            var tDb = rd.target.split('.')[0];
            if (dbF[sDb] === false || dbF[tDb] === false) return;
            if (typeF[attrs.relType] === false) return;

            var sPos = nodePositions[source];
            var tPos = nodePositions[target];
            if (!sPos || !tPos) return;
            var sSz = nodeSizes[source] || { w: 150, h: 50 };
            var tSz = nodeSizes[target] || { w: 150, h: 50 };

            var sCenterX = sPos.x + sSz.w / 2;
            var tCenterX = tPos.x + tSz.w / 2;
            var sCenterY = sPos.y + sSz.h / 2;
            var tCenterY = tPos.y + tSz.h / 2;

            var exitX = sCenterX < tCenterX ? sPos.x + sSz.w : sPos.x;
            var enterX = sCenterX < tCenterX ? tPos.x : tPos.x + tSz.w;

            var s1 = graphToScreen(exitX, sCenterY);
            var s2 = graphToScreen(enterX, tCenterY);
            var style = attrs.style || LINK_STYLES['direct'];

            // Alpha for focus/hover - distance-based graduated opacity
            var alpha = 1;
            if (focusDistances) {
                var sDist = focusDistances[source] !== undefined ? focusDistances[source] : Infinity;
                var tDist = focusDistances[target] !== undefined ? focusDistances[target] : Infinity;
                var edgeDist = Math.max(sDist, tDist);
                alpha = DbRel.distanceToOpacity(edgeDist);
            } else if (hoverConn) {
                alpha = (source === hoveredNode || target === hoveredNode) ? 1 : 0.3;
            }

            edgeCtx.save();
            edgeCtx.globalAlpha = alpha;
            edgeCtx.strokeStyle = style.stroke;
            edgeCtx.lineWidth = style.width * Math.min(scale, 1.5);
            if (style.dash && style.dash.length) {
                edgeCtx.setLineDash(style.dash);
            }

            // Orthogonal 3-segment path
            var midX = (s1.x + s2.x) / 2;
            edgeCtx.beginPath();
            edgeCtx.moveTo(s1.x, s1.y);
            edgeCtx.lineTo(midX, s1.y);
            edgeCtx.lineTo(midX, s2.y);
            edgeCtx.lineTo(s2.x, s2.y);
            edgeCtx.stroke();

            // Arrow
            var arrowSize = 6 * Math.min(scale, 1.5);
            var arrowDir = sCenterX < tCenterX ? -1 : 1;
            edgeCtx.setLineDash([]);
            edgeCtx.beginPath();
            edgeCtx.moveTo(s2.x, s2.y);
            edgeCtx.lineTo(s2.x + arrowSize * arrowDir, s2.y - arrowSize * 0.6);
            edgeCtx.moveTo(s2.x, s2.y);
            edgeCtx.lineTo(s2.x + arrowSize * arrowDir, s2.y + arrowSize * 0.6);
            edgeCtx.stroke();

            // Label at midpoint
            if (scale > 0.3) {
                var labelText = attrs.relLabel || (rd ? rd.source_field + '\u2192' + rd.target_field : '');
                if (labelText) {
                    var labelX = midX;
                    var labelY = (s1.y + s2.y) / 2;
                    var fontSize = Math.max(8, Math.min(11, 10 * scale));
                    edgeCtx.font = fontSize + 'px sans-serif';
                    var tm = edgeCtx.measureText(labelText);
                    edgeCtx.fillStyle = '#ffffff';
                    edgeCtx.fillRect(labelX - tm.width / 2 - 3, labelY - fontSize / 2 - 2, tm.width + 6, fontSize + 4);
                    edgeCtx.fillStyle = style.stroke;
                    edgeCtx.globalAlpha = Math.max(alpha, 0.4);
                    edgeCtx.textAlign = 'center';
                    edgeCtx.textBaseline = 'middle';
                    edgeCtx.fillText(labelText, labelX, labelY);
                }
            }

            edgeCtx.restore();
        });
    }

    /* ====================================================================
     * RENDER CARDS (HTML overlay)
     * ==================================================================== */

    function renderCards() {
        if (!graph || !cardOverlay) return;
        var scale = getCurrentScale();
        var vs = getViewSize();
        var dbF = DbRel.getDbFilters();
        var focusDistances = focusedNodeId ? DbRel.computeNodeDistances(focusedNodeId) : null;
        var hoverConn = (hoveredNode && !focusedNodeId) ? getConnectedSets(hoveredNode) : null;

        // Index existing cards
        var existingCards = {};
        var cardEls = cardOverlay.querySelectorAll('.dbrel-sigma-card');
        for (var i = 0; i < cardEls.length; i++) {
            existingCards[cardEls[i].dataset.nodeId] = cardEls[i];
        }

        var renderedIds = {};
        graph.forEachNode(function(nodeId, attrs) {
            renderedIds[nodeId] = true;
            var pos = nodePositions[nodeId];
            if (!pos) return;
            var sz = nodeSizes[nodeId] || { w: 150, h: 50 };

            // DB filter
            if (dbF[attrs.dbName] === false) {
                if (existingCards[nodeId]) existingCards[nodeId].style.display = 'none';
                return;
            }

            var screenPos = graphToScreen(pos.x, pos.y);
            var cardW = sz.w * scale;
            var cardH = sz.h * scale;

            // Culling offscreen
            if (screenPos.x + cardW < -50 || screenPos.x > vs.w + 50 ||
                screenPos.y + cardH < -50 || screenPos.y > vs.h + 50) {
                if (existingCards[nodeId]) existingCards[nodeId].style.display = 'none';
                return;
            }
            if (cardH < 4) {
                if (existingCards[nodeId]) existingCards[nodeId].style.display = 'none';
                return;
            }

            var card = existingCards[nodeId];
            if (!card) {
                card = createCardElement(nodeId, attrs);
                cardOverlay.appendChild(card);
            }

            card.style.display = '';
            card.style.left = screenPos.x + 'px';
            card.style.top = screenPos.y + 'px';
            card.style.transform = 'scale(' + scale + ')';

            // Focus / hover dimming - distance-based graduated opacity
            if (focusDistances) {
                var dist = focusDistances[nodeId];
                card.style.opacity = String(DbRel.distanceToOpacity(dist));
            } else if (hoverConn) {
                card.style.opacity = hoverConn.nodes[nodeId] ? '1' : '0.6';
            } else {
                card.style.opacity = '1';
            }
        });

        // Remove stale cards
        Object.keys(existingCards).forEach(function(nid) {
            if (!renderedIds[nid]) existingCards[nid].remove();
        });
    }

    function createCardElement(nodeId, attrs) {
        var card = document.createElement('div');
        card.className = 'dbrel-sigma-card';
        card.dataset.nodeId = nodeId;
        card.style.cssText = 'position:absolute;transform-origin:top left;pointer-events:auto;cursor:grab;' +
            'font-family:monospace;font-size:10px;border-radius:3px;overflow:hidden;border:1px solid ' + attrs.colors.border + ';' +
            'background:' + attrs.colors.bg + ';';

        var header = document.createElement('div');
        header.style.cssText = 'background:' + attrs.colors.header + ';color:#fff;padding:2px 6px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative;';
        var iconHtml = DbRel.getTableIconHtml(attrs.tableName);
        if (iconHtml) {
            header.innerHTML = iconHtml + '<span>' + (attrs.headerLabel || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>';
        } else {
            header.textContent = attrs.headerLabel;
        }

        // Pivot icon for pivotable tables
        var pivotInfo = DbRel.getNodePivotInfo(attrs.tableKey, attrs.rowIndex);
        if (pivotInfo) {
            var pivotBtn = document.createElement('span');
            pivotBtn.textContent = '\u2316';
            pivotBtn.style.cssText = 'position:absolute;right:4px;top:1px;cursor:pointer;opacity:0.7;font-family:sans-serif;font-size:11px;';
            pivotBtn.addEventListener('mouseenter', function() { pivotBtn.style.opacity = '1'; });
            pivotBtn.addEventListener('mouseleave', function() { pivotBtn.style.opacity = '0.7'; });
            (function(tk, ri) {
                pivotBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    DbRel.pivotTo(tk, ri);
                });
            })(attrs.tableKey, attrs.rowIndex);
            header.appendChild(pivotBtn);
        }

        card.appendChild(header);

        var body = document.createElement('div');
        body.style.cssText = 'padding:2px 6px;color:#495057;';
        var lines = attrs.lines || [];
        lines.forEach(function(line) {
            var row = document.createElement('div');
            row.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:' + DbRel.ROW_H + 'px;';
            row.textContent = line;
            body.appendChild(row);
        });
        card.appendChild(body);

        var sz = nodeSizes[nodeId] || { w: 150 };
        card.style.width = sz.w + 'px';

        return card;
    }

    /* ====================================================================
     * INTERACTIONS
     * ==================================================================== */

    function setupInteractions() {
        // Mouse down: drag card or pan
        wrapperEl.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            var cardEl = e.target.closest('.dbrel-sigma-card');

            if (cardEl) {
                var nodeId = cardEl.dataset.nodeId;
                var pos = nodePositions[nodeId];
                if (pos) {
                    dragState = {
                        nodeId: nodeId,
                        startGraphX: pos.x,
                        startGraphY: pos.y,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        moved: false
                    };
                    cardEl.style.cursor = 'grabbing';
                    e.preventDefault();
                }
            } else {
                panState = {
                    startX: e.clientX,
                    startY: e.clientY,
                    startCamX: cameraState.x,
                    startCamY: cameraState.y,
                    moved: false
                };
                wrapperEl.style.cursor = 'grabbing';
            }
        });

        // Mouse move (named for cleanup in destroy)
        sigmaDocMoveHandler = function(e) {
            if (!graph) return;
            if (dragState) {
                var scale = getCurrentScale();
                var dx = (e.clientX - dragState.startMouseX) / scale;
                var dy = (e.clientY - dragState.startMouseY) / scale;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragState.moved = true;
                nodePositions[dragState.nodeId] = {
                    x: dragState.startGraphX + dx,
                    y: dragState.startGraphY + dy
                };
                graph.setNodeAttribute(dragState.nodeId, 'x', dragState.startGraphX + dx);
                graph.setNodeAttribute(dragState.nodeId, 'y', dragState.startGraphY + dy);
                requestRender();
            } else if (panState) {
                var scale2 = getCurrentScale();
                var pdx = (e.clientX - panState.startX) / scale2;
                var pdy = (e.clientY - panState.startY) / scale2;
                if (Math.abs(pdx) > 2 || Math.abs(pdy) > 2) panState.moved = true;
                cameraState.x = panState.startCamX - pdx;
                cameraState.y = panState.startCamY - pdy;
                requestRender();
            } else {
                // Hover detection on cards
                var cardEl = e.target.closest('.dbrel-sigma-card');
                if (cardEl) {
                    var nodeId = cardEl.dataset.nodeId;
                    if (hoveredNode !== nodeId) {
                        hoveredNode = nodeId;
                        hoveredEdge = null;
                        DbRel.hideTooltip();
                        requestRender();
                    }
                } else {
                    if (hoveredNode) {
                        hoveredNode = null;
                        DbRel.hideTooltip();
                        requestRender();
                    }
                    // Hover detection on edges
                    var edgeHit = hitTestEdge(e);
                    if (edgeHit !== hoveredEdge) {
                        hoveredEdge = edgeHit;
                        if (edgeHit && edgeDataMap[edgeHit]) {
                            var rd = edgeDataMap[edgeHit].relData;
                            if (rd) {
                                DbRel.showTooltip(DbRel.getLinkTooltipHtml(rd), e.clientX, e.clientY);
                            }
                        } else {
                            DbRel.hideTooltip();
                        }
                    }
                }
            }
        };
        document.addEventListener('mousemove', sigmaDocMoveHandler);

        // Mouse up (named for cleanup in destroy)
        sigmaDocUpHandler = function(e) {
            if (dragState) {
                var cardEl = cardOverlay.querySelector('[data-node-id="' + CSS.escape(dragState.nodeId) + '"]');
                if (cardEl) cardEl.style.cursor = 'grab';
                if (!dragState.moved) {
                    handleNodeClick(dragState.nodeId);
                }
                dragState = null;
            }
            if (panState) {
                if (!panState.moved && focusedNodeId) {
                    unfocusNodeInternal();
                }
                panState = null;
                if (wrapperEl) wrapperEl.style.cursor = 'default';
            }
        };
        document.addEventListener('mouseup', sigmaDocUpHandler);

        // Double click on card
        wrapperEl.addEventListener('dblclick', function(e) {
            var cardEl = e.target.closest('.dbrel-sigma-card');
            if (!cardEl) return;
            var nodeId = cardEl.dataset.nodeId;
            if (!graph || !graph.hasNode(nodeId)) return;
            var attrs = graph.getNodeAttributes(nodeId);
            DbRel.showRowModal(attrs.tableKey, attrs.rowIndex);
        });

        // Wheel zoom
        wrapperEl.addEventListener('wheel', function(e) {
            e.preventDefault();
            var delta = e.deltaY > 0 ? 1.1 : 0.9;
            var rect = wrapperEl.getBoundingClientRect();
            var mouseX = e.clientX - rect.left;
            var mouseY = e.clientY - rect.top;

            var graphPos = screenToGraph(mouseX, mouseY);
            cameraState.ratio *= delta;
            cameraState.ratio = Math.max(0.005, Math.min(20, cameraState.ratio));
            var newScreen = graphToScreen(graphPos.x, graphPos.y);
            var scale = getCurrentScale();
            cameraState.x += (newScreen.x - mouseX) / scale;
            cameraState.y += (newScreen.y - mouseY) / scale;

            zoomLevel = Math.round(getCurrentScale() * 100);
            DbRel.setZoomSlider(zoomLevel);
            requestRender();
        }, { passive: false });
    }

    function handleNodeClick(nodeId) {
        var now = Date.now();
        if (lastClickNode === nodeId && now - lastClickTime < 350) {
            lastClickNode = null;
            return; // part of a double-click
        }
        lastClickTime = now;
        lastClickNode = nodeId;

        if (focusedNodeId === nodeId) {
            unfocusNodeInternal();
        } else {
            focusNodeInternal(nodeId);
        }
    }

    /* ====================================================================
     * EDGE HIT TESTING
     * ==================================================================== */

    function hitTestEdge(e) {
        if (!graph || graph.size === 0) return null;
        var rect = wrapperEl.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;
        var threshold = 8;
        var bestEdge = null;
        var bestDist = threshold;
        var typeF = DbRel.getTypeFilters();
        var dbF = DbRel.getDbFilters();

        graph.forEachEdge(function(edgeId, attrs, source, target) {
            if (typeF[attrs.relType] === false) return;
            var rd = attrs.relData;
            if (rd) {
                if (dbF[rd.source.split('.')[0]] === false) return;
                if (dbF[rd.target.split('.')[0]] === false) return;
            }

            var sPos = nodePositions[source];
            var tPos = nodePositions[target];
            if (!sPos || !tPos) return;
            var sSz = nodeSizes[source] || { w: 150, h: 50 };
            var tSz = nodeSizes[target] || { w: 150, h: 50 };

            var sCX = sPos.x + sSz.w / 2;
            var tCX = tPos.x + tSz.w / 2;
            var exitX = sCX < tCX ? sPos.x + sSz.w : sPos.x;
            var enterX = sCX < tCX ? tPos.x : tPos.x + tSz.w;
            var sCY = sPos.y + sSz.h / 2;
            var tCY = tPos.y + tSz.h / 2;

            var s1 = graphToScreen(exitX, sCY);
            var s2 = graphToScreen(enterX, tCY);
            var midXs = (s1.x + s2.x) / 2;

            var d = Math.min(
                distToSegment(mx, my, s1.x, s1.y, midXs, s1.y),
                distToSegment(mx, my, midXs, s1.y, midXs, s2.y),
                distToSegment(mx, my, midXs, s2.y, s2.x, s2.y)
            );
            if (d < bestDist) {
                bestDist = d;
                bestEdge = edgeId;
            }
        });

        return bestEdge;
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1;
        var lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
        var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        var projX = x1 + t * dx;
        var projY = y1 + t * dy;
        return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    }

    /* ====================================================================
     * FOCUS / UNFOCUS
     * ==================================================================== */

    function focusNodeInternal(nodeId) {
        focusedNodeId = nodeId;
        requestRender();

        var conn = getConnectedSets(nodeId);
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        Object.keys(conn.nodes).forEach(function(nid) {
            var pos = nodePositions[nid];
            var sz = nodeSizes[nid] || { w: 150, h: 50 };
            if (!pos) return;
            if (pos.x < minX) minX = pos.x;
            if (pos.y < minY) minY = pos.y;
            if (pos.x + sz.w > maxX) maxX = pos.x + sz.w;
            if (pos.y + sz.h > maxY) maxY = pos.y + sz.h;
        });

        if (minX !== Infinity) {
            var vs = getViewSize();
            var padding = 60;
            var contentW = maxX - minX + padding * 2;
            var contentH = maxY - minY + padding * 2;
            var scaleX = vs.w / contentW;
            var scaleY = vs.h / contentH;
            var scale = Math.min(scaleX, scaleY, 2);
            scale = Math.max(scale, 0.05);
            cameraState.ratio = 1 / scale;
            cameraState.x = (minX + maxX) / 2;
            cameraState.y = (minY + maxY) / 2;
            zoomLevel = Math.round(scale * 100);
            DbRel.setZoomSlider(zoomLevel);
            requestRender();
        }
    }

    function unfocusNodeInternal() {
        focusedNodeId = null;
        requestRender();
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('sigma', {
        init: function(el) {
            containerEl = el;

            // Create internal wrapper
            wrapperEl = document.createElement('div');
            wrapperEl.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;background:#fff;';
            containerEl.appendChild(wrapperEl);

            // Edge canvas
            edgeCanvas = document.createElement('canvas');
            edgeCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;';
            wrapperEl.appendChild(edgeCanvas);
            edgeCtx = edgeCanvas.getContext('2d');

            // Card overlay
            cardOverlay = document.createElement('div');
            cardOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;overflow:visible;';
            wrapperEl.appendChild(cardOverlay);

            setupInteractions();
        },

        render: function() {
            // Clear existing cards
            if (cardOverlay) cardOverlay.innerHTML = '';
            buildGraph();
        },

        doLayout: function() {
            doLayoutInternal();
            resetCamera();
            requestRender();
        },

        setZoom: function(pct) {
            zoomLevel = pct;
            var scale = pct / 100;
            cameraState.ratio = 1 / scale;
            DbRel.setZoomSlider(pct);
            requestRender();
        },

        getZoom: function() {
            return zoomLevel;
        },

        fitToScreen: function() {
            fitToScreenInternal();
        },

        applyFilters: function(dbF, typeF) {
            // Filters are read dynamically during rendering
            requestRender();
        },

        focusNode: function(nodeId) {
            focusNodeInternal(nodeId);
        },

        unfocusNode: function() {
            unfocusNodeInternal();
        },

        centerOnTable: function(tableKey) {
            if (!graph) return;
            var nodeId = DbRel.displayMode === 'grouped' ? tableKey : tableKey + ':0';
            if (!graph.hasNode(nodeId)) return;
            var pos = nodePositions[nodeId];
            var sz = nodeSizes[nodeId] || { w: 150, h: 50 };
            if (!pos) return;
            cameraState.x = pos.x + sz.w / 2;
            cameraState.y = pos.y + sz.h / 2;
            requestRender();
        },

        highlightTable: function(tk) {
            if (!graph || !cardOverlay) return;
            var cardEls = cardOverlay.querySelectorAll('.dbrel-sigma-card');
            for (var i = 0; i < cardEls.length; i++) {
                var nid = cardEls[i].dataset.nodeId;
                var nAttrs = graph.hasNode(nid) ? graph.getNodeAttributes(nid) : null;
                cardEls[i].style.opacity = (nAttrs && nAttrs.tableKey === tk) ? '1' : '0.12';
            }
            requestRender();
        },
        clearHighlightTable: function() {
            if (!cardOverlay) return;
            var cardEls = cardOverlay.querySelectorAll('.dbrel-sigma-card');
            for (var i = 0; i < cardEls.length; i++) {
                cardEls[i].style.opacity = '1';
            }
            requestRender();
        },

        getStats: function() {
            return {
                nodes: graph ? graph.order : 0,
                links: graph ? graph.size : 0
            };
        },

        resize: function() {
            requestRender();
        },

        destroy: function() {
            if (renderRAF) {
                cancelAnimationFrame(renderRAF);
                renderRAF = null;
            }
            if (sigmaDocMoveHandler) { document.removeEventListener('mousemove', sigmaDocMoveHandler); sigmaDocMoveHandler = null; }
            if (sigmaDocUpHandler) { document.removeEventListener('mouseup', sigmaDocUpHandler); sigmaDocUpHandler = null; }
            graph = null;
            nodePositions = {};
            nodeSizes = {};
            edgeDataMap = {};
            focusedNodeId = null;
            hoveredNode = null;
            hoveredEdge = null;
            dragState = null;
            panState = null;
            if (wrapperEl && wrapperEl.parentElement) {
                wrapperEl.parentElement.removeChild(wrapperEl);
            }
            wrapperEl = null;
            cardOverlay = null;
            edgeCanvas = null;
            edgeCtx = null;
            containerEl = null;
            zoomLevel = 100;
        }
    });

})();
