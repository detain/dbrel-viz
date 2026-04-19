/**
 * Database Relationships - React Diagrams Renderer
 * Loads the pre-built standalone React Diagrams app in an iframe.
 * @projectstorm/react-diagrams has complex inter-package UMD dependencies
 * that prevent simple CDN loading, so we use the pre-built dist.
 */
(function() {
    'use strict';

    var containerEl = null;
    var iframe = null;
    var zoomLevel = 100;
    var nodeCount = 0;
    var linkCount = 0;

    function getIframeSrc() {
        var custid = DbRel.data && DbRel.data.metadata ? DbRel.data.metadata.custid : 0;
        if (!custid) {
            var input = document.getElementById('db-rel-custid');
            custid = input ? parseInt(input.value, 10) : 0;
        }
        return '/admin/db_relationships_libs/react-diagrams/dist/index.html?custid=' + (custid || 0);
    }

    function countStats() {
        if (!DbRel.data) return;
        nodeCount = 0; linkCount = 0;
        var tables = DbRel.data.tables;
        if (DbRel.displayMode === 'grouped') {
            nodeCount = Object.keys(tables).length;
        } else {
            Object.keys(tables).forEach(function(tk) { nodeCount += tables[tk].rows.length; });
        }
        DbRel.data.relationships.forEach(function(rel) {
            if (DbRel.displayMode === 'grouped') {
                linkCount++;
            } else {
                (rel.matches || []).forEach(function(m) { linkCount += m[1].length; });
            }
        });
    }

    function createIframe() {
        if (!containerEl) return;
        containerEl.innerHTML = '';

        // Check if the standalone dist exists before loading iframe
        var src = getIframeSrc();
        var xhr = new XMLHttpRequest();
        xhr.open('HEAD', src, true);
        xhr.onload = function() {
            if (xhr.status >= 400) {
                showUnavailable();
                return;
            }
            iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
            iframe.setAttribute('title', 'React Diagrams Visualization');
            iframe.addEventListener('load', function() {
                try {
                    var doc = iframe.contentDocument || iframe.contentWindow.document;
                    var style = doc.createElement('style');
                    style.textContent =
                        // Hide the standalone's toolbar, sidebar, header, modals
                        '.card-header,.db-rel-sidebar,.modal,.db-rel-tooltip{display:none!important}' +
                        // Make the card body fill everything
                        '.card-body{height:100vh!important}' +
                        '#db-rel-app .card{border:none!important;border-radius:0!important;margin:0!important}' +
                        '#db-rel-app{padding:0!important}' +
                        'body{padding:0!important;margin:0!important;overflow:hidden!important}' +
                        // The canvas wrapper should fill 100%
                        '.card-body>div:last-child{flex:1!important;width:100%!important}';
                    doc.head.appendChild(style);
                } catch (e) {}
            });
            containerEl.appendChild(iframe);
        };
        xhr.onerror = function() { showUnavailable(); };
        xhr.send();
    }

    function showUnavailable() {
        if (!containerEl) return;
        containerEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;text-align:center;font-family:sans-serif;color:#666;">' +
            '<div><i class="fa fa-exclamation-circle" style="font-size:48px;color:#ccc;margin-bottom:16px;display:block;"></i>' +
            '<h4 style="color:#495057;">React Diagrams</h4>' +
            '<p style="max-width:400px;">This renderer requires a pre-built standalone app.<br>' +
            'Run <code>cd public_html/admin/db_relationships_libs/react-diagrams &amp;&amp; yarn install &amp;&amp; yarn build</code><br>' +
            'to generate the dist files, then reload.</p>' +
            '<a href="https://github.com/projectstorm/react-diagrams" target="_blank" class="btn btn-sm btn-outline-primary mt-2"><i class="fa fa-github mr-1"></i>View on GitHub</a></div></div>';
    }

    DbRel.registerRenderer('reactdiagrams', {
        init: function(el) {
            containerEl = el;
        },
        render: function() {
            countStats();
            createIframe();
        },
        doLayout: function() {
            // Reload iframe to re-layout
            if (iframe) iframe.src = getIframeSrc();
        },
        setZoom: function(pct) { zoomLevel = pct; },
        getZoom: function() { return zoomLevel; },
        fitToScreen: function() {
            // iframe handles its own fit
        },
        applyFilters: function() {},
        focusNode: function() {},
        unfocusNode: function() {},
        centerOnTable: function() {},
        getStats: function() { return { nodes: nodeCount, links: linkCount }; },
        resize: function() {
            // iframe auto-resizes
        },
        destroy: function() {
            if (containerEl) containerEl.innerHTML = '';
            iframe = null;
            containerEl = null;
        }
    });

})();
