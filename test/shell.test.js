/**
 * Tests for the DbRel shared shell (core/shell.js).
 *
 * The shell attaches its API to window.DbRel as a side effect. We load it once,
 * then reset `DbRel.data` and state between tests to keep them isolated.
 *
 * Coverage targets (pure-logic exports):
 *   fmtVal, pickDisplayColumns, padRight, repeatChar,
 *   getPrimaryKey, shortenColName, getTableColor, resetTableColors,
 *   computeNodeDistances, distanceToOpacity, getTableIconInfo,
 *   getPivotConfig, getNodePivotInfo.
 */

'use strict';

// The shell expects jQuery to exist; set up a minimal stub before loading.
// jsdom already gives us window/document; we just need $ to be a function
// that returns a chainable stub for the DOM-mutating calls the shell
// performs inside $(function() { ... }). We are not testing those here.
global.jQuery = global.$ = (function () {
    function make() {
        // Chainable stub — every call returns the same stub.
        const fn = function () { return fn; };
        const props = [
            'val', 'text', 'html', 'css', 'attr', 'hide', 'show', 'find',
            'modal', 'toggleClass', 'addClass', 'removeClass', 'hasClass',
            'each', 'on', 'data', 'click', 'closest', 'is', 'append',
            'empty', 'after', 'length', 'prepend', 'parent', 'children',
            'siblings', 'next', 'prev', 'eq',
        ];
        props.forEach((p) => { fn[p] = fn; });
        fn.length = 0;
        return fn;
    }
    const wrapper = function () { return make(); };
    // Support jQuery-as-document-ready: $(function(){ ... }) — no-op here.
    const jqOriginal = wrapper;
    const jq = function (arg) {
        if (typeof arg === 'function') {
            // Don't execute the init callback during tests.
            return make();
        }
        return jqOriginal(arg);
    };
    jq.fn = {};
    return jq;
})();

require('../src/core/shell.js');
const DbRel = global.window.DbRel;

