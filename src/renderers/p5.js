/**
 * Database Relationships - p5.js Renderer
 * Canvas-based rendering at 30fps with orthogonal link routing.
 * Uses p5 instance mode to avoid polluting global scope.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var p5inst = null, containerEl = null;
    var cards = [], links = [], cardMap = {};
    var panX = 0, panY = 0, zoom = 1;
    var isPanning = false, panStartX = 0, panStartY = 0, panOrigX = 0, panOrigY = 0, didPan = false;
    var dragCard = null, dragOffX = 0, dragOffY = 0;
    var hoveredCard = null, hoveredLink = null;
    var focusedCardId = null, savedPositions = {}, connectedSet = {}, focusDistances = null;
    var lastClickTime = 0, lastClickId = null;

    var FONT_SIZE = 10;
    var CHAR_W = 6.2;

    /* ====================================================================
     * LINK STYLE CONVERSION (hex to RGB arrays for p5)
     * ==================================================================== */

    function colorToRgb(c) {
        if (!c) return [200, 200, 200];
        if (c.charAt(0) === '#') {
            return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
        }
        var m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
        return [200, 200, 200];
    }

    var P5_LINK_STYLES = {
        'direct':      { stroke: [73, 80, 87],   dash: [],        width: 1.2 },
        'find_in_set': { stroke: [111, 66, 193],  dash: [8, 4],    width: 1.5 },
        'cross_db':    { stroke: [253, 126, 20],  dash: [4, 4, 1, 4], width: 1.5 }
    };

    /* ====================================================================
     * BUILD NODES + LINKS
     * ==================================================================== */

    function buildGraph() {
        if (!DbRel.data) return;
        DbRel.resetTableColors();
        cards = []; links = []; cardMap = {};
        focusedCardId = null; savedPositions = {}; connectedSet = {}; focusDistances = null;
        hoveredCard = null; hoveredLink = null;

        if (DbRel.displayMode === 'grouped') {
            buildGrouped();
        } else {
            buildSeparate();
        }

        cards.forEach(function(c) { cardMap[c.id] = c; });
        doLayout();
        routeLinks();
        fitToScreen();
    }

    function buildSeparate() {
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var colorsRgb = {
                header: colorToRgb(colors.header),
                bg: colorToRgb(colors.bg),
                border: colorToRgb(colors.border)
            };

            tableInfo.rows.forEach(function(row, ri) {
                var nodeId = tableKey + ':' + ri;
                var headerLabel = DbRel.getNodeHeader(tableKey, ri);
                var lines = DbRel.getNodeLines(tableKey, ri);
                var size = DbRel.computeNodeSize(headerLabel, lines);

                cards.push({
                    id: nodeId, tableKey: tableKey, dbName: dbName,
                    tableName: tableName, rowIndex: ri,
                    x: 0, y: 0, w: size.w, h: size.h,
                    headerLabel: headerLabel, lines: lines, color: colorsRgb,
                    visible: true
                });
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = P5_LINK_STYLES[rel.type] || P5_LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcId = rel.source + ':' + match[0];
                match[1].forEach(function(tgtRowIdx) {
                    var tgtId = rel.target + ':' + tgtRowIdx;
                    links.push({
                        srcId: srcId, tgtId: tgtId,
                        relType: rel.type, relLabel: rel.label, relData: rel,
                        style: style, vertices: [], visible: true,
                        startX: 0, startY: 0, endX: 0, endY: 0
                    });
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
            var colorsRgb = {
                header: colorToRgb(colors.header),
                bg: colorToRgb(colors.bg),
                border: colorToRgb(colors.border)
            };
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);

            cards.push({
                id: tableKey, tableKey: tableKey, dbName: dbName,
                tableName: tableName, rowIndex: 0,
                x: 0, y: 0, w: size.w, h: size.h,
                headerLabel: tableName + ' (' + tableInfo.total + ')',
                lines: lines, color: colorsRgb, visible: true
            });
        });

        DbRel.data.relationships.forEach(function(rel) {
            var style = P5_LINK_STYLES[rel.type] || P5_LINK_STYLES['direct'];
            links.push({
                srcId: rel.source, tgtId: rel.target,
                relType: rel.type, relLabel: rel.label, relData: rel,
                style: style, vertices: [], visible: true,
                startX: 0, startY: 0, endX: 0, endY: 0
            });
        });
    }

    /* ====================================================================
     * LAYOUT
     * ==================================================================== */

    function doLayout() {
        var cW = containerEl ? containerEl.clientWidth : 1200;
        var cH = containerEl ? containerEl.clientHeight : 700;
        var positions = DbRel.computeLayout(cW, cH);

        Object.keys(positions).forEach(function(nid) {
            var c = cardMap[nid];
            if (c) {
                c.x = positions[nid].x;
                c.y = positions[nid].y;
            }
        });

        routeLinks();
    }

    /* ====================================================================
     * LINK ROUTING (orthogonal with lane allocation)
     * ==================================================================== */

    function routeLinks() {
        var LANE_GAP = 6, EXIT_PAD = 15, BOX_PAD = 8;

        var allBounds = [], boundsMap = {};
        cards.forEach(function(c) {
            var b = { id: c.id, x: c.x, y: c.y, w: c.w, h: c.h,
                cx: c.x + c.w / 2, cy: c.y + c.h / 2, r: c.x + c.w, b: c.y + c.h };
            boundsMap[c.id] = b;
            allBounds.push(b);
        });

        var srcGroups = {}, tgtGroups = {};
        links.forEach(function(lnk) {
            if (!boundsMap[lnk.srcId] || !boundsMap[lnk.tgtId]) return;
            if (!srcGroups[lnk.srcId]) srcGroups[lnk.srcId] = [];
            srcGroups[lnk.srcId].push(lnk);
            if (!tgtGroups[lnk.tgtId]) tgtGroups[lnk.tgtId] = [];
            tgtGroups[lnk.tgtId].push(lnk);
        });

        Object.keys(srcGroups).forEach(function(id) {
            srcGroups[id].sort(function(a, b) {
                var aB = boundsMap[a.tgtId], bB = boundsMap[b.tgtId];
                return (aB ? aB.cy : 0) - (bB ? bB.cy : 0);
            });
        });
        Object.keys(tgtGroups).forEach(function(id) {
            tgtGroups[id].sort(function(a, b) {
                var aB = boundsMap[a.srcId], bB = boundsMap[b.srcId];
                return (aB ? aB.cy : 0) - (bB ? bB.cy : 0);
            });
        });

        function corridorHitsBox(cx, yMin, yMax, skipIds) {
            for (var i = 0; i < allBounds.length; i++) {
                var b = allBounds[i];
                if (skipIds[b.id]) continue;
                if (cx >= b.x - BOX_PAD && cx <= b.r + BOX_PAD &&
                    yMin <= b.b + BOX_PAD && yMax >= b.y - BOX_PAD) return true;
            }
            return false;
        }
        function findClearX(idealX, yMin, yMax, skipIds) {
            if (!corridorHitsBox(idealX, yMin, yMax, skipIds)) return idealX;
            for (var off = 10; off < 500; off += 8) {
                if (!corridorHitsBox(idealX + off, yMin, yMax, skipIds)) return idealX + off;
                if (!corridorHitsBox(idealX - off, yMin, yMax, skipIds)) return idealX - off;
            }
            return idealX;
        }
        function horzHitsBox(hy, xMin, xMax, skipIds) {
            for (var i = 0; i < allBounds.length; i++) {
                var b = allBounds[i];
                if (skipIds[b.id]) continue;
                if (hy >= b.y - BOX_PAD && hy <= b.b + BOX_PAD &&
                    xMin <= b.r + BOX_PAD && xMax >= b.x - BOX_PAD) return true;
            }
            return false;
        }
        function findClearY(idealY, xMin, xMax, skipIds) {
            if (!horzHitsBox(idealY, xMin, xMax, skipIds)) return idealY;
            for (var off = 8; off < 300; off += 6) {
                if (!horzHitsBox(idealY - off, xMin, xMax, skipIds)) return idealY - off;
                if (!horzHitsBox(idealY + off, xMin, xMax, skipIds)) return idealY + off;
            }
            return idealY;
        }

        var corridorLanes = {};

        links.forEach(function(lnk) {
            var sB = boundsMap[lnk.srcId], tB = boundsMap[lnk.tgtId];
            if (!sB || !tB) { lnk.vertices = []; return; }

            var sGroup = srcGroups[lnk.srcId] || [lnk];
            var tGroup = tgtGroups[lnk.tgtId] || [lnk];
            var sIdx = sGroup.indexOf(lnk), tIdx = tGroup.indexOf(lnk);

            var sSpread = Math.min(sB.h * 0.8, sGroup.length * LANE_GAP);
            var sStep = sGroup.length > 1 ? sSpread / (sGroup.length - 1) : 0;
            var exitY = sB.cy + (sIdx - (sGroup.length - 1) / 2) * sStep;

            var tSpread = Math.min(tB.h * 0.8, tGroup.length * LANE_GAP);
            var tStep = tGroup.length > 1 ? tSpread / (tGroup.length - 1) : 0;
            var enterY = tB.cy + (tIdx - (tGroup.length - 1) / 2) * tStep;

            var combos = [
                { es: 'right', ns: 'left',  ex: sB.r,  nx: tB.x },
                { es: 'right', ns: 'right', ex: sB.r,  nx: tB.r },
                { es: 'left',  ns: 'left',  ex: sB.x,  nx: tB.x },
                { es: 'left',  ns: 'right', ex: sB.x,  nx: tB.r }
            ];
            var best = null, bestDist = Infinity;
            combos.forEach(function(c) {
                var px1 = c.es === 'right' ? c.ex + EXIT_PAD : c.ex - EXIT_PAD;
                var px2 = c.ns === 'left'  ? c.nx - EXIT_PAD : c.nx + EXIT_PAD;
                var midX = (px1 + px2) / 2;
                var ets = (c.es === 'left' && midX > sB.x) || (c.es === 'right' && midX < sB.r);
                var nts = (c.ns === 'right' && midX < tB.r) || (c.ns === 'left'  && midX > tB.x);
                if (ets || nts) return;
                var d = Math.abs(c.ex - c.nx) + Math.abs(exitY - enterY);
                if (d < bestDist) { bestDist = d; best = c; }
            });
            if (!best) {
                best = sB.cx < tB.cx
                    ? { es: 'right', ns: 'left', ex: sB.r, nx: tB.x }
                    : { es: 'left', ns: 'right', ex: sB.x, nx: tB.r };
            }

            var padX1 = best.es === 'right' ? best.ex + EXIT_PAD : best.ex - EXIT_PAD;
            var padX2 = best.ns === 'left'  ? best.nx - EXIT_PAD : best.nx + EXIT_PAD;

            var idealCX = (padX1 + padX2) / 2;
            var ck = Math.round(idealCX / 40) * 40;
            if (!corridorLanes[ck]) corridorLanes[ck] = 0;
            var lane = corridorLanes[ck]++;
            var laneIdealX = idealCX + (lane - corridorLanes[ck] / 2) * LANE_GAP;

            var skipBoth = {}; skipBoth[lnk.srcId] = true; skipBoth[lnk.tgtId] = true;
            var skipSrc = {}; skipSrc[lnk.srcId] = true;
            var skipTgt = {}; skipTgt[lnk.tgtId] = true;

            var rYMin = Math.min(exitY, enterY), rYMax = Math.max(exitY, enterY);
            var laneX = findClearX(laneIdealX, rYMin, rYMax, skipBoth);

            var verts;
            if (Math.abs(exitY - enterY) < 3 && Math.abs(best.ex - best.nx) > 20) {
                var sY = findClearY(exitY, Math.min(best.ex, best.nx), Math.max(best.ex, best.nx), skipBoth);
                if (Math.abs(sY - exitY) < 3) {
                    verts = [{ x: best.ex, y: exitY }, { x: best.nx, y: enterY }];
                } else {
                    verts = [
                        { x: padX1, y: exitY }, { x: padX1, y: sY },
                        { x: padX2, y: sY }, { x: padX2, y: enterY }
                    ];
                }
            } else {
                var cExitY = findClearY(exitY, Math.min(padX1, laneX), Math.max(padX1, laneX), skipSrc);
                var cEnterY = findClearY(enterY, Math.min(laneX, padX2), Math.max(laneX, padX2), skipTgt);
                verts = [
                    { x: padX1, y: cExitY }, { x: laneX, y: cExitY },
                    { x: laneX, y: cEnterY }, { x: padX2, y: cEnterY }
                ];
            }

            lnk.startX = best.ex; lnk.startY = exitY;
            lnk.endX = best.nx; lnk.endY = enterY;
            lnk.vertices = verts;
        });
    }

    /* ====================================================================
     * FIT / ZOOM
     * ==================================================================== */

    function fitToScreen() {
        if (cards.length === 0) return;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        cards.forEach(function(c) {
            if (!c.visible) return;
            if (c.x < minX) minX = c.x;
            if (c.y < minY) minY = c.y;
            if (c.x + c.w > maxX) maxX = c.x + c.w;
            if (c.y + c.h > maxY) maxY = c.y + c.h;
        });
        if (minX === Infinity) return;
        var cw = containerEl ? containerEl.clientWidth : 1200;
        var ch = containerEl ? containerEl.clientHeight : 700;
        var bw = maxX - minX + 40, bh = maxY - minY + 40;
        zoom = Math.min(cw / bw, ch / bh, 1.5);
        zoom = Math.max(zoom, 0.02);
        panX = cw / 2 - (minX + bw / 2 - 20) * zoom;
        panY = ch / 2 - (minY + bh / 2 - 20) * zoom;
        DbRel.setZoomSlider(Math.round(zoom * 100));
    }

    /* ====================================================================
     * COORDINATE TRANSFORMS + HIT TESTING
     * ==================================================================== */

    function screenToWorld(sx, sy) {
        return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
    }

    function hitTestCards(wx, wy) {
        for (var i = cards.length - 1; i >= 0; i--) {
            var c = cards[i];
            if (!c.visible) continue;
            if (wx >= c.x && wx <= c.x + c.w && wy >= c.y && wy <= c.y + c.h) return c;
        }
        return null;
    }

    function hitTestLinks(wx, wy) {
        var thresh = 5 / zoom;
        for (var i = links.length - 1; i >= 0; i--) {
            var lnk = links[i];
            if (!lnk.visible) continue;
            var pts = [{ x: lnk.startX, y: lnk.startY }]
                .concat(lnk.vertices)
                .concat([{ x: lnk.endX, y: lnk.endY }]);
            for (var j = 0; j < pts.length - 1; j++) {
                if (distToSegment(wx, wy, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y) < thresh) return lnk;
            }
        }
        return null;
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1;
        var lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
        var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        var nx = x1 + t * dx, ny = y1 + t * dy;
        return Math.sqrt((px - nx) * (px - nx) + (py - ny) * (py - ny));
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFilters(dbF, typeF) {
        cards.forEach(function(c) {
            c.visible = dbF[c.dbName] !== false;
        });
        links.forEach(function(lnk) {
            var rd = lnk.relData;
            if (!rd) { lnk.visible = false; return; }
            var srcVis = dbF[rd.source.split('.')[0]] !== false;
            var tgtVis = dbF[rd.target.split('.')[0]] !== false;
            var typeVis = typeF[lnk.relType] !== false;
            lnk.visible = srcVis && tgtVis && typeVis;
        });
    }

    /* ====================================================================
     * FOCUS / UNFOCUS
     * ==================================================================== */

    function focusNode(cardId) {
        if (focusedCardId && focusedCardId !== cardId) restorePositions();
        focusedCardId = cardId;
        var fc = cardMap[cardId];
        if (!fc) return;

        connectedSet = {};
        connectedSet[cardId] = true;
        links.forEach(function(lnk) {
            if (lnk.srcId === cardId || lnk.tgtId === cardId) {
                connectedSet[lnk.srcId] = true;
                connectedSet[lnk.tgtId] = true;
            }
        });

        // Compute distance-based opacity map
        focusDistances = DbRel.computeNodeDistances(cardId);

        var neighbors = [];
        cards.forEach(function(c) {
            if (c.id !== cardId && connectedSet[c.id]) neighbors.push(c);
        });

        savedPositions = {};
        neighbors.forEach(function(c) { savedPositions[c.id] = { x: c.x, y: c.y }; });

        var cx = fc.x + fc.w / 2, cy = fc.y + fc.h / 2;
        var radius = Math.max(200, neighbors.length * 30);
        var step = (2 * Math.PI) / Math.max(neighbors.length, 1);
        neighbors.forEach(function(c, i) {
            var angle = -Math.PI / 2 + i * step;
            c.x = cx + radius * Math.cos(angle) - c.w / 2;
            c.y = cy + radius * Math.sin(angle) - c.h / 2;
        });

        routeLinks();

        var allC = [fc].concat(neighbors);
        var bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
        allC.forEach(function(c) {
            if (c.x < bMinX) bMinX = c.x;
            if (c.y < bMinY) bMinY = c.y;
            if (c.x + c.w > bMaxX) bMaxX = c.x + c.w;
            if (c.y + c.h > bMaxY) bMaxY = c.y + c.h;
        });
        var cw = containerEl ? containerEl.clientWidth : 1200;
        var ch = containerEl ? containerEl.clientHeight : 700;
        var pw = bMaxX - bMinX + 80, ph = bMaxY - bMinY + 80;
        zoom = Math.min(cw / pw, ch / ph, 1.5);
        zoom = Math.max(zoom, 0.1);
        panX = cw / 2 - (bMinX + pw / 2 - 40) * zoom;
        panY = ch / 2 - (bMinY + ph / 2 - 40) * zoom;
        DbRel.setZoomSlider(Math.round(zoom * 100));
    }

    function unfocusNode() {
        restorePositions();
        focusedCardId = null;
        connectedSet = {};
        focusDistances = null;
        routeLinks();
    }

    function restorePositions() {
        Object.keys(savedPositions).forEach(function(id) {
            var c = cardMap[id];
            if (c) { c.x = savedPositions[id].x; c.y = savedPositions[id].y; }
        });
        savedPositions = {};
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTable(tableKey) {
        var target = null;
        for (var i = 0; i < cards.length; i++) {
            if (cards[i].tableKey === tableKey) { target = cards[i]; break; }
        }
        if (!target) return;
        var cw = containerEl ? containerEl.clientWidth : 1200;
        var ch = containerEl ? containerEl.clientHeight : 700;
        panX = cw / 2 - (target.x + target.w / 2) * zoom;
        panY = ch / 2 - (target.y + target.h / 2) * zoom;
    }

    /* ====================================================================
     * P5.JS SKETCH (instance mode)
     * ==================================================================== */

    function createSketch(parent) {
        containerEl = parent;

        var sketch = function(p) {
            p5inst = p;

            p.setup = function() {
                var cw = parent.clientWidth;
                var ch = parent.clientHeight;
                var cnv = p.createCanvas(cw, ch);
                cnv.parent(parent);
                p.textFont('Consolas, Monaco, monospace');
                p.textSize(FONT_SIZE);
                p.frameRate(30);
            };

            p.windowResized = function() {
                var cw = parent.clientWidth;
                var ch = parent.clientHeight;
                p.resizeCanvas(cw, ch);
            };

            /* ---- DRAW ---- */
            p.draw = function() {
                p.background(255);

                p.push();
                p.translate(panX, panY);
                p.scale(zoom);

                // Grid dots
                var gridSize = 40;
                var invZoom = 1 / zoom;
                var vpLeft = -panX * invZoom, vpTop = -panY * invZoom;
                var vpRight = vpLeft + p.width * invZoom, vpBottom = vpTop + p.height * invZoom;

                if (zoom > 0.15) {
                    p.stroke(220, 225, 230);
                    p.strokeWeight(1.5 / zoom);
                    var gx0 = Math.floor(vpLeft / gridSize) * gridSize;
                    var gy0 = Math.floor(vpTop / gridSize) * gridSize;
                    for (var gx = gx0; gx < vpRight; gx += gridSize) {
                        for (var gy = gy0; gy < vpBottom; gy += gridSize) {
                            p.point(gx, gy);
                        }
                    }
                }

                drawLinks(p);
                drawCards(p);

                p.pop();
            };

            /* ---- DRAW LINKS ---- */
            function drawLinks(p) {
                links.forEach(function(lnk) {
                    if (!lnk.visible) return;
                    if (!cardMap[lnk.srcId] || !cardMap[lnk.tgtId]) return;
                    if (!cardMap[lnk.srcId].visible || !cardMap[lnk.tgtId].visible) return;

                    var st = lnk.style;
                    var highlighted = (hoveredLink === lnk) ||
                        (hoveredCard && (lnk.srcId === hoveredCard.id || lnk.tgtId === hoveredCard.id)) ||
                        (focusedCardId && (lnk.srcId === focusedCardId || lnk.tgtId === focusedCardId));

                    var alpha;
                    if (focusDistances && focusedCardId) {
                        var sDist = focusDistances[lnk.srcId] !== undefined ? focusDistances[lnk.srcId] : Infinity;
                        var tDist = focusDistances[lnk.tgtId] !== undefined ? focusDistances[lnk.tgtId] : Infinity;
                        var edgeOpacity = DbRel.distanceToOpacity(Math.max(sDist, tDist));
                        alpha = Math.round(edgeOpacity * 255);
                    } else {
                        var dimmed = focusedCardId && !connectedSet[lnk.srcId] && !connectedSet[lnk.tgtId];
                        alpha = dimmed ? 30 : (highlighted ? 255 : 150);
                    }
                    var sw = highlighted ? st.width * 2 : st.width;

                    p.stroke(st.stroke[0], st.stroke[1], st.stroke[2], alpha);
                    p.strokeWeight(sw / Math.max(zoom, 0.3));
                    p.noFill();

                    if (st.dash.length > 0) {
                        p.drawingContext.setLineDash(st.dash.map(function(d) { return d / Math.max(zoom, 0.3); }));
                    } else {
                        p.drawingContext.setLineDash([]);
                    }

                    var pts = [{ x: lnk.startX, y: lnk.startY }]
                        .concat(lnk.vertices)
                        .concat([{ x: lnk.endX, y: lnk.endY }]);

                    p.beginShape();
                    for (var i = 0; i < pts.length; i++) {
                        p.vertex(pts[i].x, pts[i].y);
                    }
                    p.endShape();

                    // Arrow at end
                    if (pts.length >= 2) {
                        var lp = pts[pts.length - 2], ep = pts[pts.length - 1];
                        var ang = Math.atan2(ep.y - lp.y, ep.x - lp.x);
                        var arrSz = 8 / Math.max(zoom, 0.3);
                        p.drawingContext.setLineDash([]);
                        p.line(ep.x, ep.y, ep.x - arrSz * Math.cos(ang - 0.4), ep.y - arrSz * Math.sin(ang - 0.4));
                        p.line(ep.x, ep.y, ep.x - arrSz * Math.cos(ang + 0.4), ep.y - arrSz * Math.sin(ang + 0.4));
                    }

                    p.drawingContext.setLineDash([]);
                });
            }

            /* ---- DRAW CARDS ---- */
            function drawCards(p) {
                var HDR_H = DbRel.HDR_H;
                var PAD = DbRel.PAD;
                var ROW_H = DbRel.ROW_H;

                cards.forEach(function(c) {
                    if (!c.visible) return;

                    var highlighted = (hoveredCard === c) || connectedSet[c.id];
                    var dimmed = false;
                    var alpha;
                    if (focusDistances && focusedCardId) {
                        var nodeOpacity = DbRel.distanceToOpacity(focusDistances[c.id]);
                        alpha = Math.round(nodeOpacity * 255);
                        dimmed = nodeOpacity < 0.5;
                    } else {
                        dimmed = focusedCardId && !connectedSet[c.id];
                        alpha = dimmed ? 60 : 255;
                    }

                    // Card body
                    p.strokeWeight(highlighted && !dimmed ? 2.5 / zoom : 1 / zoom);
                    p.stroke(c.color.border[0], c.color.border[1], c.color.border[2], alpha);
                    p.fill(c.color.bg[0], c.color.bg[1], c.color.bg[2], alpha);
                    p.rect(c.x, c.y, c.w, c.h, 3);

                    // Header
                    p.noStroke();
                    p.fill(c.color.header[0], c.color.header[1], c.color.header[2], alpha);
                    p.rect(c.x, c.y, c.w, HDR_H, 3, 3, 0, 0);

                    // Focus ring
                    if (c.id === focusedCardId) {
                        p.noFill();
                        p.stroke(233, 69, 96, 200);
                        p.strokeWeight(3 / zoom);
                        p.rect(c.x - 3, c.y - 3, c.w + 6, c.h + 6, 5);
                    }

                    // Text
                    if (zoom > 0.08) {
                        p.noStroke();
                        p.fill(255, 255, 255, alpha);
                        p.textSize(FONT_SIZE);
                        p.textAlign(p.LEFT, p.TOP);
                        var hdrX = c.x + 6;
                        var iconInfo = c.tableName ? DbRel.getTableIconInfo(c.tableName) : null;
                        if (iconInfo && iconInfo.src) {
                            if (!c._iconImg) {
                                c._iconImg = p.loadImage(iconInfo.src);
                            }
                            if (c._iconImg) {
                                p.image(c._iconImg, c.x + 3, c.y + 3, 15, 15);
                            }
                            hdrX = c.x + 20;
                        }
                        var maxHeaderChars = Math.floor((c.w - (hdrX - c.x) - 6) / CHAR_W);
                        var ht = c.headerLabel;
                        if (ht.length > maxHeaderChars) ht = ht.substring(0, maxHeaderChars - 2) + '..';
                        p.text(ht, hdrX, c.y + 5);

                        if (zoom > 0.15) {
                            p.fill(73, 80, 87, alpha);
                            var maxBodyChars = Math.floor((c.w - 12) / CHAR_W);
                            for (var li = 0; li < c.lines.length; li++) {
                                var lt = c.lines[li];
                                if (lt.length > maxBodyChars) lt = lt.substring(0, maxBodyChars - 2) + '..';
                                p.text(lt, c.x + 6, c.y + HDR_H + PAD + li * ROW_H);
                            }
                        }

                        // Pivot icon for pivotable tables
                        var pivotInfo = DbRel.getNodePivotInfo(c.tableKey, c.rowIndex);
                        if (pivotInfo) {
                            p.fill(255, 255, 255, Math.round(alpha * 0.7));
                            p.textSize(FONT_SIZE + 1);
                            p.textAlign(p.CENTER, p.TOP);
                            p.text('\u2316', c.x + c.w - 10, c.y + 4);
                            p.textAlign(p.LEFT, p.TOP);
                            p.textSize(FONT_SIZE);
                        }
                    }
                });
            }

            /* ---- MOUSE EVENTS ---- */
            p.mousePressed = function() {
                if (!isMouseOnCanvas()) return;
                var w = screenToWorld(p.mouseX, p.mouseY);
                var hit = hitTestCards(w.x, w.y);

                if (hit) {
                    // Check if click is in pivot icon area (top-right 20x20 of header)
                    var relX = w.x - hit.x;
                    var relY = w.y - hit.y;
                    if (relX > hit.w - 20 && relY < DbRel.HDR_H) {
                        var pivotInfo = DbRel.getNodePivotInfo(hit.tableKey, hit.rowIndex);
                        if (pivotInfo) {
                            DbRel.pivotTo(hit.tableKey, hit.rowIndex);
                            return;
                        }
                    }

                    var now = Date.now();
                    if (lastClickId === hit.id && (now - lastClickTime) < 400) {
                        DbRel.showRowModal(hit.tableKey, hit.rowIndex);
                        lastClickTime = 0;
                        lastClickId = null;
                        return;
                    }
                    lastClickTime = now;
                    lastClickId = hit.id;
                    dragCard = hit;
                    dragOffX = w.x - hit.x;
                    dragOffY = w.y - hit.y;
                } else {
                    isPanning = true;
                    didPan = false;
                    panStartX = p.mouseX;
                    panStartY = p.mouseY;
                    panOrigX = panX;
                    panOrigY = panY;
                    lastClickId = null;
                }
            };

            p.mouseDragged = function() {
                if (dragCard) {
                    var w = screenToWorld(p.mouseX, p.mouseY);
                    dragCard.x = w.x - dragOffX;
                    dragCard.y = w.y - dragOffY;
                } else if (isPanning) {
                    var dx = p.mouseX - panStartX, dy = p.mouseY - panStartY;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan = true;
                    panX = panOrigX + dx;
                    panY = panOrigY + dy;
                }
            };

            p.mouseReleased = function() {
                if (dragCard) {
                    routeLinks();
                    dragCard = null;
                } else if (isPanning) {
                    isPanning = false;
                    if (!didPan && isMouseOnCanvas()) {
                        var w = screenToWorld(p.mouseX, p.mouseY);
                        var hit = hitTestCards(w.x, w.y);
                        if (!hit && focusedCardId) unfocusNode();
                    }
                }
            };

            p.mouseClicked = function() {
                if (!isMouseOnCanvas()) return;
                if (didPan) return;
                var w = screenToWorld(p.mouseX, p.mouseY);
                var hit = hitTestCards(w.x, w.y);
                if (hit) {
                    if (focusedCardId === hit.id) unfocusNode();
                    else focusNode(hit.id);
                }
            };

            p.mouseMoved = function() {
                if (!isMouseOnCanvas()) {
                    hoveredCard = null;
                    hoveredLink = null;
                    DbRel.hideTooltip();
                    return;
                }
                var w = screenToWorld(p.mouseX, p.mouseY);
                hoveredCard = hitTestCards(w.x, w.y);
                hoveredLink = null;

                if (!hoveredCard) {
                    hoveredLink = hitTestLinks(w.x, w.y);
                    if (hoveredLink && hoveredLink.relData) {
                        DbRel.showTooltip(DbRel.getLinkTooltipHtml(hoveredLink.relData), p.mouseX + containerEl.getBoundingClientRect().left, p.mouseY + containerEl.getBoundingClientRect().top);
                    } else {
                        DbRel.hideTooltip();
                    }
                } else {
                    DbRel.hideTooltip();
                }

                if (hoveredCard) {
                    containerEl.style.cursor = 'pointer';
                } else if (hoveredLink) {
                    containerEl.style.cursor = 'help';
                } else {
                    containerEl.style.cursor = 'grab';
                }
            };

            p.mouseWheel = function(event) {
                if (!isMouseOnCanvas()) return;
                event.preventDefault();
                var wx = (p.mouseX - panX) / zoom;
                var wy = (p.mouseY - panY) / zoom;
                var delta = event.delta > 0 ? -0.05 : 0.05;
                var newZoom = Math.max(0.02, Math.min(3, zoom + delta * zoom));
                panX = p.mouseX - wx * newZoom;
                panY = p.mouseY - wy * newZoom;
                zoom = newZoom;
                DbRel.setZoomSlider(Math.round(zoom * 100));
                return false;
            };

            function isMouseOnCanvas() {
                return p.mouseX >= 0 && p.mouseX < p.width && p.mouseY >= 0 && p.mouseY < p.height;
            }
        };

        new p5(sketch);
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('p5', {
        init: function(el) {
            containerEl = el;
            createSketch(el);
        },
        render: function() {
            buildGraph();
            DbRel.updateSidebar();
        },
        doLayout: function() {
            doLayout();
            fitToScreen();
        },
        setZoom: function(pct) {
            var cw = containerEl ? containerEl.clientWidth : 1200;
            var ch = containerEl ? containerEl.clientHeight : 700;
            var cx = cw / 2, cy = ch / 2;
            var wx = (cx - panX) / zoom, wy = (cy - panY) / zoom;
            zoom = pct / 100;
            panX = cx - wx * zoom;
            panY = cy - wy * zoom;
            DbRel.setZoomSlider(pct);
        },
        getZoom: function() {
            return Math.round(zoom * 100);
        },
        fitToScreen: function() {
            fitToScreen();
        },
        applyFilters: function(dbF, typeF) {
            applyFilters(dbF, typeF);
        },
        focusNode: function(nid) {
            focusNode(nid);
        },
        unfocusNode: function() {
            unfocusNode();
        },
        centerOnTable: function(tk) {
            centerOnTable(tk);
        },
        getStats: function() {
            return {
                nodes: cards.length,
                links: links.length
            };
        },
        resize: function() {
            if (p5inst && containerEl) {
                p5inst.resizeCanvas(containerEl.clientWidth, containerEl.clientHeight);
            }
        },
        highlightTable: function(tk) {
            connectedSet = {};
            cards.forEach(function(c) {
                if (c.tableKey === tk) connectedSet[c.id] = true;
            });
            links.forEach(function(lnk) {
                if (connectedSet[lnk.srcId] || connectedSet[lnk.tgtId]) {
                    connectedSet[lnk.srcId] = true;
                    connectedSet[lnk.tgtId] = true;
                }
            });
            focusedCardId = '__table_highlight__';
        },
        clearHighlightTable: function() {
            if (focusedCardId === '__table_highlight__') {
                focusedCardId = null;
                connectedSet = {};
            }
        },
        destroy: function() {
            if (p5inst) {
                p5inst.remove();
                p5inst = null;
            }
            cards = []; links = []; cardMap = {};
            focusedCardId = null; savedPositions = {}; connectedSet = {}; focusDistances = null;
            hoveredCard = null; hoveredLink = null;
            panX = 0; panY = 0; zoom = 1;
            containerEl = null;
        }
    });

})();
