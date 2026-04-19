/**
 * Database Relationships - D3.js v7 Renderer
 * Pure SVG rendering with D3 zoom/drag behaviors and orthogonal link routing.
 * Registers with DbRel shared shell via DbRel.registerRenderer('d3', ...).
 * @author Joe Huss <detain@interserver.net>
 * @copyright 2025
 */
(function() {
    'use strict';

    var svg, gRoot, gLinks, gCards, gLabels;
    var zoomBehavior;
    var zoomLevel = 100;
    var containerEl = null;
    var focusedNodeId = null;
    var savedPositions = {};
    var didPan = false;

    // Internal node/link arrays
    var nodes = [];
    var links = [];
    var nodeMap = {};

    // ========================================================================
    // LINK ROUTING - orthogonal with collision avoidance & corridor lanes
    // ========================================================================

    function routeLinksWithLanes() {
        var LANE_GAP = 6;
        var EXIT_PAD = 15;
        var BOX_PAD = 8;
        var CORNER_R = 8;

        var allBounds = [];
        var boundsMap = {};
        nodes.forEach(function(n) {
            var b = {
                id: n.id, x: n.x, y: n.y, w: n.w, h: n.h,
                cx: n.x + n.w / 2, cy: n.y + n.h / 2,
                r: n.x + n.w, b: n.y + n.h
            };
            boundsMap[n.id] = b;
            allBounds.push(b);
        });

        var sourceGroups = {}, targetGroups = {};
        links.forEach(function(link) {
            if (!boundsMap[link.source] || !boundsMap[link.target]) return;
            if (!sourceGroups[link.source]) sourceGroups[link.source] = [];
            sourceGroups[link.source].push(link);
            if (!targetGroups[link.target]) targetGroups[link.target] = [];
            targetGroups[link.target].push(link);
        });

        Object.keys(sourceGroups).forEach(function(sId) {
            sourceGroups[sId].sort(function(a, b) {
                var aB = boundsMap[a.target], bB = boundsMap[b.target];
                return (aB ? aB.cy : 0) - (bB ? bB.cy : 0);
            });
        });
        Object.keys(targetGroups).forEach(function(tId) {
            targetGroups[tId].sort(function(a, b) {
                var aB = boundsMap[a.source], bB = boundsMap[b.source];
                return (aB ? aB.cy : 0) - (bB ? bB.cy : 0);
            });
        });

        function corridorHitsBox(cx, yMin, yMax, skipIds) {
            for (var i = 0; i < allBounds.length; i++) {
                var b = allBounds[i];
                if (skipIds[b.id]) continue;
                if (cx >= b.x - BOX_PAD && cx <= b.r + BOX_PAD &&
                    yMin <= b.b + BOX_PAD && yMax >= b.y - BOX_PAD) {
                    return true;
                }
            }
            return false;
        }

        function findClearCorridorX(idealX, yMin, yMax, skipIds) {
            if (!corridorHitsBox(idealX, yMin, yMax, skipIds)) return idealX;
            for (var offset = 10; offset < 500; offset += 8) {
                if (!corridorHitsBox(idealX + offset, yMin, yMax, skipIds)) return idealX + offset;
                if (!corridorHitsBox(idealX - offset, yMin, yMax, skipIds)) return idealX - offset;
            }
            return idealX;
        }

        function horizontalHitsBox(hy, xMin, xMax, skipIds) {
            for (var i = 0; i < allBounds.length; i++) {
                var b = allBounds[i];
                if (skipIds[b.id]) continue;
                if (hy >= b.y - BOX_PAD && hy <= b.b + BOX_PAD &&
                    xMin <= b.r + BOX_PAD && xMax >= b.x - BOX_PAD) {
                    return true;
                }
            }
            return false;
        }

        function findClearHorizontalY(idealY, xMin, xMax, skipIds) {
            if (!horizontalHitsBox(idealY, xMin, xMax, skipIds)) return idealY;
            for (var offset = 8; offset < 300; offset += 6) {
                if (!horizontalHitsBox(idealY - offset, xMin, xMax, skipIds)) return idealY - offset;
                if (!horizontalHitsBox(idealY + offset, xMin, xMax, skipIds)) return idealY + offset;
            }
            return idealY;
        }

        var corridorLanes = {};

        links.forEach(function(link) {
            var sB = boundsMap[link.source], tB = boundsMap[link.target];
            if (!sB || !tB) { link.vertices = []; link.pathData = ''; return; }

            var skipSource = {}; skipSource[link.source] = true;
            var skipTarget = {}; skipTarget[link.target] = true;
            var skipBoth = {}; skipBoth[link.source] = true; skipBoth[link.target] = true;

            var sGroup = sourceGroups[link.source] || [link];
            var tGroup = targetGroups[link.target] || [link];
            var sIdx = sGroup.indexOf(link);
            var tIdx = tGroup.indexOf(link);

            var sSpread = Math.min(sB.h * 0.8, sGroup.length * LANE_GAP);
            var sStep = sGroup.length > 1 ? sSpread / (sGroup.length - 1) : 0;
            var exitY = sB.cy + (sIdx - (sGroup.length - 1) / 2) * sStep;

            var tSpread = Math.min(tB.h * 0.8, tGroup.length * LANE_GAP);
            var tStep = tGroup.length > 1 ? tSpread / (tGroup.length - 1) : 0;
            var enterY = tB.cy + (tIdx - (tGroup.length - 1) / 2) * tStep;

            var sideCombos = [
                { exitSide: 'right', enterSide: 'left',  exitX: sB.r,  enterX: tB.x },
                { exitSide: 'right', enterSide: 'right', exitX: sB.r,  enterX: tB.r },
                { exitSide: 'left',  enterSide: 'left',  exitX: sB.x,  enterX: tB.x },
                { exitSide: 'left',  enterSide: 'right', exitX: sB.x,  enterX: tB.r }
            ];

            var bestCombo = null, bestScore = Infinity;
            sideCombos.forEach(function(combo) {
                var ex = combo.exitX, en = combo.enterX;
                var padX1 = combo.exitSide === 'right' ? ex + EXIT_PAD : ex - EXIT_PAD;
                var padX2 = combo.enterSide === 'left' ? en - EXIT_PAD : en + EXIT_PAD;
                var midX = (padX1 + padX2) / 2;

                var exitThruSelf = (combo.exitSide === 'left' && midX > sB.x) ||
                                   (combo.exitSide === 'right' && midX < sB.r);
                var enterThruSelf = (combo.enterSide === 'right' && midX < tB.r) ||
                                    (combo.enterSide === 'left' && midX > tB.x);
                if (exitThruSelf || enterThruSelf) return;

                var dist = Math.abs(ex - en) + Math.abs(exitY - enterY);
                if (dist < bestScore) { bestScore = dist; bestCombo = combo; }
            });

            if (!bestCombo) {
                bestCombo = sB.cx < tB.cx
                    ? { exitSide: 'right', enterSide: 'left', exitX: sB.r, enterX: tB.x }
                    : { exitSide: 'left', enterSide: 'right', exitX: sB.x, enterX: tB.r };
            }

            var exitX = bestCombo.exitX;
            var enterX = bestCombo.enterX;
            var padX1 = bestCombo.exitSide === 'right' ? exitX + EXIT_PAD : exitX - EXIT_PAD;
            var padX2 = bestCombo.enterSide === 'left' ? enterX - EXIT_PAD : enterX + EXIT_PAD;

            var idealCorridorX = (padX1 + padX2) / 2;
            var corridorKey = Math.round(idealCorridorX / 40) * 40;
            if (!corridorLanes[corridorKey]) corridorLanes[corridorKey] = 0;
            var laneNum = corridorLanes[corridorKey]++;
            var laneIdealX = idealCorridorX + (laneNum - corridorLanes[corridorKey] / 2) * LANE_GAP;

            var routeYMin = Math.min(exitY, enterY);
            var routeYMax = Math.max(exitY, enterY);
            var laneX = findClearCorridorX(laneIdealX, routeYMin, routeYMax, skipBoth);

            var vertices;
            if (Math.abs(exitY - enterY) < 3 && Math.abs(exitX - enterX) > 20) {
                var straightY = findClearHorizontalY(exitY, Math.min(exitX, enterX), Math.max(exitX, enterX), skipBoth);
                if (Math.abs(straightY - exitY) < 3) {
                    vertices = [{ x: exitX, y: exitY }, { x: enterX, y: enterY }];
                } else {
                    vertices = [
                        { x: exitX, y: exitY }, { x: padX1, y: exitY },
                        { x: padX1, y: straightY }, { x: padX2, y: straightY },
                        { x: padX2, y: enterY }, { x: enterX, y: enterY }
                    ];
                }
            } else {
                var clearExitY = findClearHorizontalY(exitY, Math.min(padX1, laneX), Math.max(padX1, laneX), skipSource);
                var clearEnterY = findClearHorizontalY(enterY, Math.min(laneX, padX2), Math.max(laneX, padX2), skipTarget);
                vertices = [
                    { x: exitX, y: exitY }, { x: padX1, y: clearExitY },
                    { x: laneX, y: clearExitY }, { x: laneX, y: clearEnterY },
                    { x: padX2, y: clearEnterY }, { x: enterX, y: enterY }
                ];
            }

            link.vertices = vertices;
            link.pathData = buildRoundedPath(vertices, CORNER_R);
        });
    }

    function buildRoundedPath(pts, radius) {
        if (!pts || pts.length < 2) return '';
        if (pts.length === 2) {
            return 'M' + pts[0].x + ',' + pts[0].y + 'L' + pts[1].x + ',' + pts[1].y;
        }
        var d = 'M' + pts[0].x + ',' + pts[0].y;
        for (var i = 1; i < pts.length - 1; i++) {
            var prev = pts[i - 1];
            var curr = pts[i];
            var next = pts[i + 1];
            var dx1 = prev.x - curr.x, dy1 = prev.y - curr.y;
            var dx2 = next.x - curr.x, dy2 = next.y - curr.y;
            var len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            var len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            if (len1 === 0 || len2 === 0) {
                d += 'L' + curr.x + ',' + curr.y;
                continue;
            }
            var r = Math.min(radius, len1 / 2, len2 / 2);
            var x1 = curr.x + (dx1 / len1) * r;
            var y1 = curr.y + (dy1 / len1) * r;
            var x2 = curr.x + (dx2 / len2) * r;
            var y2 = curr.y + (dy2 / len2) * r;
            d += 'L' + x1 + ',' + y1;
            d += 'Q' + curr.x + ',' + curr.y + ',' + x2 + ',' + y2;
        }
        d += 'L' + pts[pts.length - 1].x + ',' + pts[pts.length - 1].y;
        return d;
    }

    // ========================================================================
    // BUILD NODES & LINKS
    // ========================================================================

    function buildGraph() {
        if (!DbRel.data) return;
        savedPositions = {};
        focusedNodeId = null;
        nodes = [];
        links = [];
        nodeMap = {};

        if (DbRel.displayMode === 'grouped') {
            buildGrouped();
        } else {
            buildSeparate();
        }

        doLayout();
        routeLinksWithLanes();
        renderAll();
        setTimeout(function() {
            fitToScreen();
            DbRel.updateSidebar();
        }, 50);
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

                var node = {
                    id: nodeId, tableKey: tableKey, dbName: dbName, tableName: tableName,
                    rowIndex: ri, x: 0, y: 0, w: size.w, h: size.h,
                    headerLabel: header, textLines: lines, colors: colors
                };
                nodes.push(node);
                nodeMap[nodeId] = node;
            });
        });

        // Build links from relationship matches
        DbRel.data.relationships.forEach(function(rel) {
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                if (!nodeMap[srcNodeId]) return;
                match[1].forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    if (!nodeMap[tgtNodeId]) return;
                    links.push({
                        id: srcNodeId + '->' + tgtNodeId + ':' + rel.source_field,
                        source: srcNodeId, target: tgtNodeId,
                        relType: rel.type, relLabel: rel.label,
                        relData: rel, vertices: [], style: style,
                        labelText: rel.source_field + '\u2192' + rel.target_field
                    });
                });
            });
        });
    }

    function buildGrouped() {
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);
            var tableInfo = DbRel.data.tables[tableKey];
            var headerLabel = tableName + ' (' + tableInfo.total + ')';

            var node = {
                id: tableKey, tableKey: tableKey, dbName: dbName, tableName: tableName,
                rowIndex: 0, x: 0, y: 0, w: size.w, h: size.h,
                headerLabel: headerLabel, textLines: lines, colors: colors
            };
            nodes.push(node);
            nodeMap[tableKey] = node;
        });

        // One link per relationship in grouped mode
        DbRel.data.relationships.forEach(function(rel) {
            if (!nodeMap[rel.source] || !nodeMap[rel.target]) return;
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            links.push({
                id: rel.source + '->' + rel.target + ':' + rel.source_field,
                source: rel.source, target: rel.target,
                relType: rel.type, relLabel: rel.label,
                relData: rel, vertices: [], style: style,
                labelText: rel.label,
                cardinality: rel.cardinality
            });
        });
    }

    // ========================================================================
    // LAYOUT (delegates to shared DbRel.computeLayout)
    // ========================================================================

    function doLayout() {
        var wrap = containerEl;
        var cW = wrap ? wrap.clientWidth : 1200;
        var cH = wrap ? wrap.clientHeight : 700;
        var positions = DbRel.computeLayout(cW, cH);

        nodes.forEach(function(node) {
            var pos = positions[node.id];
            if (pos) {
                node.x = pos.x;
                node.y = pos.y;
            }
        });
    }

    // ========================================================================
    // RENDERING
    // ========================================================================

    function renderAll() {
        gLinks.selectAll('*').remove();
        gCards.selectAll('*').remove();
        gLabels.selectAll('*').remove();

        renderLinks();
        renderCards();
        renderLinkLabels();
    }

    function renderLinks() {
        var linkGroups = gLinks.selectAll('.link-group')
            .data(links, function(d) { return d.id; })
            .enter()
            .append('g')
            .attr('class', 'link-group')
            .attr('data-source', function(d) { return d.source; })
            .attr('data-target', function(d) { return d.target; })
            .attr('data-reltype', function(d) { return d.relType; });

        // Invisible hit area for hover
        linkGroups.append('path')
            .attr('class', 'db-link-hitarea')
            .attr('d', function(d) { return d.pathData; })
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('fill', 'none');

        // Visible link
        linkGroups.append('path')
            .attr('class', 'db-link')
            .attr('d', function(d) { return d.pathData; })
            .attr('stroke', function(d) { return d.style.stroke; })
            .attr('stroke-width', function(d) { return d.style.strokeWidth; })
            .attr('stroke-dasharray', function(d) { return d.style.strokeDasharray; })
            .attr('fill', 'none');

        // Arrow at target end
        linkGroups.each(function(d) {
            var g = d3.select(this);
            if (d.vertices.length < 2) return;
            var last = d.vertices[d.vertices.length - 1];
            var prev = d.vertices[d.vertices.length - 2];
            var angle = Math.atan2(last.y - prev.y, last.x - prev.x);
            var arrowSize = 6;
            var ax1 = last.x - arrowSize * Math.cos(angle - Math.PI / 6);
            var ay1 = last.y - arrowSize * Math.sin(angle - Math.PI / 6);
            var ax2 = last.x - arrowSize * Math.cos(angle + Math.PI / 6);
            var ay2 = last.y - arrowSize * Math.sin(angle + Math.PI / 6);

            g.append('path')
                .attr('class', 'link-arrow')
                .attr('d', 'M' + ax1 + ',' + ay1 + 'L' + last.x + ',' + last.y + 'L' + ax2 + ',' + ay2)
                .attr('stroke', d.style.stroke)
                .attr('stroke-width', 1)
                .attr('fill', 'none');

            // Cardinality markers for grouped mode
            if (d.cardinality) {
                var targetMany = d.cardinality.split(':')[1] === 'N' || d.cardinality.split(':')[1] === 'M';
                var sourceMany = d.cardinality === 'M:N' || d.cardinality === 'N:1';

                if (targetMany) {
                    var ax3 = last.x - (arrowSize + 5) * Math.cos(angle - Math.PI / 6);
                    var ay3 = last.y - (arrowSize + 5) * Math.sin(angle - Math.PI / 6);
                    var ax4 = last.x - 5 * Math.cos(angle);
                    var ay4 = last.y - 5 * Math.sin(angle);
                    var ax5 = last.x - (arrowSize + 5) * Math.cos(angle + Math.PI / 6);
                    var ay5 = last.y - (arrowSize + 5) * Math.sin(angle + Math.PI / 6);
                    g.append('path')
                        .attr('d', 'M' + ax3 + ',' + ay3 + 'L' + ax4 + ',' + ay4 + 'L' + ax5 + ',' + ay5)
                        .attr('stroke', d.style.stroke)
                        .attr('stroke-width', 1)
                        .attr('fill', 'none');
                }

                if (sourceMany) {
                    var first = d.vertices[0];
                    var sec = d.vertices[1];
                    var sAngle = Math.atan2(first.y - sec.y, first.x - sec.x);
                    var sx1 = first.x - arrowSize * Math.cos(sAngle - Math.PI / 6);
                    var sy1 = first.y - arrowSize * Math.sin(sAngle - Math.PI / 6);
                    var sx2 = first.x - arrowSize * Math.cos(sAngle + Math.PI / 6);
                    var sy2 = first.y - arrowSize * Math.sin(sAngle + Math.PI / 6);
                    g.append('path')
                        .attr('d', 'M' + sx1 + ',' + sy1 + 'L' + first.x + ',' + first.y + 'L' + sx2 + ',' + sy2)
                        .attr('stroke', d.style.stroke)
                        .attr('stroke-width', 1)
                        .attr('fill', 'none');
                }
            }
        });

        // Link hover events
        linkGroups
            .on('mouseenter', function(event, d) {
                if (focusedNodeId) return;
                d3.select(this).select('.db-link').classed('db-link-highlight', true);
                gCards.selectAll('.db-card').each(function(cd) {
                    if (cd.id === d.source || cd.id === d.target) {
                        d3.select(this).classed('db-card-highlight', true);
                    }
                });
                if (d.relData) {
                    DbRel.showTooltip(DbRel.getLinkTooltipHtml(d.relData), event.clientX, event.clientY);
                }
            })
            .on('mousemove', function(event) {
                DbRel.showTooltip(null, event.clientX, event.clientY);
                var tip = document.getElementById('db-rel-tooltip');
                if (tip) tip.style.left = (event.clientX + 12) + 'px';
                if (tip) tip.style.top = (event.clientY + 12) + 'px';
            })
            .on('mouseleave', function() {
                DbRel.hideTooltip();
                if (!focusedNodeId) clearHighlights();
            });
    }

    function renderLinkLabels() {
        links.forEach(function(link) {
            if (!link.vertices || link.vertices.length < 2) return;
            var midIdx = Math.floor(link.vertices.length / 2);
            var p1 = link.vertices[midIdx - 1] || link.vertices[0];
            var p2 = link.vertices[midIdx];
            var mx = (p1.x + p2.x) / 2;
            var my = (p1.y + p2.y) / 2;

            var labelG = gLabels.append('g')
                .attr('class', 'link-label-group')
                .attr('data-link-id', link.id);

            var textLen = (link.labelText || '').length * 4 + 8;
            labelG.append('rect')
                .attr('class', 'link-label-bg')
                .attr('x', mx - textLen / 2)
                .attr('y', my - 6)
                .attr('width', textLen)
                .attr('height', 12)
                .attr('rx', 2)
                .attr('ry', 2)
                .attr('fill', 'rgba(255,255,255,0.85)')
                .attr('stroke', 'none');

            labelG.append('text')
                .attr('class', 'link-label')
                .attr('x', mx)
                .attr('y', my + 3)
                .attr('text-anchor', 'middle')
                .attr('fill', link.style.stroke)
                .attr('font-size', '8px')
                .attr('font-family', 'sans-serif')
                .text(link.labelText || '');
        });
    }

    function renderCards() {
        var HDR_H = DbRel.HDR_H;
        var PAD = DbRel.PAD;
        var ROW_H = DbRel.ROW_H;

        var cardGroups = gCards.selectAll('.db-card')
            .data(nodes, function(d) { return d.id; })
            .enter()
            .append('g')
            .attr('class', 'db-card')
            .attr('data-id', function(d) { return d.id; })
            .attr('data-table', function(d) { return d.tableKey; })
            .attr('data-db', function(d) { return d.dbName; })
            .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });

        // Body rect
        cardGroups.append('rect')
            .attr('class', 'card-body-rect')
            .attr('width', function(d) { return d.w; })
            .attr('height', function(d) { return d.h; })
            .attr('fill', function(d) { return d.colors.bg; })
            .attr('stroke', function(d) { return d.colors.border; })
            .attr('stroke-width', 1)
            .attr('rx', 3).attr('ry', 3);

        // Header rect
        cardGroups.append('rect')
            .attr('class', 'card-header-rect')
            .attr('width', function(d) { return d.w; })
            .attr('height', HDR_H)
            .attr('fill', function(d) { return d.colors.header; })
            .attr('rx', 3).attr('ry', 3);

        // Header mask (square bottom corners)
        cardGroups.append('rect')
            .attr('class', 'card-header-mask')
            .attr('width', function(d) { return d.w; })
            .attr('height', 10)
            .attr('y', 12)
            .attr('fill', function(d) { return d.colors.header; });

        // Table icon in header
        cardGroups.each(function(d) {
            var iconInfo = DbRel.getTableIconInfo(d.tableName);
            if (iconInfo && iconInfo.src) {
                d3.select(this).append('image')
                    .attr('class', 'header-icon')
                    .attr('xlink:href', iconInfo.src)
                    .attr('x', 3).attr('y', 3)
                    .attr('width', 16).attr('height', 16);
            }
        });

        // Header text
        cardGroups.append('text')
            .attr('class', 'header-text')
            .attr('x', function(d) { return DbRel.getTableIconInfo(d.tableName) ? 22 : 6; })
            .attr('y', 15)
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('font-family', 'monospace')
            .attr('fill', '#fff')
            .text(function(d) { return d.headerLabel; });

        // Row text lines
        cardGroups.each(function(d) {
            var g = d3.select(this);
            d.textLines.forEach(function(line, i) {
                g.append('text')
                    .attr('class', 'row-text')
                    .attr('x', 6)
                    .attr('y', HDR_H + PAD + (i + 1) * ROW_H)
                    .attr('font-size', '9.5px')
                    .attr('font-family', 'monospace')
                    .attr('fill', '#495057')
                    .text(line);
            });

            // Pivot icon for pivotable tables
            var pivotInfo = DbRel.getNodePivotInfo(d.tableKey, d.rowIndex);
            if (pivotInfo) {
                g.append('text')
                    .attr('class', 'pivot-icon')
                    .attr('x', d.w - 14)
                    .attr('y', 15)
                    .attr('font-size', '11px')
                    .attr('font-family', 'sans-serif')
                    .attr('fill', '#fff')
                    .attr('cursor', 'pointer')
                    .attr('pointer-events', 'all')
                    .attr('opacity', 0.6)
                    .text('\u2316')
                    .on('mouseenter', function() { d3.select(this).attr('opacity', 1); })
                    .on('mouseleave', function() { d3.select(this).attr('opacity', 0.6); })
                    .on('click', function(event) {
                        event.stopPropagation();
                        DbRel.pivotTo(d.tableKey, d.rowIndex);
                    });
            }
        });

        // Setup drag behavior
        var drag = d3.drag()
            .on('start', function(event, d) {
                d._dragStartX = d.x;
                d._dragStartY = d.y;
                d._dragged = false;
            })
            .on('drag', function(event, d) {
                d.x += event.dx;
                d.y += event.dy;
                d._dragged = true;
                d3.select(this).attr('transform', 'translate(' + d.x + ',' + d.y + ')');
                updateLinksForNode(d.id);
            })
            .on('end', function(event, d) {
                if (d._dragged) {
                    routeLinksWithLanes();
                    updateAllLinkPaths();
                }
            });

        cardGroups.call(drag);

        // Card interactions
        cardGroups
            .on('mouseenter', function(event, d) {
                if (focusedNodeId) return;
                d3.select(this).classed('db-card-highlight', true);
                links.forEach(function(link) {
                    if (link.source === d.id || link.target === d.id) {
                        gLinks.selectAll('.link-group').each(function(ld) {
                            if (ld.id === link.id) {
                                d3.select(this).select('.db-link').classed('db-link-highlight', true);
                            }
                        });
                        var otherId = link.source === d.id ? link.target : link.source;
                        gCards.selectAll('.db-card').each(function(cd) {
                            if (cd.id === otherId) {
                                d3.select(this).classed('db-card-highlight', true);
                            }
                        });
                    }
                });
            })
            .on('mouseleave', function() {
                if (focusedNodeId) return;
                clearHighlights();
            })
            .on('click', function(event, d) {
                event.stopPropagation();
                if (d._dragged) { d._dragged = false; return; }
                if (focusedNodeId === d.id) {
                    unfocusNode();
                } else {
                    focusNode(d.id);
                }
            })
            .on('dblclick', function(event, d) {
                event.stopPropagation();
                if (d.tableKey && DbRel.data && DbRel.data.tables[d.tableKey]) {
                    DbRel.showRowModal(d.tableKey, d.rowIndex);
                }
            });
    }

    function updateLinksForNode(nodeId) {
        var node = nodeMap[nodeId];
        if (!node) return;
        links.forEach(function(link) {
            if (link.source !== nodeId && link.target !== nodeId) return;
            var sN = nodeMap[link.source], tN = nodeMap[link.target];
            if (!sN || !tN) return;
            var sx = sN.x + sN.w, sy = sN.y + sN.h / 2;
            var tx = tN.x, ty = tN.y + tN.h / 2;
            if (sN.x > tN.x + tN.w) { sx = sN.x; tx = tN.x + tN.w; }
            var midX = (sx + tx) / 2;
            link.pathData = 'M' + sx + ',' + sy + 'C' + midX + ',' + sy + ',' + midX + ',' + ty + ',' + tx + ',' + ty;
        });
        gLinks.selectAll('.link-group').each(function(d) {
            if (d.source === nodeId || d.target === nodeId) {
                d3.select(this).select('.db-link').attr('d', d.pathData);
                d3.select(this).select('.db-link-hitarea').attr('d', d.pathData);
            }
        });
    }

    function updateAllLinkPaths() {
        gLinks.selectAll('.link-group').each(function(d) {
            d3.select(this).select('.db-link').attr('d', d.pathData);
            d3.select(this).select('.db-link-hitarea').attr('d', d.pathData);
            // Rebuild arrow
            d3.select(this).select('.link-arrow').remove();
            if (d.vertices && d.vertices.length >= 2) {
                var last = d.vertices[d.vertices.length - 1];
                var prev = d.vertices[d.vertices.length - 2];
                var angle = Math.atan2(last.y - prev.y, last.x - prev.x);
                var arrowSize = 6;
                var ax1 = last.x - arrowSize * Math.cos(angle - Math.PI / 6);
                var ay1 = last.y - arrowSize * Math.sin(angle - Math.PI / 6);
                var ax2 = last.x - arrowSize * Math.cos(angle + Math.PI / 6);
                var ay2 = last.y - arrowSize * Math.sin(angle + Math.PI / 6);
                d3.select(this).append('path')
                    .attr('class', 'link-arrow')
                    .attr('d', 'M' + ax1 + ',' + ay1 + 'L' + last.x + ',' + last.y + 'L' + ax2 + ',' + ay2)
                    .attr('stroke', d.style.stroke)
                    .attr('stroke-width', 1)
                    .attr('fill', 'none');
            }
        });
        gLabels.selectAll('*').remove();
        renderLinkLabels();
    }

    // ========================================================================
    // ZOOM / FIT
    // ========================================================================

    function setZoom(pct) {
        zoomLevel = Math.max(5, Math.min(300, pct));
        var scale = zoomLevel / 100;
        var currentTransform = d3.zoomTransform(svg.node());
        var newTransform = d3.zoomIdentity
            .translate(currentTransform.x, currentTransform.y)
            .scale(scale);
        svg.call(zoomBehavior.transform, newTransform);
        DbRel.setZoomSlider(zoomLevel);
    }

    function fitToScreen() {
        if (!nodes.length) return;
        if (!containerEl) return;
        var ww = containerEl.clientWidth;
        var wh = containerEl.clientHeight;

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(function(n) {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + n.w > maxX) maxX = n.x + n.w;
            if (n.y + n.h > maxY) maxY = n.y + n.h;
        });

        var contentW = maxX - minX;
        var contentH = maxY - minY;
        if (contentW <= 0 || contentH <= 0) return;

        var pad = 40;
        var scaleX = (ww - pad * 2) / contentW;
        var scaleY = (wh - pad * 2) / contentH;
        var scale = Math.min(scaleX, scaleY, 1.5);
        scale = Math.max(scale, 0.02);

        var tx = (ww - contentW * scale) / 2 - minX * scale;
        var ty = (wh - contentH * scale) / 2 - minY * scale;

        var transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        svg.transition().duration(300).call(zoomBehavior.transform, transform);

        zoomLevel = Math.round(scale * 100);
        DbRel.setZoomSlider(zoomLevel);
    }

    // ========================================================================
    // FOCUS / HIGHLIGHT
    // ========================================================================

    function focusNode(elId) {
        if (focusedNodeId && focusedNodeId !== elId) {
            restorePositions();
        }

        focusedNodeId = elId;
        clearHighlights();

        var focusN = nodeMap[elId];
        if (!focusN) return;

        // Find connected node IDs
        var connectedIds = {};
        connectedIds[elId] = true;
        links.forEach(function(link) {
            if (link.source === elId || link.target === elId) {
                connectedIds[link.source] = true;
                connectedIds[link.target] = true;
            }
        });

        // Save positions and compute ring layout around focused node
        var centerX = focusN.x + focusN.w / 2;
        var centerY = focusN.y + focusN.h / 2;

        var neighbors = nodes.filter(function(n) {
            return n.id !== elId && connectedIds[n.id];
        });

        savedPositions = {};
        neighbors.forEach(function(n) {
            savedPositions[n.id] = { x: n.x, y: n.y };
        });

        var radius = Math.max(200, neighbors.length * 30);
        var angleStep = (2 * Math.PI) / Math.max(neighbors.length, 1);
        neighbors.forEach(function(n, i) {
            var angle = -Math.PI / 2 + i * angleStep;
            n.x = centerX + radius * Math.cos(angle) - n.w / 2;
            n.y = centerY + radius * Math.sin(angle) - n.h / 2;
        });

        // Update card positions
        gCards.selectAll('.db-card').each(function(d) {
            d3.select(this).attr('transform', 'translate(' + d.x + ',' + d.y + ')');
        });

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(elId);

        gCards.selectAll('.db-card').each(function(d) {
            var dist = distances[d.id];
            var opacity = DbRel.distanceToOpacity(dist);
            d3.select(this).classed('db-card-highlight', dist !== undefined && dist <= 1)
                .classed('db-card-dimmed', false)
                .style('opacity', opacity);
        });

        gLinks.selectAll('.link-group').each(function(d) {
            var sDist = distances[d.source] !== undefined ? distances[d.source] : Infinity;
            var tDist = distances[d.target] !== undefined ? distances[d.target] : Infinity;
            var edgeDist = Math.max(sDist, tDist);
            var edgeOpacity = DbRel.distanceToOpacity(edgeDist);
            var isDirectlyConnected = d.source === elId || d.target === elId;
            d3.select(this).select('.db-link').classed('db-link-highlight', isDirectlyConnected);
            d3.select(this).classed('db-link-group-dimmed', false)
                .style('opacity', edgeOpacity);
        });

        // Re-route and update
        routeLinksWithLanes();
        updateAllLinkPaths();

        // Center and zoom to the cluster
        var allConnected = [focusN].concat(neighbors);
        var bbox = computeBBox(allConnected);
        var ww = containerEl ? containerEl.clientWidth : 1200;
        var wh = containerEl ? containerEl.clientHeight : 700;
        var padded = { x: bbox.x - 40, y: bbox.y - 40, w: bbox.w + 80, h: bbox.h + 80 };
        var scX = ww / padded.w;
        var scY = wh / padded.h;
        var newScale = Math.min(scX, scY, 1.5);
        newScale = Math.max(newScale, 0.1);

        var tx = ww / 2 - (bbox.x + bbox.w / 2) * newScale;
        var ty = wh / 2 - (bbox.y + bbox.h / 2) * newScale;

        var transform = d3.zoomIdentity.translate(tx, ty).scale(newScale);
        svg.transition().duration(300).call(zoomBehavior.transform, transform);
        zoomLevel = Math.round(newScale * 100);
        DbRel.setZoomSlider(zoomLevel);
    }

    function unfocusNode() {
        restorePositions();
        focusedNodeId = null;
        clearHighlights();

        gCards.selectAll('.db-card-dimmed').classed('db-card-dimmed', false);
        gCards.selectAll('.db-card').style('opacity', null);
        gLinks.selectAll('.db-link-group-dimmed').classed('db-link-group-dimmed', false);
        gLinks.selectAll('.link-group').style('opacity', null);

        gCards.selectAll('.db-card').each(function(d) {
            d3.select(this).attr('transform', 'translate(' + d.x + ',' + d.y + ')');
        });

        routeLinksWithLanes();
        updateAllLinkPaths();
    }

    function restorePositions() {
        Object.keys(savedPositions).forEach(function(id) {
            var node = nodeMap[id];
            if (node) {
                node.x = savedPositions[id].x;
                node.y = savedPositions[id].y;
            }
        });
        savedPositions = {};
    }

    function computeBBox(nodeList) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodeList.forEach(function(n) {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + n.w > maxX) maxX = n.x + n.w;
            if (n.y + n.h > maxY) maxY = n.y + n.h;
        });
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    function clearHighlights() {
        gCards.selectAll('.db-card-highlight').classed('db-card-highlight', false);
        gLinks.selectAll('.db-link-highlight').classed('db-link-highlight', false);
    }

    // ========================================================================
    // FILTERS
    // ========================================================================

    function applyFilters(dbF, typeF) {
        gCards.selectAll('.db-card').each(function(d) {
            var visible = dbF[d.dbName] !== false;
            d3.select(this).style('display', visible ? null : 'none');
        });

        gLinks.selectAll('.link-group').each(function(d) {
            var rd = d.relData;
            if (!rd) return;
            var vis = typeF[d.relType] !== false &&
                      dbF[rd.source.split('.')[0]] !== false &&
                      dbF[rd.target.split('.')[0]] !== false;
            d3.select(this).style('display', vis ? null : 'none');
        });

        gLabels.selectAll('.link-label-group').each(function() {
            var linkId = d3.select(this).attr('data-link-id');
            var link = links.find(function(l) { return l.id === linkId; });
            if (!link) return;
            var rd = link.relData;
            if (!rd) return;
            var vis = typeF[link.relType] !== false &&
                      dbF[rd.source.split('.')[0]] !== false &&
                      dbF[rd.target.split('.')[0]] !== false;
            d3.select(this).style('display', vis ? null : 'none');
        });
    }

    // ========================================================================
    // CENTER ON TABLE
    // ========================================================================

    function centerOnTable(tableKey) {
        var targetNode = null;
        if (DbRel.displayMode === 'grouped') {
            targetNode = nodeMap[tableKey];
        } else {
            targetNode = nodeMap[tableKey + ':0'];
        }
        if (!targetNode) return;

        var ww = containerEl ? containerEl.clientWidth : 1200;
        var wh = containerEl ? containerEl.clientHeight : 700;
        var currentTransform = d3.zoomTransform(svg.node());
        var scale = currentTransform.k;

        var tx = ww / 2 - (targetNode.x + targetNode.w / 2) * scale;
        var ty = wh / 2 - (targetNode.y + targetNode.h / 2) * scale;

        var transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        svg.transition().duration(300).call(zoomBehavior.transform, transform);
    }

    // ========================================================================
    // INIT SVG
    // ========================================================================

    function initSVG() {
        if (!containerEl) return;
        containerEl.innerHTML = '';

        var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.style.display = 'block';
        containerEl.appendChild(svgEl);

        svg = d3.select(svgEl);

        // Setup zoom/pan
        zoomBehavior = d3.zoom()
            .scaleExtent([0.02, 5])
            .on('zoom', function(event) {
                gRoot.attr('transform', event.transform);
                zoomLevel = Math.round(event.transform.k * 100);
                DbRel.setZoomSlider(zoomLevel);
            });

        svg.call(zoomBehavior);

        // Track panning for click vs pan detection
        svg.on('mousedown.pantrack', function() { didPan = false; });
        svg.on('mousemove.pantrack', function() { didPan = true; });

        // Click blank space to unfocus
        svg.on('click', function(event) {
            var t = event.target;
            var isBg = t === svg.node() ||
                       (t.tagName === 'rect' && (t.classList.contains('svg-bg') || t.classList.contains('svg-grid')));
            if (isBg && focusedNodeId && !didPan) unfocusNode();
        });

        gRoot = svg.append('g').attr('class', 'root-group');

        // Grid pattern
        var defs = svg.append('defs');
        var gridPattern = defs.append('pattern')
            .attr('id', 'dbrel-d3-grid-dots')
            .attr('width', 10)
            .attr('height', 10)
            .attr('patternUnits', 'userSpaceOnUse');
        gridPattern.append('circle')
            .attr('cx', 5).attr('cy', 5)
            .attr('r', 0.5)
            .attr('fill', '#e9ecef');

        // Background
        gRoot.append('rect')
            .attr('class', 'svg-bg')
            .attr('x', -50000).attr('y', -50000)
            .attr('width', 100000).attr('height', 100000)
            .attr('fill', '#fff');

        gRoot.append('rect')
            .attr('class', 'svg-grid')
            .attr('x', -50000).attr('y', -50000)
            .attr('width', 100000).attr('height', 100000)
            .attr('fill', 'url(#dbrel-d3-grid-dots)');

        gLinks = gRoot.append('g').attr('class', 'links-layer');
        gLabels = gRoot.append('g').attr('class', 'labels-layer');
        gCards = gRoot.append('g').attr('class', 'cards-layer');
    }

    function resizeSVG() {
        if (!containerEl || !svg) return;
        var rect = containerEl.getBoundingClientRect();
        svg.attr('width', rect.width).attr('height', Math.max(rect.height, 500));
    }

    // ========================================================================
    // REGISTER RENDERER
    // ========================================================================

    DbRel.registerRenderer('d3', {
        init: function(el) {
            containerEl = el;
            initSVG();
        },
        render: function() {
            buildGraph();
        },
        doLayout: function() {
            doLayout();
            routeLinksWithLanes();
            gCards.selectAll('.db-card').each(function(d) {
                d3.select(this).attr('transform', 'translate(' + d.x + ',' + d.y + ')');
            });
            updateAllLinkPaths();
            setTimeout(fitToScreen, 50);
        },
        setZoom: function(pct) { setZoom(pct); },
        getZoom: function() { return zoomLevel; },
        fitToScreen: function() { fitToScreen(); },
        applyFilters: function(dbF, typeF) { applyFilters(dbF, typeF); },
        focusNode: function(nid) { focusNode(nid); },
        unfocusNode: function() { unfocusNode(); },
        centerOnTable: function(tk) { centerOnTable(tk); },
        getStats: function() {
            return {
                nodes: nodes.length,
                links: links.length
            };
        },
        resize: function() { resizeSVG(); },
        highlightTable: function(tk) {
            gCards.selectAll('.db-card').style('opacity', function(d) { return d.tableKey === tk ? 1 : 0.15; });
            gLinks.selectAll('.link-group').style('opacity', function(d) {
                return d.source.indexOf(tk) === 0 || d.target.indexOf(tk) === 0 ? 1 : 0.08;
            });
            gLabels.selectAll('.link-label-group').style('opacity', function(d) {
                return d.source.indexOf(tk) === 0 || d.target.indexOf(tk) === 0 ? 1 : 0.08;
            });
        },
        clearHighlightTable: function() {
            gCards.selectAll('.db-card').style('opacity', null);
            gLinks.selectAll('.link-group').style('opacity', null);
            gLabels.selectAll('.link-label-group').style('opacity', null);
        },
        destroy: function() {
            if (svg) {
                svg.on('.zoom', null);
                svg.on('.pantrack', null);
                svg.on('click', null);
            }
            if (containerEl) containerEl.innerHTML = '';
            svg = null;
            gRoot = null;
            gLinks = null;
            gCards = null;
            gLabels = null;
            zoomBehavior = null;
            nodes = [];
            links = [];
            nodeMap = {};
            focusedNodeId = null;
            savedPositions = {};
            containerEl = null;
        }
    });

})();