describe('DbRel shell', () => {
    // Each test must start with a deterministic state.
    beforeEach(() => {
        DbRel.data = null;
        DbRel.showFullContent = false;
        DbRel.displayMode = 'separate';
        DbRel.pivot = null;
        DbRel.resetTableColors();
    });

    // ---------------------------------------------------------------
    // fmtVal
    // ---------------------------------------------------------------
    describe('fmtVal', () => {
        it('returns "NULL" for null', () => {
            expect(DbRel.fmtVal(null)).toBe('NULL');
        });

        it('returns "NULL" for undefined', () => {
            expect(DbRel.fmtVal(undefined)).toBe('NULL');
        });

        it('returns short strings unchanged', () => {
            expect(DbRel.fmtVal('hi')).toBe('hi');
        });

        it('coerces numbers to string', () => {
            expect(DbRel.fmtVal(42)).toBe('42');
        });

        it('coerces booleans to string', () => {
            expect(DbRel.fmtVal(true)).toBe('true');
            expect(DbRel.fmtVal(false)).toBe('false');
        });

        it('returns empty string unchanged', () => {
            expect(DbRel.fmtVal('')).toBe('');
        });

        it('truncates values longer than MAX_VAL_LEN in compact mode', () => {
            const longStr = 'x'.repeat(50);
            const out = DbRel.fmtVal(longStr);
            expect(out.length).toBe(DbRel.MAX_VAL_LEN);
            expect(out.endsWith('..')).toBe(true);
        });

        it('does not truncate a string of exactly MAX_VAL_LEN chars', () => {
            const exact = 'y'.repeat(DbRel.MAX_VAL_LEN);
            expect(DbRel.fmtVal(exact)).toBe(exact);
        });

        it('uses 100-char cap when showFullContent is true', () => {
            DbRel.showFullContent = true;
            const short = 'x'.repeat(50); // under 100, not truncated
            expect(DbRel.fmtVal(short)).toBe(short);
            const long = 'x'.repeat(200);
            const out = DbRel.fmtVal(long);
            expect(out.length).toBe(103); // 100 + '...'
            expect(out.endsWith('...')).toBe(true);
        });

        it('does not truncate at MAX_VAL_LEN when showFullContent is true', () => {
            DbRel.showFullContent = true;
            const s = 'a'.repeat(30); // > MAX_VAL_LEN (24) but <= 100
            expect(DbRel.fmtVal(s)).toBe(s);
        });
    });

    // ---------------------------------------------------------------
    // pickDisplayColumns
    // ---------------------------------------------------------------
    describe('pickDisplayColumns', () => {
        it('prioritizes PRIORITY_EXACT fields', () => {
            const cols = ['random_col', 'id', 'notes', 'email'];
            const out = DbRel.pickDisplayColumns(cols, 'accounts');
            expect(out).toContain('id');
            expect(out).toContain('email');
        });

        it('prioritizes fields ending with PRIORITY_SUFFIXES like _id', () => {
            const cols = ['random1', 'random2', 'vps_id'];
            const out = DbRel.pickDisplayColumns(cols, 'vps');
            expect(out[0]).toBe('vps_id');
        });

        it('caps results at MAX_FIELDS', () => {
            const cols = ['id', 'name', 'email', 'title', 'subject', 'custid', 'account_id', 'services_id'];
            const out = DbRel.pickDisplayColumns(cols, 'sometable');
            expect(out.length).toBe(DbRel.MAX_FIELDS);
        });

        it('fills remainder with non-priority columns when under MAX_FIELDS', () => {
            const cols = ['id', 'aaa', 'bbb', 'ccc'];
            const out = DbRel.pickDisplayColumns(cols, 't');
            expect(out).toContain('id');
            // should include some non-priority fillers
            expect(out.length).toBeLessThanOrEqual(DbRel.MAX_FIELDS);
            expect(out.length).toBeGreaterThanOrEqual(1);
        });

        it('omits hidden fields', () => {
            DbRel.data = { hiddenFields: ['email', 'password'] };
            const cols = ['id', 'email', 'password', 'title'];
            const out = DbRel.pickDisplayColumns(cols, 't');
            expect(out).not.toContain('email');
            expect(out).not.toContain('password');
            expect(out).toContain('id');
        });

        it('returns an empty array for empty column list', () => {
            expect(DbRel.pickDisplayColumns([], 't')).toEqual([]);
        });

        it('works when DbRel.data is null (no hiddenFields)', () => {
            DbRel.data = null;
            expect(DbRel.pickDisplayColumns(['id', 'x'], 't')).toEqual(expect.arrayContaining(['id']));
        });
    });

    // ---------------------------------------------------------------
    // padRight / repeatChar
    // ---------------------------------------------------------------
    describe('padRight', () => {
        it('pads a short string to target length with spaces', () => {
            expect(DbRel.padRight('ab', 5)).toBe('ab   ');
        });

        it('leaves a string of target length unchanged', () => {
            expect(DbRel.padRight('abc', 3)).toBe('abc');
        });

        it('truncates a string longer than target length', () => {
            expect(DbRel.padRight('abcdef', 3)).toBe('abc');
        });

        it('handles empty string', () => {
            expect(DbRel.padRight('', 4)).toBe('    ');
        });

        it('handles len=0 by returning empty', () => {
            expect(DbRel.padRight('abc', 0)).toBe('');
        });
    });

    describe('repeatChar', () => {
        it('repeats a character n times', () => {
            expect(DbRel.repeatChar('-', 5)).toBe('-----');
        });

        it('returns empty string for n=0', () => {
            expect(DbRel.repeatChar('x', 0)).toBe('');
        });

        it('handles unicode box-drawing chars', () => {
            expect(DbRel.repeatChar('\u2500', 3)).toBe('\u2500\u2500\u2500');
        });

        it('handles multi-char base string (repeats the full string)', () => {
            expect(DbRel.repeatChar('ab', 3)).toBe('ababab');
        });
    });

    // ---------------------------------------------------------------
    // getPrimaryKey
    // ---------------------------------------------------------------
    describe('getPrimaryKey', () => {
        it('returns the PK column from DbRel.data.primaryKeys', () => {
            DbRel.data = { primaryKeys: { accounts: 'account_id', vps: 'vps_id' } };
            expect(DbRel.getPrimaryKey('accounts')).toBe('account_id');
            expect(DbRel.getPrimaryKey('vps')).toBe('vps_id');
        });

        it('returns null for unknown table', () => {
            DbRel.data = { primaryKeys: { accounts: 'account_id' } };
            expect(DbRel.getPrimaryKey('unknown_table')).toBeNull();
        });

        it('returns null when DbRel.data is null', () => {
            DbRel.data = null;
            expect(DbRel.getPrimaryKey('anything')).toBeNull();
        });

        it('returns null when primaryKeys map is missing', () => {
            DbRel.data = {};
            expect(DbRel.getPrimaryKey('anything')).toBeNull();
        });
    });

    // ---------------------------------------------------------------
    // shortenColName
    // ---------------------------------------------------------------
    describe('shortenColName', () => {
        it('strips a known prefix from the column name', () => {
            DbRel.data = { prefixes: { accounts: 'account_' } };
            expect(DbRel.shortenColName('account_name', 'accounts')).toBe('name');
            expect(DbRel.shortenColName('account_id', 'accounts')).toBe('id');
        });

        it('returns the column unchanged when it does not start with the prefix', () => {
            DbRel.data = { prefixes: { accounts: 'account_' } };
            expect(DbRel.shortenColName('user_name', 'accounts')).toBe('user_name');
        });

        it('returns the column unchanged when no prefix is configured', () => {
            DbRel.data = { prefixes: {} };
            expect(DbRel.shortenColName('x_id', 't')).toBe('x_id');
        });

        it('does NOT strip when column equals the prefix (would leave empty)', () => {
            DbRel.data = { prefixes: { foo: 'foo_' } };
            expect(DbRel.shortenColName('foo_', 'foo')).toBe('foo_');
        });

        it('returns column unchanged when DbRel.data is null', () => {
            DbRel.data = null;
            expect(DbRel.shortenColName('account_id', 'accounts')).toBe('account_id');
        });

        it('handles an empty-string prefix as a no-op', () => {
            DbRel.data = { prefixes: { t: '' } };
            expect(DbRel.shortenColName('abc', 't')).toBe('abc');
        });
    });

    // ---------------------------------------------------------------
    // getTableColor / resetTableColors
    // ---------------------------------------------------------------
    describe('getTableColor', () => {
        it('returns an object with header/bg/border keys', () => {
            const c = DbRel.getTableColor('my.accounts');
            expect(c).toHaveProperty('header');
            expect(c).toHaveProperty('bg');
            expect(c).toHaveProperty('border');
        });

        it('returns a color from the palette for the given db', () => {
            const c = DbRel.getTableColor('my.vps');
            expect(DbRel.TABLE_PALETTES.my).toContain(c.header);
        });

        it('caches the result — same tableKey returns the same color', () => {
            const a = DbRel.getTableColor('my.some_table');
            const b = DbRel.getTableColor('my.some_table');
            expect(a).toBe(b); // same reference (cache hit)
        });

        it('assigns different colors to different tables in the same db', () => {
            const a = DbRel.getTableColor('my.t1');
            const b = DbRel.getTableColor('my.t2');
            expect(a.header).not.toBe(b.header);
        });

        it('uses the kayako_v4 palette for kayako tables', () => {
            const c = DbRel.getTableColor('kayako_v4.swusers');
            expect(DbRel.TABLE_PALETTES['kayako_v4']).toContain(c.header);
        });

        it('falls back to "my" palette for unknown db prefixes', () => {
            const c = DbRel.getTableColor('unknown_db.weird_table');
            // fallback palette is 'my' - so colour should come from that palette
            expect(DbRel.TABLE_PALETTES.my).toContain(c.header);
        });

        it('bg and border are rgb() format strings', () => {
            const c = DbRel.getTableColor('my.t_rgb');
            expect(c.bg).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
            expect(c.border).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
        });
    });

    describe('resetTableColors', () => {
        it('clears the cache so colors are re-assigned from index 0', () => {
            const before = DbRel.getTableColor('my.first');
            DbRel.resetTableColors();
            const after = DbRel.getTableColor('my.first');
            // After reset, first call again should get palette[0] - same as before.
            expect(after.header).toBe(before.header);
        });

        it('restarts the color index so a new second-table gets palette[1]', () => {
            DbRel.getTableColor('my.a');
            DbRel.getTableColor('my.b');
            DbRel.resetTableColors();
            const first = DbRel.getTableColor('my.brand_new');
            expect(first.header).toBe(DbRel.TABLE_PALETTES.my[0]);
        });
    });

    // ---------------------------------------------------------------
    // computeNodeDistances
    // ---------------------------------------------------------------
    describe('computeNodeDistances', () => {
        it('returns empty object when DbRel.data is null', () => {
            DbRel.data = null;
            expect(DbRel.computeNodeDistances('anything')).toEqual({});
        });

        it('sets focus node distance to 0', () => {
            DbRel.data = {
                tables: { 'my.a': { rows: [{}] } },
                relationships: [],
            };
            const d = DbRel.computeNodeDistances('my.a:0');
            expect(d['my.a:0']).toBe(0);
        });

        it('computes 1-hop neighbors in separate mode', () => {
            DbRel.displayMode = 'separate';
            DbRel.data = {
                tables: { 'my.a': { rows: [{ id: 1 }] }, 'my.b': { rows: [{ id: 2 }] } },
                relationships: [
                    { source: 'my.a', target: 'my.b', matches: [[0, [0]]] },
                ],
            };
            const d = DbRel.computeNodeDistances('my.a:0');
            expect(d['my.a:0']).toBe(0);
            expect(d['my.b:0']).toBe(1);
        });

        it('computes multi-hop distances via BFS', () => {
            DbRel.displayMode = 'separate';
            DbRel.data = {
                tables: {
                    'my.a': { rows: [{}] },
                    'my.b': { rows: [{}] },
                    'my.c': { rows: [{}] },
                    'my.d': { rows: [{}] },
                },
                relationships: [
                    { source: 'my.a', target: 'my.b', matches: [[0, [0]]] },
                    { source: 'my.b', target: 'my.c', matches: [[0, [0]]] },
                    { source: 'my.c', target: 'my.d', matches: [[0, [0]]] },
                ],
            };
            const d = DbRel.computeNodeDistances('my.a:0');
            expect(d['my.a:0']).toBe(0);
            expect(d['my.b:0']).toBe(1);
            expect(d['my.c:0']).toBe(2);
            expect(d['my.d:0']).toBe(3);
        });

        it('leaves unreachable nodes as undefined', () => {
            DbRel.displayMode = 'separate';
            DbRel.data = {
                tables: { 'my.a': { rows: [{}] }, 'my.isolated': { rows: [{}] } },
                relationships: [],
            };
            const d = DbRel.computeNodeDistances('my.a:0');
            expect(d['my.isolated:0']).toBeUndefined();
        });

        it('computes distances between whole tables in grouped mode', () => {
            DbRel.displayMode = 'grouped';
            DbRel.data = {
                tables: { 'my.a': { rows: [{}] }, 'my.b': { rows: [{}] } },
                relationships: [{ source: 'my.a', target: 'my.b' }],
            };
            const d = DbRel.computeNodeDistances('my.a');
            expect(d['my.a']).toBe(0);
            expect(d['my.b']).toBe(1);
        });
    });

    // ---------------------------------------------------------------
    // distanceToOpacity
    // ---------------------------------------------------------------
    describe('distanceToOpacity', () => {
        it('returns 1.0 for the focused node (distance 0)', () => {
            expect(DbRel.distanceToOpacity(0)).toBe(1.0);
        });

        it('returns 1.0 for directly connected (distance 1)', () => {
            expect(DbRel.distanceToOpacity(1)).toBe(1.0);
        });

        it('returns 0.6 for distance 2', () => {
            expect(DbRel.distanceToOpacity(2)).toBe(0.6);
        });

        it('returns 0.35 for distance 3', () => {
            expect(DbRel.distanceToOpacity(3)).toBe(0.35);
        });

        it('returns 0.12 for distance 4+', () => {
            expect(DbRel.distanceToOpacity(4)).toBe(0.12);
            expect(DbRel.distanceToOpacity(100)).toBe(0.12);
        });

        it('returns 0.12 for Infinity (unreachable)', () => {
            expect(DbRel.distanceToOpacity(Infinity)).toBe(0.12);
        });

        it('returns 0.12 for undefined', () => {
            expect(DbRel.distanceToOpacity(undefined)).toBe(0.12);
        });
    });

    // ---------------------------------------------------------------
    // getTableIconInfo
    // ---------------------------------------------------------------
    describe('getTableIconInfo', () => {
        it('returns { type: "img", src: ... } for a known table', () => {
            const info = DbRel.getTableIconInfo('accounts');
            expect(info).not.toBeNull();
            expect(info.type).toBe('img');
            expect(typeof info.src).toBe('string');
            expect(info.src.length).toBeGreaterThan(0);
        });

        it('returns null for an unknown table', () => {
            expect(DbRel.getTableIconInfo('definitely_not_a_real_table')).toBeNull();
        });

        it('src contains the table icons path prefix', () => {
            const info = DbRel.getTableIconInfo('vps');
            expect(info.src.indexOf(DbRel.paths.tableIcons)).toBe(0);
        });

        it('handles kayako tables (mapped with "sw" prefix)', () => {
            const info = DbRel.getTableIconInfo('swusers');
            expect(info).not.toBeNull();
            expect(info.type).toBe('img');
        });
    });

    // ---------------------------------------------------------------
    // getPivotConfig
    // ---------------------------------------------------------------
    describe('getPivotConfig', () => {
        it('returns the config for a known pivot table', () => {
            const cfg = DbRel.getPivotConfig('switchmanager');
            expect(cfg).not.toBeNull();
            expect(cfg).toHaveProperty('idField');
            expect(cfg).toHaveProperty('label');
            expect(cfg.label).toBe('Switch');
        });

        it('returns null for a non-pivot table', () => {
            expect(DbRel.getPivotConfig('accounts')).toBeNull();
        });

        it('returns null for unknown table', () => {
            expect(DbRel.getPivotConfig('xyz_nonexistent')).toBeNull();
        });

        it('returns the expected idField for servers', () => {
            const cfg = DbRel.getPivotConfig('servers');
            expect(cfg.idField).toBe('server_id');
        });
    });

    // ---------------------------------------------------------------
    // getNodePivotInfo
    // ---------------------------------------------------------------
    describe('getNodePivotInfo', () => {
        it('returns null when DbRel.data is null', () => {
            DbRel.data = null;
            expect(DbRel.getNodePivotInfo('my.servers', 0)).toBeNull();
        });

        it('returns null when the table is not in DbRel.data.tables', () => {
            DbRel.data = { tables: {} };
            expect(DbRel.getNodePivotInfo('my.servers', 0)).toBeNull();
        });

        it('returns null when the table is not a pivot table', () => {
            DbRel.data = {
                tables: {
                    'my.accounts': { rows: [{ account_id: 5 }] },
                },
            };
            // accounts is not in PIVOT_TABLES
            expect(DbRel.getNodePivotInfo('my.accounts', 0)).toBeNull();
        });

        it('returns null when the row is missing', () => {
            DbRel.data = { tables: { 'my.servers': { rows: [] } } };
            expect(DbRel.getNodePivotInfo('my.servers', 0)).toBeNull();
        });

        it('returns null when the pivot id field is missing/empty on the row', () => {
            DbRel.data = {
                tables: { 'my.servers': { rows: [{ name: 'srv' }] } }, // no server_id
            };
            expect(DbRel.getNodePivotInfo('my.servers', 0)).toBeNull();
        });

        it('treats id=0 as a valid pivot id', () => {
            DbRel.data = {
                tables: { 'my.servers': { rows: [{ server_id: 0 }] } },
            };
            const info = DbRel.getNodePivotInfo('my.servers', 0);
            expect(info).not.toBeNull();
            expect(info.id).toBe(0);
        });

        it('returns complete pivot info for a pivotable row', () => {
            DbRel.data = {
                tables: { 'my.servers': { rows: [{ server_id: 42, name: 'srv-a' }] } },
            };
            const info = DbRel.getNodePivotInfo('my.servers', 0);
            expect(info).toEqual({
                table: 'servers',
                id: 42,
                tableKey: 'my.servers',
                idField: 'server_id',
                label: 'Server 42',
            });
        });

        it('uses idField from the pivot config', () => {
            DbRel.data = {
                tables: {
                    'my.switchmanager': { rows: [{ id: 7 }] },
                },
            };
            const info = DbRel.getNodePivotInfo('my.switchmanager', 0);
            expect(info.idField).toBe('id');
            expect(info.id).toBe(7);
            expect(info.label).toBe('Switch 7');
        });
    });
});
