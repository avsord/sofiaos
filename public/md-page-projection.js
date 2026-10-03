/* Generated from the exact native page hierarchy and projection. */
const MDPageHierarchy=(()=>{const exports={};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pageParentId = pageParentId;
exports.canReparentPage = canReparentPage;
exports.reparentedPage = reparentedPage;
exports.reparentPatch = reparentPatch;
function pageParentId(page) {
    return String(page.data?.parent_id || '');
}
function canReparentPage(pages, pageId, parentId) {
    if (!pageId)
        return false;
    if (!parentId)
        return true;
    if (pageId === parentId)
        return false;
    const byId = new Map(pages.map(page => [page.id, page]));
    let current = byId.get(parentId), depth = 0;
    const seen = new Set();
    while (current && depth++ < 80) {
        if (current.id === pageId)
            return false;
        if (seen.has(current.id))
            return false;
        seen.add(current.id);
        const next = pageParentId(current);
        if (!next)
            return true;
        current = byId.get(next);
    }
    return !current;
}
function reparentedPage(page, parentId) {
    return { ...page, data: { ...page.data, parent_id: parentId, node_type: parentId ? 'page' : 'space' } };
}
function reparentPatch(page, parentId) {
    return { id: page.id, revision: page.revision, data: { ...page.data, parent_id: parentId, node_type: parentId ? 'page' : 'space' } };
}

return exports;})();
const MDPageOrder=(()=>{const exports={};const require=name=>{if(name==='./page-hierarchy')return MDPageHierarchy;throw Error('Unexpected dependency');};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAGE_INDENT = void 0;
exports.comparePageOrder = comparePageOrder;
exports.descendantsOf = descendantsOf;
exports.projectPageDrop = projectPageDrop;
exports.dropLineY = dropLineY;
const page_hierarchy_1 = require("./page-hierarchy");
exports.PAGE_INDENT = 18;
function comparePageOrder(a, b) {
    const rank = (p) => p.data?.sort_order !== '' && p.data?.sort_order != null && Number.isFinite(Number(p.data.sort_order)) ? Number(p.data.sort_order) : null;
    const ar = rank(a), br = rank(b);
    if (ar != null && br != null && ar !== br)
        return ar - br;
    if (ar != null && br == null)
        return -1;
    if (ar == null && br != null)
        return 1;
    return a.title.localeCompare(b.title, 'pt-BR') || a.id.localeCompare(b.id);
}
function descendantsOf(pages, id) {
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const p of pages)
            if (ids.has((0, page_hierarchy_1.pageParentId)(p)) && !ids.has(p.id)) {
                ids.add(p.id);
                changed = true;
            }
    }
    return ids;
}
/** Geometry is in window coordinates and remains fixed while the drag ghost moves. */
function projectPageDrop(pages, source, rows, x, y, dx) {
    const removed = descendantsOf(pages, source.id), byId = new Map(pages.map(p => [p.id, p]));
    const visible = rows.filter(r => !removed.has(r.page.id) && r.height > 0).sort((a, b) => a.y - b.y);
    // The lower edge of the actual parent group also permits a gentle vertical outdent.
    const sourceParent = byId.get((0, page_hierarchy_1.pageParentId)(source)), parentGroup = sourceParent ? descendantsOf(pages, sourceParent.id) : new Set();
    const groupRows = rows.filter(r => parentGroup.has(r.page.id));
    const parentRow = sourceParent ? rows.find(r => r.page.id === sourceParent.id) : null;
    const groupBottom = groupRows.length ? Math.max(...groupRows.map(r => r.y + r.height)) : 0;
    const groupTop = groupRows.length ? Math.min(...groupRows.map(r => r.y)) : 0;
    if (sourceParent && groupRows.length) {
        const beyondBottom = y > groupBottom + 8 && !visible.some(r => !parentGroup.has(r.page.id) && y >= r.y && y <= r.y + r.height);
        const beyondTop = y < groupTop - 8 && !visible.some(r => !parentGroup.has(r.page.id) && y >= r.y && y <= r.y + r.height);
        const hiddenParentOutdent = !parentRow && dx <= -12;
        if (beyondBottom || beyondTop || hiddenParentOutdent)
            return { kind: beyondTop ? 'before' : 'after', anchorId: sourceParent.id, parentId: (0, page_hierarchy_1.pageParentId)(sourceParent), depth: Math.max(0, (rows.find(r => r.page.id === source.id)?.depth || 0) - 1), lineY: beyondTop ? groupTop : groupBottom };
    }
    if (!visible.length)
        return null;
    const closest = visible.find(r => y >= r.y && y <= r.y + r.height) || visible.reduce((best, r) => Math.abs(y - (r.y + r.height / 2)) < Math.abs(y - (best.y + best.height / 2)) ? r : best);
    let anchor = closest.page, depth = closest.depth;
    const relative = (y - closest.y) / closest.height;
    const pullingOut = dx <= -12; // Small, intentional offset; never require leaving the screen.
    if (!pullingOut && relative >= .27 && relative <= .73 && (0, page_hierarchy_1.canReparentPage)(pages, source.id, anchor.id))
        return { kind: 'inside', anchorId: anchor.id, parentId: anchor.id, depth: depth + 1 };
    let kind = relative < .5 ? 'before' : 'after', parentId = (0, page_hierarchy_1.pageParentId)(anchor);
    if (pullingOut) {
        // Outdent from the source's own parent by the distance represented by the preview.
        const sourceDepth = rows.find(r => r.page.id === source.id)?.depth ?? depth;
        const targetDepth = Math.max(0, sourceDepth - 1);
        while (depth > targetDepth && parentId) {
            const parent = byId.get(parentId);
            if (!parent)
                break;
            anchor = parent;
            parentId = (0, page_hierarchy_1.pageParentId)(parent);
            depth--;
        }
    }
    // Blank space below/above a branch follows the closest visible level. This permits
    // leaving a group vertically too, without a special drop label or horizontal throw.
    if (!(0, page_hierarchy_1.canReparentPage)(pages, source.id, parentId) || removed.has(anchor.id))
        return null;
    return { kind, anchorId: anchor.id, parentId, depth };
}
function dropLineY(drop, rows) {
    if (drop.kind === 'inside')
        return null;
    if (drop.lineY != null)
        return drop.lineY;
    const row = rows.find(r => r.page.id === drop.anchorId);
    if (!row)
        return null;
    if (drop.kind === 'before')
        return row.y;
    const sorted = [...rows].sort((a, b) => a.y - b.y);
    let y = row.y + row.height, started = false;
    for (const r of sorted) {
        if (r.page.id === row.page.id) {
            started = true;
            continue;
        }
        if (!started)
            continue;
        if (r.depth <= row.depth)
            break;
        y = Math.max(y, r.y + r.height);
    }
    return y;
}

return exports;})();
