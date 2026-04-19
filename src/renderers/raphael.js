/**
 * Database Relationships - Raphael Renderer
 * Pure SVG via Raphael API with viewBox-based zoom/pan and drag handlers.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var R = null, containerEl = null;
    var nodes = {};          // id -> { set, body, header, hText, x, y, w, h, tableKey, dbName, tableName, rowIndex, textLines, colors }
    var links = [];          // { set, pathEl, labelBg, label, arrowSet, rel, srcId, tgtId, vertices, style }
    var bgRect = null;
    var zoomLevel = 100;
    var panX = 0, panY = 0;
    var focusedNodeId = null, savedPositions = {};
    var raphDocMoveHandler = null, raphDocUpHandler = null;

    var CHAR_W = 7;

    /* ====================================================================
     * LINK STYLES
     * ==================================================================== */

    var RAPH_LINK_STYLES = {
        'direct':      { stroke: '#8899aa', dasharray: '',         width: 1.2 },
        'find_in_set': { stroke: '#a07de8', dasharray: '8,4',     width: 1.5 },
        'cross_db':    { stroke: '#fd7e14', dasharray: '4,4,1,4', width: 1.5 }
    };

    /* ====================================================================
     * VIEWBOX MANAGEMENT
     * ==================================================================== */

    function getCanvasSize() {
        return {
            w: containerEl ? containerEl.clientWidth : 1200,
            h: containerEl ? containerEl.clientHeight : 700
        };
    }

    function applyViewBox() {
        if (!R) return;
        var cs = getCanvasSize();
        var scale = 100 / zoomLevel;
        var vw = cs.w * scale;
        var vh = cs.h * scale;
        R.canvas.setAttribute('viewBox', panX + ' ' + panY + ' ' + vw + ' ' + vh);
    }

    function setZoom(pct) {
        var cs = getCanvasSize();
        var oldScale = 100 / zoomLevel;
        var centerX = panX + cs.w * oldScale / 2;
        var centerY = panY + cs.h * oldScale / 2;
        zoomLevel = Math.max(5, Math.min(400, pct));
        var newScale = 100 / zoomLevel;
        panX = centerX - cs.w * newScale / 2;
        panY = centerY - cs.h * newScale / 2;
        applyViewBox();
        DbRel.setZoomSlider(zoomLevel);
    }

    function fitToScreen() {
        var nodeIds = Object.keys(nodes);
        if (nodeIds.length === 0) return;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodeIds.forEach(function(id) {
            var n = nodes[id];
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + n.w > maxX) maxX = n.x + n.w;
            if (n.y + n.h > maxY) maxY = n.y + n.h;
        });
        var pad = 40;
        var contentW = maxX - minX + pad * 2;
        var contentH = maxY - minY + pad * 2;
        var cs = getCanvasSize();
        var scaleX = cs.w / contentW;
        var scaleY = cs.h / contentH;
        var scale = Math.min(scaleX, scaleY, 1.5);
        scale = Math.max(scale, 0.02);
        zoomLevel = Math.round(scale * 100);
        panX = minX - pad;
        panY = minY - pad;
        applyViewBox();
        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * DRAW A SINGLE CARD NODE
     * ==================================================================== */

    function drawCard(id, x, y, headerText, textLines, colors, meta) {
        var HDR_H = DbRel.HDR_H;
        var PAD = DbRel.PAD;
        var ROW_H = DbRel.ROW_H;

        var maxLineLen = headerText.length + 2;
        textLines.forEach(function(l) { if (l.length > maxLineLen) maxLineLen = l.length; });
        var maxW = DbRel.showFullContent ? 1600 : 300;
        var w = Math.max(140, Math.min(maxW, maxLineLen * CHAR_W + 16));
        var h = HDR_H + PAD + Math.max(textLines.length, 1) * ROW_H + PAD;

        var set = R.set();

        // Body
        var body = R.rect(x, y, w, h, 4).attr({
            fill: colors.bg, stroke: colors.border, 'stroke-width': 1, cursor: 'move'
        });
        set.push(body);

        // Header
        var header = R.rect(x, y, w, HDR_H, 4).attr({
            fill: colors.header, stroke: 'none', cursor: 'move'
        });
        var headerMask = R.rect(x, y + HDR_H - 6, w, 6).attr({
            fill: colors.header, stroke: 'none'
        });
        set.push(header);
        set.push(headerMask);

        // Table icon in header
        var hdrTextX = x + 7;
        var iconInfo = meta && meta.tableName ? DbRel.getTableIconInfo(meta.tableName) : null;
        if (iconInfo && iconInfo.src) {
            // Raphael: use SVG image element for PNG icon
            var imgEl = R.image(iconInfo.src, x + 3, y + 3, 16, 16).attr({ cursor: 'move' });
            set.push(imgEl);
            hdrTextX = x + 22;
        }

        // Header text
        var hText = R.text(hdrTextX, y + HDR_H / 2 + 1, headerText).attr({
            fill: '#fff', 'font-size': 11, 'font-weight': 'bold',
            'font-family': 'monospace', 'text-anchor': 'start', cursor: 'move'
        });
        set.push(hText);

        // Field lines
        textLines.forEach(function(line, i) {
            var t = R.text(x + 7, y + HDR_H + PAD + i * ROW_H + ROW_H / 2 + 1, line).attr({
                fill: '#495057', 'font-size': 10, 'font-family': 'monospace',
                'text-anchor': 'start', cursor: 'move'
            });
            set.push(t);
        });

        // Pivot icon for pivotable tables
        var pivotIcon = null;
        var pivotInfo = DbRel.getNodePivotInfo(meta.tableKey, meta.rowIndex);
        if (pivotInfo) {
            pivotIcon = R.text(x + w - 10, y + HDR_H / 2 + 1, '\u2316').attr({
                fill: '#fff', 'font-size': 11, 'font-family': 'sans-serif',
                'text-anchor': 'middle', cursor: 'pointer', opacity: 0.6
            });
            set.push(pivotIcon);
            (function(tk, ri) {
                pivotIcon.mouseover(function() { pivotIcon.attr('opacity', 1); });
                pivotIcon.mouseout(function() { pivotIcon.attr('opacity', 0.6); });
                pivotIcon.click(function(e) {
                    if (e && e.stopPropagation) e.stopPropagation();
                    DbRel.pivotTo(tk, ri);
                });
            })(meta.tableKey, meta.rowIndex);
        }

        var node = {
            set: set, body: body, header: header, hText: hText,
            pivotIcon: pivotIcon,
            x: x, y: y, w: w, h: h,
            tableKey: meta.tableKey, dbName: meta.dbName,
            tableName: meta.tableName, rowIndex: meta.rowIndex,
            textLines: textLines, colors: colors
        };
        nodes[id] = node;

        // Drag
        var ox, oy;
        var dragMove = function(dx, dy) {
            var scale = 100 / zoomLevel;
            moveNode(id, ox + dx * scale, oy + dy * scale);
            updateLinksForNode(id);
        };
        var dragStart = function() { ox = node.x; oy = node.y; };
        var dragEnd = function() {};
        body.drag(dragMove, dragStart, dragEnd);
        header.drag(dragMove, dragStart, dragEnd);
        hText.drag(dragMove, dragStart, dragEnd);

        // Click -> focus
        body.click(function() { handleNodeClick(id); });
        header.click(function() { handleNodeClick(id); });

        // Double-click -> modal
        body.dblclick(function() { handleNodeDblClick(id); });
        header.dblclick(function() { handleNodeDblClick(id); });

        // Hover
        set.forEach(function(elem) {
            elem.mouseover(function() { handleNodeHoverIn(id); });
            elem.mouseout(function() { handleNodeHoverOut(); });
        });

        return node;
    }

    function moveNode(id, nx, ny) {
        var n = nodes[id];
        if (!n) return;
        var dx = nx - n.x;
        var dy = ny - n.y;
        n.x = nx;
        n.y = ny;
        n.set.forEach(function(elem) {
            var type = elem.type;
            if (type === 'rect') {
                elem.attr({ x: elem.attr('x') + dx, y: elem.attr('y') + dy });
            } else if (type === 'text') {
                elem.attr({ x: elem.attr('x') + dx, y: elem.attr('y') + dy });
            }
        });
    }

    /* ====================================================================
     * DRAW LINKS (orthogonal paths)
     * ==================================================================== */

    function drawLink(srcId, tgtId, rel, style) {
        var sn = nodes[srcId], tn = nodes[tgtId];
        if (!sn || !tn) return null;
        var vertices = computeOrthogonalPath(sn, tn, srcId, tgtId);
        var pathStr = verticesToPath(vertices);
        var pathEl = R.path(pathStr).attr({
            stroke: style.stroke,
            'stroke-width': style.width,
            'stroke-dasharray': style.dasharray || '',
            fill: 'none',
            cursor: 'pointer'
        });

        var arrowSet = drawArrow(vertices, style.stroke);

        var mid = getPathMidpoint(vertices);
        var labelText = rel.source_field + '\u2192' + rel.target_field;
        var labelBg = R.rect(mid.x - labelText.length * 3 - 2, mid.y - 7, labelText.length * 6 + 4, 14, 2).attr({
            fill: '#fff', stroke: 'none', opacity: 0.85
        });
        var label = R.text(mid.x, mid.y, labelText).attr({
            fill: style.stroke, 'font-size': 8, 'font-family': 'sans-serif',
            cursor: 'pointer', opacity: 0.9
        });

        var linkSet = R.set();
        linkSet.push(pathEl);
        if (arrowSet) arrowSet.forEach(function(a) { linkSet.push(a); });
        linkSet.push(labelBg);
        linkSet.push(label);

        pathEl.toBack();
        labelBg.toBack();
        if (bgRect) bgRect.toBack();

        var linkObj = {
            set: linkSet, pathEl: pathEl, labelBg: labelBg, label: label,
            arrowSet: arrowSet, rel: rel, srcId: srcId, tgtId: tgtId,
            vertices: vertices, style: style
        };
        links.push(linkObj);

        // Hover tooltip
        pathEl.mouseover(function(evt) { handleLinkHoverIn(linkObj, evt); });
        pathEl.mouseout(function() { handleLinkHoverOut(); });
        label.mouseover(function(evt) { handleLinkHoverIn(linkObj, evt); });
        label.mouseout(function() { handleLinkHoverOut(); });

        return linkObj;
    }

    function computeOrthogonalPath(sn, tn, srcId, tgtId) {
        var EXIT_PAD = 18, BOX_PAD = 8;
        var sideCombos = [
            { es: 'right', en: 'left',  ex: sn.x + sn.w, enx: tn.x },
            { es: 'right', en: 'right', ex: sn.x + sn.w, enx: tn.x + tn.w },
            { es: 'left',  en: 'left',  ex: sn.x,        enx: tn.x },
            { es: 'left',  en: 'right', ex: sn.x,        enx: tn.x + tn.w }
        ];

        var best = null, bestScore = Infinity;
        var sCy = sn.y + sn.h / 2;
        var tCy = tn.y + tn.h / 2;
        sideCombos.forEach(function(c) {
            var padX1 = c.es === 'right' ? c.ex + EXIT_PAD : c.ex - EXIT_PAD;
            var padX2 = c.en === 'left' ? c.enx - EXIT_PAD : c.enx + EXIT_PAD;
            var midX = (padX1 + padX2) / 2;
            var exitThru = (c.es === 'left' && midX > sn.x) || (c.es === 'right' && midX < sn.x + sn.w);
            var enterThru = (c.en === 'right' && midX < tn.x + tn.w) || (c.en === 'left' && midX > tn.x);
            if (exitThru || enterThru) return;
            var dist = Math.abs(c.ex - c.enx) + Math.abs(sCy - tCy);
            if (dist < bestScore) { bestScore = dist; best = c; }
        });
        if (!best) {
            best = (sn.x + sn.w / 2) < (tn.x + tn.w / 2)
                ? { es: 'right', en: 'left', ex: sn.x + sn.w, enx: tn.x }
                : { es: 'left', en: 'right', ex: sn.x, enx: tn.x + tn.w };
        }

        var exitX = best.ex, exitY = sCy;
        var enterX = best.enx, enterY = tCy;
        var padX1 = best.es === 'right' ? exitX + EXIT_PAD : exitX - EXIT_PAD;
        var padX2 = best.en === 'left' ? enterX - EXIT_PAD : enterX + EXIT_PAD;
        var corridorX = (padX1 + padX2) / 2;

        corridorX = findClearCorridorX(corridorX, Math.min(exitY, enterY), Math.max(exitY, enterY), srcId, tgtId, BOX_PAD);

        if (Math.abs(exitY - enterY) < 4 && Math.abs(exitX - enterX) > 20) {
            return [{ x: exitX, y: exitY }, { x: enterX, y: enterY }];
        }
        return [
            { x: exitX, y: exitY },
            { x: padX1, y: exitY },
            { x: corridorX, y: exitY },
            { x: corridorX, y: enterY },
            { x: padX2, y: enterY },
            { x: enterX, y: enterY }
        ];
    }

    function findClearCorridorX(idealX, yMin, yMax, skipSrc, skipTgt, pad) {
        function hits(cx) {
            var ids = Object.keys(nodes);
            for (var i = 0; i < ids.length; i++) {
                if (ids[i] === skipSrc || ids[i] === skipTgt) continue;
                var n = nodes[ids[i]];
                if (cx >= n.x - pad && cx <= n.x + n.w + pad &&
                    yMin <= n.y + n.h + pad && yMax >= n.y - pad) return true;
            }
            return false;
        }
        if (!hits(idealX)) return idealX;
        for (var off = 10; off < 400; off += 10) {
            if (!hits(idealX + off)) return idealX + off;
            if (!hits(idealX - off)) return idealX - off;
        }
        return idealX;
    }

    function verticesToPath(pts) {
        if (pts.length === 0) return '';
        var d = 'M' + pts[0].x + ',' + pts[0].y;
        for (var i = 1; i < pts.length; i++) {
            d += 'L' + pts[i].x + ',' + pts[i].y;
        }
        return d;
    }

    function getPathMidpoint(pts) {
        if (pts.length < 2) return pts[0] || { x: 0, y: 0 };
        var totalLen = 0, segs = [];
        for (var i = 1; i < pts.length; i++) {
            var dx = pts[i].x - pts[i - 1].x;
            var dy = pts[i].y - pts[i - 1].y;
            var len = Math.sqrt(dx * dx + dy * dy);
            segs.push({ from: pts[i - 1], to: pts[i], len: len });
            totalLen += len;
        }
        var half = totalLen / 2, acc = 0;
        for (var j = 0; j < segs.length; j++) {
            if (acc + segs[j].len >= half) {
                var t = (half - acc) / segs[j].len;
                return {
                    x: segs[j].from.x + (segs[j].to.x - segs[j].from.x) * t,
                    y: segs[j].from.y + (segs[j].to.y - segs[j].from.y) * t
                };
            }
            acc += segs[j].len;
        }
        return pts[pts.length - 1];
    }

    function drawArrow(pts, color) {
        if (pts.length < 2) return null;
        var last = pts[pts.length - 1];
        var prev = pts[pts.length - 2];
        var angle = Math.atan2(last.y - prev.y, last.x - prev.x);
        var sz = 7;
        var x1 = last.x - sz * Math.cos(angle - Math.PI / 6);
        var y1 = last.y - sz * Math.sin(angle - Math.PI / 6);
        var x2 = last.x - sz * Math.cos(angle + Math.PI / 6);
        var y2 = last.y - sz * Math.sin(angle + Math.PI / 6);
        var arrowPath = R.path('M' + last.x + ',' + last.y + 'L' + x1 + ',' + y1 +
            'M' + last.x + ',' + last.y + 'L' + x2 + ',' + y2).attr({
            stroke: color, 'stroke-width': 1.5, fill: 'none'
        });
        arrowPath.toBack();
        return [arrowPath];
    }

    function updateLinksForNode(nodeId) {
        links.forEach(function(lk) {
            if (lk.srcId !== nodeId && lk.tgtId !== nodeId) return;
            var sn = nodes[lk.srcId], tn = nodes[lk.tgtId];
            if (!sn || !tn) return;
            var verts = computeOrthogonalPath(sn, tn, lk.srcId, lk.tgtId);
            lk.vertices = verts;
            lk.pathEl.attr({ path: verticesToPath(verts) });
            if (lk.arrowSet) lk.arrowSet.forEach(function(a) { a.remove(); });
            lk.arrowSet = drawArrow(verts, lk.style.stroke);
            if (lk.arrowSet) lk.arrowSet.forEach(function(a) { lk.set.push(a); });
            var mid = getPathMidpoint(verts);
            var lt = lk.rel.source_field + '\u2192' + lk.rel.target_field;
            lk.labelBg.attr({ x: mid.x - lt.length * 3 - 2, y: mid.y - 7 });
            lk.label.attr({ x: mid.x, y: mid.y });
            lk.pathEl.toBack();
            if (bgRect) bgRect.toBack();
        });
    }

    /* ====================================================================
     * BUILD GRAPH
     * ==================================================================== */

    function buildGraph() {
        if (!DbRel.data) return;
        if (R) R.clear();
        nodes = {};
        links = [];
        focusedNodeId = null;
        savedPositions = {};
        DbRel.resetTableColors();

        setupBackground();

        if (DbRel.displayMode === 'grouped') {
            buildGrouped();
        } else {
            buildSeparate();
        }

        doLayout();
        drawAllLinks();

        setTimeout(function() {
            fitToScreen();
        }, 100);
    }

    function setupBackground() {
        bgRect = R.rect(-50000, -50000, 100000, 100000).attr({
            fill: '#fff', stroke: 'none', opacity: 0.01, cursor: 'grab'
        });
        bgRect.toBack();

        var panning = false, startMX, startMY, startPX, startPY, panDidMove = false;
        bgRect.mousedown(function(evt) {
            panning = true; panDidMove = false;
            startMX = evt.clientX; startMY = evt.clientY;
            startPX = panX; startPY = panY;
            bgRect.attr({ cursor: 'grabbing' });
        });
        raphDocMoveHandler = function(evt) {
            if (!panning) return;
            var scale = 100 / zoomLevel;
            var dx = (evt.clientX - startMX) * scale;
            var dy = (evt.clientY - startMY) * scale;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panDidMove = true;
            panX = startPX - dx;
            panY = startPY - dy;
            applyViewBox();
        };
        raphDocUpHandler = function() {
            if (!panning) return;
            panning = false;
            if (bgRect) bgRect.attr({ cursor: 'grab' });
            if (!panDidMove && focusedNodeId) unfocusNodeInternal();
        };
        document.addEventListener('mousemove', raphDocMoveHandler);
        document.addEventListener('mouseup', raphDocUpHandler);
    }

    /* === SEPARATE MODE === */
    function buildSeparate() {
        var tableKeys = Object.keys(DbRel.data.tables);
        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);

            tableInfo.rows.forEach(function(row, ri) {
                var nodeId = tableKey + ':' + ri;
                var headerLabel = DbRel.getNodeHeader(tableKey, ri);
                var lineArr = DbRel.getNodeLines(tableKey, ri);

                drawCard(nodeId, 0, 0, headerLabel, lineArr, colors, {
                    tableKey: tableKey, dbName: dbName, tableName: tableName, rowIndex: ri
                });
            });
        });
    }

    /* === GROUPED MODE === */
    function buildGrouped() {
        var tableKeys = Object.keys(DbRel.data.tables);
        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lineArr = DbRel.getGroupedLines(tableKey);

            drawCard(tableKey, 0, 0, tableName + ' (' + tableInfo.total + ')', lineArr, colors, {
                tableKey: tableKey, dbName: dbName, tableName: tableName, rowIndex: 0
            });
        });
    }

    /* === DRAW ALL LINKS === */
    function drawAllLinks() {
        if (!DbRel.data) return;
        DbRel.data.relationships.forEach(function(rel) {
            var style = RAPH_LINK_STYLES[rel.type] || RAPH_LINK_STYLES['direct'];
            if (DbRel.displayMode === 'separate') {
                (rel.matches || []).forEach(function(match) {
                    var srcNodeId = rel.source + ':' + match[0];
                    if (!nodes[srcNodeId]) return;
                    match[1].forEach(function(tgtRowIdx) {
                        var tgtNodeId = rel.target + ':' + tgtRowIdx;
                        if (!nodes[tgtNodeId]) return;
                        drawLink(srcNodeId, tgtNodeId, rel, style);
                    });
                });
            } else {
                if (!nodes[rel.source] || !nodes[rel.target]) return;
                drawLink(rel.source, rel.target, rel, style);
            }
        });
    }

    /* ====================================================================
     * LAYOUT
     * ==================================================================== */

    function doLayout() {
        var cs = getCanvasSize();
        var positions = DbRel.computeLayout(cs.w, cs.h);

        Object.keys(positions).forEach(function(nid) {
            if (nodes[nid]) {
                moveNode(nid, positions[nid].x, positions[nid].y);
            }
        });
    }

    /* ====================================================================
     * INTERACTIONS
     * ==================================================================== */

    function handleNodeClick(id) {
        if (focusedNodeId === id) {
            unfocusNodeInternal();
            return;
        }
        focusNodeInternal(id);
    }

    function handleNodeDblClick(id) {
        var n = nodes[id];
        if (!n || !DbRel.data) return;
        DbRel.showRowModal(n.tableKey, n.rowIndex);
    }

    function handleNodeHoverIn(id) {
        if (focusedNodeId) return;
        highlightConnected(id);
    }

    function handleNodeHoverOut() {
        if (focusedNodeId) return;
        clearHighlights();
    }

    function handleLinkHoverIn(lk, evt) {
        lk.pathEl.attr({ 'stroke-width': lk.style.width + 2, opacity: 1 });
        highlightNode(lk.srcId, true);
        highlightNode(lk.tgtId, true);
        if (lk.rel) {
            DbRel.showTooltip(DbRel.getLinkTooltipHtml(lk.rel), evt.clientX, evt.clientY);
        }
    }

    function handleLinkHoverOut() {
        DbRel.hideTooltip();
        if (!focusedNodeId) {
            clearHighlights();
            links.forEach(function(lk) {
                lk.pathEl.attr({ 'stroke-width': lk.style.width, opacity: 1 });
            });
        }
    }

    function highlightNode(id, glow) {
        var n = nodes[id];
        if (!n) return;
        if (glow) n.body.attr({ 'stroke-width': 2, stroke: '#e94560' });
    }

    function highlightConnected(centerId) {
        var connectedIds = {};
        connectedIds[centerId] = true;
        links.forEach(function(lk) {
            if (lk.srcId === centerId || lk.tgtId === centerId) {
                connectedIds[lk.srcId] = true;
                connectedIds[lk.tgtId] = true;
                lk.pathEl.attr({ 'stroke-width': lk.style.width + 1.5, opacity: 1 });
            }
        });
        Object.keys(connectedIds).forEach(function(id) {
            highlightNode(id, true);
        });
    }

    function clearHighlights() {
        Object.keys(nodes).forEach(function(id) {
            var n = nodes[id];
            n.body.attr({ 'stroke-width': 1, stroke: n.colors.border, opacity: 1 });
            n.set.forEach(function(elem) { elem.attr({ opacity: 1 }); });
        });
        links.forEach(function(lk) {
            lk.pathEl.attr({ 'stroke-width': lk.style.width, opacity: 1 });
            lk.set.forEach(function(elem) { elem.attr({ opacity: 1 }); });
        });
    }

    function focusNodeInternal(elId) {
        if (focusedNodeId && focusedNodeId !== elId) restorePositions();
        focusedNodeId = elId;
        clearHighlights();

        var focusN = nodes[elId];
        if (!focusN) return;

        var connectedIds = {};
        connectedIds[elId] = true;
        links.forEach(function(lk) {
            if (lk.srcId === elId || lk.tgtId === elId) {
                connectedIds[lk.srcId] = true;
                connectedIds[lk.tgtId] = true;
            }
        });

        var centerX = focusN.x + focusN.w / 2;
        var centerY = focusN.y + focusN.h / 2;

        var neighbors = [];
        Object.keys(nodes).forEach(function(id) {
            if (id !== elId && connectedIds[id]) neighbors.push(id);
        });

        savedPositions = {};
        neighbors.forEach(function(id) {
            savedPositions[id] = { x: nodes[id].x, y: nodes[id].y };
        });

        var radius = Math.max(200, neighbors.length * 35);
        var angleStep = (2 * Math.PI) / Math.max(neighbors.length, 1);
        neighbors.forEach(function(id, i) {
            var angle = -Math.PI / 2 + i * angleStep;
            var n = nodes[id];
            moveNode(id, centerX + radius * Math.cos(angle) - n.w / 2,
                        centerY + radius * Math.sin(angle) - n.h / 2);
            updateLinksForNode(id);
        });

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(elId);
        Object.keys(nodes).forEach(function(id) {
            var n = nodes[id];
            var dist = distances[id];
            var opacity = DbRel.distanceToOpacity(dist);
            if (dist !== undefined && dist <= 1) {
                n.body.attr({ 'stroke-width': 2, stroke: '#e94560' });
            }
            n.set.forEach(function(elem) { elem.attr({ opacity: opacity }); });
        });
        links.forEach(function(lk) {
            var sDist = distances[lk.srcId] !== undefined ? distances[lk.srcId] : Infinity;
            var tDist = distances[lk.tgtId] !== undefined ? distances[lk.tgtId] : Infinity;
            var edgeOpacity = DbRel.distanceToOpacity(Math.max(sDist, tDist));
            var isDirectlyConnected = lk.srcId === elId || lk.tgtId === elId;
            if (isDirectlyConnected) {
                lk.pathEl.attr({ 'stroke-width': lk.style.width + 1.5 });
            }
            lk.pathEl.attr({ opacity: edgeOpacity });
            lk.set.forEach(function(elem) { elem.attr({ opacity: edgeOpacity }); });
        });

        // Zoom to cluster
        var allConn = [focusN];
        neighbors.forEach(function(id) { allConn.push(nodes[id]); });
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        allConn.forEach(function(n) {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + n.w > maxX) maxX = n.x + n.w;
            if (n.y + n.h > maxY) maxY = n.y + n.h;
        });
        var padV = 60;
        var cw = maxX - minX + padV * 2;
        var ch = maxY - minY + padV * 2;
        var cs = getCanvasSize();
        var sx = cs.w / cw, sy = cs.h / ch;
        var scale = Math.min(sx, sy, 1.5);
        scale = Math.max(scale, 0.1);
        zoomLevel = Math.round(scale * 100);
        panX = minX - padV;
        panY = minY - padV;
        applyViewBox();
        DbRel.setZoomSlider(zoomLevel);
    }

    function unfocusNodeInternal() {
        restorePositions();
        focusedNodeId = null;
        clearHighlights();
        Object.keys(savedPositions).forEach(function(id) {
            updateLinksForNode(id);
        });
        savedPositions = {};
    }

    function restorePositions() {
        Object.keys(savedPositions).forEach(function(id) {
            moveNode(id, savedPositions[id].x, savedPositions[id].y);
        });
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFilters(dbF, typeF) {
        Object.keys(nodes).forEach(function(id) {
            var n = nodes[id];
            var vis = dbF[n.dbName] !== false;
            n.set.forEach(function(elem) { elem.attr({ opacity: vis ? 1 : 0 }); });
        });
        links.forEach(function(lk) {
            var rd = lk.rel;
            var vis = typeF[rd.type] !== false &&
                dbF[rd.srcId ? (nodes[lk.srcId] ? nodes[lk.srcId].dbName : '') : ''] !== false;
            // Use rel source/target for correct db filter
            var srcDb = rd.source.split('.')[0];
            var tgtDb = rd.target.split('.')[0];
            vis = typeF[rd.type] !== false && dbF[srcDb] !== false && dbF[tgtDb] !== false;
            lk.set.forEach(function(elem) { elem.attr({ opacity: vis ? 1 : 0 }); });
        });
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTable(tableKey) {
        var targetId = null;
        Object.keys(nodes).forEach(function(id) {
            if (nodes[id].tableKey === tableKey && !targetId) targetId = id;
        });
        if (!targetId || !nodes[targetId]) return;
        var n = nodes[targetId];
        var cs = getCanvasSize();
        var scale = 100 / zoomLevel;
        panX = n.x + n.w / 2 - cs.w * scale / 2;
        panY = n.y + n.h / 2 - cs.h * scale / 2;
        applyViewBox();
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('raphael', {
        init: function(el) {
            containerEl = el;
            R = Raphael(el, el.clientWidth, el.clientHeight);
            R.canvas.style.width = '100%';
            R.canvas.style.height = '100%';
            applyViewBox();

            // Mouse wheel zoom
            el.addEventListener('wheel', function(e) {
                e.preventDefault();
                setZoom(zoomLevel + (e.deltaY > 0 ? -5 : 5));
            }, { passive: false });
        },
        render: function() {
            buildGraph();
            DbRel.updateSidebar();
        },
        doLayout: function() {
            if (R) R.clear();
            nodes = {}; links = [];
            DbRel.resetTableColors();
            setupBackground();
            if (DbRel.displayMode === 'grouped') buildGrouped(); else buildSeparate();
            doLayout();
            drawAllLinks();
            setTimeout(fitToScreen, 100);
        },
        setZoom: function(pct) {
            setZoom(pct);
        },
        getZoom: function() {
            return zoomLevel;
        },
        fitToScreen: function() {
            fitToScreen();
        },
        applyFilters: function(dbF, typeF) {
            applyFilters(dbF, typeF);
        },
        focusNode: function(nid) {
            focusNodeInternal(nid);
        },
        unfocusNode: function() {
            unfocusNodeInternal();
        },
        centerOnTable: function(tk) {
            centerOnTable(tk);
        },
        getStats: function() {
            return {
                nodes: Object.keys(nodes).length,
                links: links.length
            };
        },
        resize: function() {
            if (R && containerEl) {
                R.setSize(containerEl.clientWidth, containerEl.clientHeight);
                applyViewBox();
            }
        },
        highlightTable: function(tk) {
            var activeNodes = {};
            Object.keys(nodes).forEach(function(id) {
                if (nodes[id].tableKey === tk) activeNodes[id] = true;
            });
            links.forEach(function(lk) {
                if (activeNodes[lk.srcId] || activeNodes[lk.tgtId]) {
                    activeNodes[lk.srcId] = true;
                    activeNodes[lk.tgtId] = true;
                }
            });
            Object.keys(nodes).forEach(function(id) {
                nodes[id].set.attr({ opacity: activeNodes[id] ? 1 : 0.12 });
            });
            links.forEach(function(lk) {
                var active = activeNodes[lk.srcId] && activeNodes[lk.tgtId];
                lk.set.attr({ opacity: active ? 1 : 0.06 });
            });
        },
        clearHighlightTable: function() {
            Object.keys(nodes).forEach(function(id) {
                nodes[id].set.attr({ opacity: 1 });
            });
            links.forEach(function(lk) {
                lk.set.attr({ opacity: 1 });
            });
        },
        destroy: function() {
            if (raphDocMoveHandler) { document.removeEventListener('mousemove', raphDocMoveHandler); raphDocMoveHandler = null; }
            if (raphDocUpHandler) { document.removeEventListener('mouseup', raphDocUpHandler); raphDocUpHandler = null; }
            if (R) { R.clear(); R.remove(); R = null; }
            nodes = {}; links = []; bgRect = null;
            focusedNodeId = null; savedPositions = {};
            zoomLevel = 100; panX = 0; panY = 0;
            containerEl = null;
        }
    });

})();
