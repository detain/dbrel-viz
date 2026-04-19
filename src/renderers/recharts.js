/**
 * Database Relationships - Recharts Renderer
 * Uses Recharts loaded via dynamic ESM import from esm.sh.
 * Shows database relationship data as multiple chart types:
 * bar charts (rows/columns/relationships per table), pie charts
 * (relationship types, DB distribution, cardinality), and a scatter plot.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var deps = null;
    var containerEl = null;
    var zoomLevel = 100;
    var focusedNodeId = null;
    var rootEl = null;
    var nodeCount = 0;
    var linkCount = 0;
    var loadingEl = null;
    var rerenderFn = null;
    var currentDbFilters = null;
    var currentTypeFilters = null;

    /* ====================================================================
     * DEPENDENCY LOADING
     * ==================================================================== */

    function loadDeps() {
        if (deps) return Promise.resolve(deps);
        // All UMD globals loaded by the shared shell CDN manifest
        // Recharts UMD requires window.React and window.PropTypes
        if (!window.React || !window.ReactDOM) {
            return Promise.reject(new Error('React/ReactDOM UMD globals not loaded'));
        }
        if (!window.Recharts) {
            return Promise.reject(new Error('Recharts UMD global not loaded. Check that prop-types loaded before Recharts.'));
        }
        deps = {
            React: window.React,
            ReactDOM: window.ReactDOM,
            Recharts: window.Recharts
        };
        return Promise.resolve(deps);
    }

    function showLoading() {
        if (!containerEl) return;
        loadingEl = document.createElement('div');
        loadingEl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;z-index:100;font-family:sans-serif;';
        loadingEl.innerHTML = '<div style="font-size:14px;color:#666;margin-bottom:8px;">Loading Recharts library...</div>' +
            '<div style="width:40px;height:40px;border:3px solid #dee2e6;border-top-color:#007bff;border-radius:50%;animation:dbrel-spin 1s linear infinite;margin:0 auto;"></div>';
        if (!document.getElementById('dbrel-spin-style')) {
            var style = document.createElement('style');
            style.id = 'dbrel-spin-style';
            style.textContent = '@keyframes dbrel-spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(style);
        }
        containerEl.appendChild(loadingEl);
    }

    function hideLoading() {
        if (loadingEl && loadingEl.parentNode) {
            loadingEl.parentNode.removeChild(loadingEl);
            loadingEl = null;
        }
    }

    /* ====================================================================
     * INJECT CSS
     * ==================================================================== */

    function injectStyles() {
        if (document.getElementById('dbrel-recharts-styles')) return;
        var style = document.createElement('style');
        style.id = 'dbrel-recharts-styles';
        style.textContent = [
            '.dbrel-rc-wrapper { width: 100%; height: 100%; overflow: auto; padding: 16px; display: flex; flex-wrap: wrap; gap: 16px; align-content: flex-start; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
            '.dbrel-rc-card { background: #fff; border: 1px solid #dee2e6; border-radius: 6px; padding: 14px; flex: 1; min-width: 380px; max-width: 620px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }',
            '.dbrel-rc-card h6 { font-size: 12px; color: #495057; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }',
            '.dbrel-rc-card h6 i { margin-right: 6px; color: #007bff; }',
            '.dbrel-rc-empty { display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; color: #6c757d; font-size: 14px; }',
            '.dbrel-rc-tooltip { background: #343a40; border: 1px solid #495057; border-radius: 4px; padding: 6px 10px; font-size: 11px; color: #e9ecef; }',
            '.dbrel-rc-tooltip .label { font-weight: bold; color: #007bff; margin-bottom: 2px; }',
            '.dbrel-rc-tooltip .row { color: #ccc; }',
            '.dbrel-rc-summary { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; width: 100%; min-width: 100%; max-width: 100%; }',
            '.dbrel-rc-stat { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 10px; text-align: center; }',
            '.dbrel-rc-stat .value { font-size: 22px; font-weight: bold; color: #007bff; }',
            '.dbrel-rc-stat .label { font-size: 10px; color: #6c757d; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }'
        ].join('\n');
        document.head.appendChild(style);
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
     * HELPER: get short table name from key
     * ==================================================================== */

    function getShortTable(tableKey) {
        return tableKey.split('.').pop();
    }

    function getDbName(tableKey) {
        return tableKey.split('.')[0];
    }

    /* ====================================================================
     * CHART DATA BUILDERS
     * ==================================================================== */

    function buildChartData(dbF, typeF) {
        if (!DbRel.data) return null;

        var tables = DbRel.data.tables;
        var relationships = DbRel.data.relationships || [];

        // Apply filters
        var filteredTableKeys = Object.keys(tables).filter(function(tk) {
            return !dbF || dbF[getDbName(tk)] !== false;
        });
        var filteredRels = relationships.filter(function(rel) {
            if (dbF) {
                if (dbF[getDbName(rel.source)] === false) return false;
                if (dbF[getDbName(rel.target)] === false) return false;
            }
            if (typeF && typeF[rel.type] === false) return false;
            return true;
        });

        // Row counts per table (bar chart)
        var rowsData = filteredTableKeys.map(function(tk) {
            return {
                name: getShortTable(tk),
                fullName: tk,
                rows: tables[tk].total || 0,
                fill: DbRel.getTableColor(tk).header
            };
        }).sort(function(a, b) { return b.rows - a.rows; }).slice(0, 30);

        // Column counts per table (bar chart)
        var colsData = filteredTableKeys.map(function(tk) {
            return {
                name: getShortTable(tk),
                columns: tables[tk].columns ? tables[tk].columns.length : 0,
                fill: DbRel.getTableColor(tk).header
            };
        }).sort(function(a, b) { return b.columns - a.columns; }).slice(0, 30);

        // Relationships per table (bar chart)
        var relCountMap = {};
        filteredRels.forEach(function(r) {
            relCountMap[r.source] = (relCountMap[r.source] || 0) + 1;
            relCountMap[r.target] = (relCountMap[r.target] || 0) + 1;
        });
        var relData = [];
        Object.keys(relCountMap).forEach(function(tk) {
            relData.push({
                name: getShortTable(tk),
                relationships: relCountMap[tk],
                fill: DbRel.getTableColor(tk).header
            });
        });
        relData.sort(function(a, b) { return b.relationships - a.relationships; });
        relData = relData.slice(0, 30);

        // Relationship type distribution (pie)
        var typeDist = {};
        filteredRels.forEach(function(r) { typeDist[r.type] = (typeDist[r.type] || 0) + 1; });
        var typeData = [];
        Object.keys(typeDist).forEach(function(type) {
            typeData.push({ name: type, value: typeDist[type] });
        });

        // DB distribution (pie)
        var dbDist = {};
        filteredTableKeys.forEach(function(tk) {
            var db = getDbName(tk);
            dbDist[db] = (dbDist[db] || 0) + 1;
        });
        var dbColors = { my: '#007bff', kayako_v4: '#28a745', pdns: '#fd7e14' };
        var dbData = [];
        Object.keys(dbDist).forEach(function(db) {
            dbData.push({ name: db, value: dbDist[db], fill: dbColors[db] || '#6c757d' });
        });

        // Cardinality distribution (pie)
        var cardDist = {};
        filteredRels.forEach(function(r) {
            cardDist[r.cardinality || 'unknown'] = (cardDist[r.cardinality || 'unknown'] || 0) + 1;
        });
        var cardData = [];
        Object.keys(cardDist).forEach(function(k) {
            cardData.push({ name: k, value: cardDist[k] });
        });

        // Scatter: rows vs columns
        var scatterData = filteredTableKeys.map(function(tk) {
            return {
                name: getShortTable(tk),
                rows: tables[tk].total || 0,
                columns: tables[tk].columns ? tables[tk].columns.length : 0,
                rels: relCountMap[tk] || 0,
                fill: DbRel.getTableColor(tk).header
            };
        });

        // Summary stats
        var totalRows = 0;
        var totalCols = 0;
        filteredTableKeys.forEach(function(tk) {
            totalRows += tables[tk].total || 0;
            totalCols += tables[tk].columns ? tables[tk].columns.length : 0;
        });

        nodeCount = filteredTableKeys.length;
        linkCount = filteredRels.length;

        return {
            rowsData: rowsData,
            colsData: colsData,
            relData: relData,
            typeData: typeData,
            dbData: dbData,
            cardData: cardData,
            scatterData: scatterData,
            stats: {
                tables: filteredTableKeys.length,
                relationships: filteredRels.length,
                totalRows: totalRows,
                totalCols: totalCols
            }
        };
    }

    /* ====================================================================
     * REACT COMPONENT
     * ==================================================================== */

    function buildAndRender() {
        if (!DbRel.data || !deps) return;

        var React = deps.React;
        var ReactDOM = deps.ReactDOM;
        var RC = deps.Recharts;
        var h = React.createElement;

        var TYPE_COLORS = { direct: '#495057', find_in_set: '#6f42c1', cross_db: '#fd7e14' };
        var CARD_COLORS = ['#007bff', '#28a745', '#fd7e14', '#dc3545', '#6f42c1', '#17a2b8'];

        DbRel.resetTableColors();

        // Custom tooltip component
        function CustomTooltip(props) {
            if (!props.active || !props.payload || !props.payload.length) return null;
            var entry = props.payload[0];
            return h('div', { className: 'dbrel-rc-tooltip' },
                h('div', { className: 'label' }, props.label || (entry.payload && entry.payload.name) || ''),
                props.payload.map(function(p, i) {
                    var val = typeof p.value === 'number' ? p.value.toLocaleString() : p.value;
                    return h('div', { key: i, className: 'row' }, (p.name || p.dataKey) + ': ' + val);
                })
            );
        }

        function ChartsApp() {
            var useState = React.useState;
            var useMemo = React.useMemo;
            var useEffect = React.useEffect;

            var filtersState = useState({ dbF: currentDbFilters, typeF: currentTypeFilters });
            var filters = filtersState[0];
            var setFilters = filtersState[1];

            useEffect(function() {
                rerenderFn = function(dbF, typeF) {
                    setFilters({ dbF: dbF, typeF: typeF });
                };
                return function() { rerenderFn = null; };
            }, []);

            var chartData = useMemo(function() {
                return buildChartData(filters.dbF, filters.typeF);
            }, [filters]);

            if (!chartData) {
                return h('div', { className: 'dbrel-rc-empty' },
                    h('div', null, 'No data available for charts.')
                );
            }

            var cd = chartData;

            // Summary stats cards
            var summaryCards = h('div', { className: 'dbrel-rc-card', style: { minWidth: '100%', maxWidth: '100%' } },
                h('h6', null, h('i', { className: 'fa fa-info-circle' }), 'Summary'),
                h('div', { className: 'dbrel-rc-summary' },
                    h('div', { className: 'dbrel-rc-stat' },
                        h('div', { className: 'value' }, cd.stats.tables),
                        h('div', { className: 'label' }, 'Tables')
                    ),
                    h('div', { className: 'dbrel-rc-stat' },
                        h('div', { className: 'value' }, cd.stats.totalRows.toLocaleString()),
                        h('div', { className: 'label' }, 'Total Rows')
                    ),
                    h('div', { className: 'dbrel-rc-stat' },
                        h('div', { className: 'value' }, cd.stats.relationships),
                        h('div', { className: 'label' }, 'Relationships')
                    ),
                    h('div', { className: 'dbrel-rc-stat' },
                        h('div', { className: 'value' }, cd.stats.totalCols),
                        h('div', { className: 'label' }, 'Total Columns')
                    )
                )
            );

            // Rows per table bar chart
            var rowsChart = cd.rowsData.length > 0 ? h('div', { className: 'dbrel-rc-card', style: { minWidth: 500 } },
                h('h6', null, h('i', { className: 'fa fa-bar-chart' }), 'Rows Per Table (Top 30)'),
                h(RC.ResponsiveContainer, { width: '100%', height: Math.max(300, cd.rowsData.length * 24) },
                    h(RC.BarChart, { data: cd.rowsData, layout: 'vertical', margin: { top: 5, right: 30, left: 80, bottom: 5 } },
                        h(RC.CartesianGrid, { strokeDasharray: '3 3', stroke: '#e9ecef' }),
                        h(RC.XAxis, { type: 'number', stroke: '#adb5bd', tick: { fontSize: 10, fill: '#6c757d' } }),
                        h(RC.YAxis, { type: 'category', dataKey: 'name', width: 75, tick: { fontSize: 10, fill: '#495057' } }),
                        h(RC.Tooltip, { content: h(CustomTooltip, null) }),
                        h(RC.Bar, { dataKey: 'rows', radius: [0, 3, 3, 0] },
                            cd.rowsData.map(function(entry, i) {
                                return h(RC.Cell, { key: i, fill: entry.fill });
                            })
                        )
                    )
                )
            ) : null;

            // Columns per table bar chart
            var colsChart = cd.colsData.length > 0 ? h('div', { className: 'dbrel-rc-card', style: { minWidth: 500 } },
                h('h6', null, h('i', { className: 'fa fa-columns' }), 'Columns Per Table (Top 30)'),
                h(RC.ResponsiveContainer, { width: '100%', height: Math.max(300, cd.colsData.length * 24) },
                    h(RC.BarChart, { data: cd.colsData, layout: 'vertical', margin: { top: 5, right: 30, left: 80, bottom: 5 } },
                        h(RC.CartesianGrid, { strokeDasharray: '3 3', stroke: '#e9ecef' }),
                        h(RC.XAxis, { type: 'number', stroke: '#adb5bd', tick: { fontSize: 10, fill: '#6c757d' } }),
                        h(RC.YAxis, { type: 'category', dataKey: 'name', width: 75, tick: { fontSize: 10, fill: '#495057' } }),
                        h(RC.Tooltip, { content: h(CustomTooltip, null) }),
                        h(RC.Bar, { dataKey: 'columns', radius: [0, 3, 3, 0] },
                            cd.colsData.map(function(entry, i) {
                                return h(RC.Cell, { key: i, fill: entry.fill });
                            })
                        )
                    )
                )
            ) : null;

            // Relationships per table bar chart
            var relsChart = cd.relData.length > 0 ? h('div', { className: 'dbrel-rc-card', style: { minWidth: 500 } },
                h('h6', null, h('i', { className: 'fa fa-link' }), 'Relationships Per Table (Top 30)'),
                h(RC.ResponsiveContainer, { width: '100%', height: Math.max(300, cd.relData.length * 24) },
                    h(RC.BarChart, { data: cd.relData, layout: 'vertical', margin: { top: 5, right: 30, left: 80, bottom: 5 } },
                        h(RC.CartesianGrid, { strokeDasharray: '3 3', stroke: '#e9ecef' }),
                        h(RC.XAxis, { type: 'number', stroke: '#adb5bd', tick: { fontSize: 10, fill: '#6c757d' } }),
                        h(RC.YAxis, { type: 'category', dataKey: 'name', width: 75, tick: { fontSize: 10, fill: '#495057' } }),
                        h(RC.Tooltip, { content: h(CustomTooltip, null) }),
                        h(RC.Bar, { dataKey: 'relationships', radius: [0, 3, 3, 0] },
                            cd.relData.map(function(entry, i) {
                                return h(RC.Cell, { key: i, fill: entry.fill });
                            })
                        )
                    )
                )
            ) : null;

            // Relationship type distribution (pie)
            var typePie = cd.typeData.length > 0 ? h('div', { className: 'dbrel-rc-card' },
                h('h6', null, h('i', { className: 'fa fa-pie-chart' }), 'Relationship Types'),
                h(RC.ResponsiveContainer, { width: '100%', height: 280 },
                    h(RC.PieChart, null,
                        h(RC.Pie, {
                            data: cd.typeData,
                            cx: '50%', cy: '50%',
                            outerRadius: 90, innerRadius: 40,
                            dataKey: 'value',
                            label: function(entry) { return entry.name + ' (' + Math.round(entry.percent * 100) + '%)'; },
                            labelLine: { stroke: '#adb5bd' }
                        },
                            cd.typeData.map(function(entry, i) {
                                return h(RC.Cell, { key: i, fill: TYPE_COLORS[entry.name] || '#6c757d' });
                            })
                        ),
                        h(RC.Tooltip, { content: h(CustomTooltip, null) })
                    )
                )
            ) : null;

            // DB distribution (pie)
            var dbPie = cd.dbData.length > 0 ? h('div', { className: 'dbrel-rc-card' },
                h('h6', null, h('i', { className: 'fa fa-database' }), 'Tables Per Database'),
                h(RC.ResponsiveContainer, { width: '100%', height: 280 },
                    h(RC.PieChart, null,
                        h(RC.Pie, {
                            data: cd.dbData,
                            cx: '50%', cy: '50%',
                            outerRadius: 90, innerRadius: 40,
                            dataKey: 'value',
                            label: function(entry) { return entry.name + ' (' + Math.round(entry.percent * 100) + '%)'; },
                            labelLine: { stroke: '#adb5bd' }
                        },
                            cd.dbData.map(function(entry, i) {
                                return h(RC.Cell, { key: i, fill: entry.fill });
                            })
                        ),
                        h(RC.Tooltip, { content: h(CustomTooltip, null) })
                    )
                )
            ) : null;

            // Cardinality distribution (pie)
            var cardPie = cd.cardData.length > 0 ? h('div', { className: 'dbrel-rc-card' },
                h('h6', null, h('i', { className: 'fa fa-arrows-h' }), 'Cardinality Distribution'),
                h(RC.ResponsiveContainer, { width: '100%', height: 280 },
                    h(RC.PieChart, null,
                        h(RC.Pie, {
                            data: cd.cardData,
                            cx: '50%', cy: '50%',
                            outerRadius: 90, innerRadius: 40,
                            dataKey: 'value',
                            label: function(entry) { return entry.name + ' (' + Math.round(entry.percent * 100) + '%)'; },
                            labelLine: { stroke: '#adb5bd' }
                        },
                            cd.cardData.map(function(entry, i) {
                                return h(RC.Cell, { key: i, fill: CARD_COLORS[i % CARD_COLORS.length] });
                            })
                        ),
                        h(RC.Tooltip, { content: h(CustomTooltip, null) })
                    )
                )
            ) : null;

            // Scatter: rows vs columns
            var scatterChart = cd.scatterData.length > 0 ? h('div', { className: 'dbrel-rc-card', style: { minWidth: 500 } },
                h('h6', null, h('i', { className: 'fa fa-dot-circle-o' }), 'Table Dimensions (Rows vs Columns, size = relationships)'),
                h(RC.ResponsiveContainer, { width: '100%', height: 350 },
                    h(RC.ScatterChart, { margin: { top: 20, right: 30, bottom: 20, left: 20 } },
                        h(RC.CartesianGrid, { strokeDasharray: '3 3', stroke: '#e9ecef' }),
                        h(RC.XAxis, {
                            type: 'number', dataKey: 'columns', name: 'Columns',
                            stroke: '#adb5bd', tick: { fontSize: 10, fill: '#6c757d' },
                            label: { value: 'Columns', position: 'insideBottom', offset: -5, fill: '#6c757d', fontSize: 11 }
                        }),
                        h(RC.YAxis, {
                            type: 'number', dataKey: 'rows', name: 'Rows',
                            stroke: '#adb5bd', tick: { fontSize: 10, fill: '#6c757d' },
                            label: { value: 'Rows', angle: -90, position: 'insideLeft', fill: '#6c757d', fontSize: 11 }
                        }),
                        h(RC.ZAxis, { type: 'number', dataKey: 'rels', range: [30, 300], name: 'Relationships' }),
                        h(RC.Tooltip, {
                            content: function(props) {
                                if (!props.active || !props.payload || !props.payload.length) return null;
                                var d = props.payload[0].payload;
                                return h('div', { className: 'dbrel-rc-tooltip' },
                                    h('div', { className: 'label' }, d.name),
                                    h('div', { className: 'row' }, 'Rows: ' + d.rows.toLocaleString()),
                                    h('div', { className: 'row' }, 'Columns: ' + d.columns),
                                    h('div', { className: 'row' }, 'Relationships: ' + d.rels)
                                );
                            }
                        }),
                        h(RC.Scatter, { data: cd.scatterData },
                            cd.scatterData.map(function(entry, i) {
                                return h(RC.Cell, { key: i, fill: entry.fill, fillOpacity: 0.7 });
                            })
                        )
                    )
                )
            ) : null;

            return h('div', { className: 'dbrel-rc-wrapper' },
                summaryCards,
                rowsChart,
                colsChart,
                relsChart,
                typePie,
                dbPie,
                cardPie,
                scatterChart
            );
        }

        // Render
        if (!rootEl) {
            var wrapper = document.createElement('div');
            wrapper.style.cssText = 'width:100%;height:100%;overflow:auto;';
            containerEl.appendChild(wrapper);
            rootEl = deps.ReactDOM.createRoot(wrapper);
        }

        rootEl.render(h(ChartsApp, null));
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('recharts', {
        init: function(el) {
            containerEl = el;
            containerEl.style.position = 'relative';
            containerEl.style.overflow = 'hidden';
            injectStyles();
            showLoading();
        },

        render: function() {
            loadDeps().then(function() {
                hideLoading();
                buildAndRender();
            }).catch(function(err) {
                hideLoading();
                if (containerEl) {
                    containerEl.innerHTML = '<div style="text-align:center;padding:40px;color:#dc3545;">Failed to load Recharts: ' + escHtml(err.message) + '</div>';
                }
            });
        },

        doLayout: function() {
            // Charts do not have a spatial layout to recompute
        },

        setZoom: function(pct) {
            if (!containerEl) return;
            zoomLevel = pct;
            var wrapper = containerEl.querySelector('.dbrel-rc-wrapper');
            if (wrapper) {
                var scale = pct / 100;
                wrapper.style.transform = 'scale(' + scale + ')';
                wrapper.style.transformOrigin = 'top left';
                wrapper.style.width = (100 / scale) + '%';
            }
            DbRel.setZoomSlider(pct);
        },

        getZoom: function() {
            return zoomLevel;
        },

        fitToScreen: function() {
            zoomLevel = 100;
            var wrapper = containerEl ? containerEl.querySelector('.dbrel-rc-wrapper') : null;
            if (wrapper) {
                wrapper.style.transform = '';
                wrapper.style.width = '100%';
            }
            DbRel.setZoomSlider(100);
        },

        applyFilters: function(dbF, typeF) {
            currentDbFilters = dbF;
            currentTypeFilters = typeF;
            if (rerenderFn) {
                rerenderFn(dbF, typeF);
            }
        },

        focusNode: function(nodeId) {
            focusedNodeId = nodeId;
            // Recharts doesn't have individual node focus, but we can scroll to the table info
            // The chart-based view does not have direct node focusing
        },

        unfocusNode: function() {
            focusedNodeId = null;
        },

        centerOnTable: function(tableKey) {
            // Charts don't support centering on a specific table in the spatial sense
            // But scroll to top to see the bar charts which include the table
        },

        getStats: function() {
            return { nodes: nodeCount, links: linkCount };
        },

        resize: function() {
            // Recharts ResponsiveContainer handles resize automatically
        },

        destroy: function() {
            if (rootEl) {
                rootEl.unmount();
                rootEl = null;
            }
            if (containerEl) containerEl.innerHTML = '';
            containerEl = null;
            focusedNodeId = null;
            rerenderFn = null;
            currentDbFilters = null;
            currentTypeFilters = null;
            nodeCount = 0;
            linkCount = 0;
            zoomLevel = 100;
        }
    });

})();
