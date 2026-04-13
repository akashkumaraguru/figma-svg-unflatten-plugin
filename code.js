"use strict";
// ============================================================
// SVG Path Splitter — Figma Plugin
// Splits a flattened single-path vector into individual editable
// vector layers, all grouped together for easy editing.
// ============================================================
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// ── Path Parsing ─────────────────────────────────────────────
/**
 * Splits the SVG path d-string natively into discrete sub-paths.
 * Each sub-path always starts at an M or m command.
 * Using a direct Regex match preserves Figma's implicit formatting flawlessly!
 */
function splitPathData(d) {
    const matches = d.match(/[Mm][^Mm]*/g);
    if (!matches)
        return [];
    return matches.map(pathStr => {
        return {
            d: pathStr.trim(),
            isClosed: /[Zz]\s*$/.test(pathStr)
        };
    });
}
// ── Figma Node Helpers ───────────────────────────────────────
/**
 * Extracts the SVG path d-string from a VectorNode.
 * Figma stores path data in node.vectorPaths as an array of {windingRule, data}.
 * If the node has multiple entries we join them (still treated as "single layer").
 */
function getVectorPathData(node) {
    const paths = node.vectorPaths;
    if (!paths || paths.length === 0)
        return "";
    return paths.map(p => p.data).join(" ");
}
/**
 * Checks whether the node is a plain VectorNode (the typical result
 * of importing or flattening an SVG in Figma).
 */
function isSupportedNode(node) {
    return node.type === "VECTOR";
}
/**
 * Creates a new VectorNode from a sub-path string, copying style
 * properties from the original node.
 */
function createVectorFromSubPath(subPath, original, index) {
    const vec = figma.createVector();
    // Set the path data via vectorPaths
    vec.vectorPaths = [
        {
            windingRule: "NONZERO",
            data: subPath.d,
        },
    ];
    // ── Clone style from the original ──────────────────────────
    const originalFills = Array.isArray(original.fills) ? original.fills : [];
    const originalStrokes = Array.isArray(original.strokes) ? original.strokes : [];
    if (subPath.isClosed) {
        vec.fills = originalFills.length > 0 ? JSON.parse(JSON.stringify(originalFills)) : [];
        if (originalStrokes.length > 0) {
            vec.strokes = JSON.parse(JSON.stringify(originalStrokes));
        }
    }
    else {
        // Open path: prevent unwanted fills destroying open stroke paths (e.g. `<` inside `< />`)
        if (originalStrokes.length > 0) {
            vec.fills = [];
            vec.strokes = JSON.parse(JSON.stringify(originalStrokes));
        }
        else {
            vec.fills = originalFills.length > 0 ? JSON.parse(JSON.stringify(originalFills)) : [];
        }
    }
    if (originalStrokes.length > 0 && Array.isArray(vec.strokes) && vec.strokes.length > 0) {
        vec.strokeWeight = typeof original.strokeWeight === 'number' ? original.strokeWeight : 1;
        vec.strokeAlign = original.strokeAlign;
        vec.strokeCap = original.strokeCap;
        vec.strokeJoin = original.strokeJoin;
    }
    // Position & size: Figma auto-sizes vectors to their path bounds.
    // We match the original's x/y so the group lines up correctly.
    vec.x = original.x;
    vec.y = original.y;
    vec.name = `Path ${index + 1}`;
    return vec;
}
// ── Main Conversion Logic ────────────────────────────────────
function convertSelection() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const selection = figma.currentPage.selection;
        // ── Guard: nothing selected ────────────────────────────────
        if (selection.length === 0) {
            figma.ui.postMessage({
                type: "error",
                message: "No layer selected. Please select a vector or SVG node.",
            });
            return;
        }
        // ── Guard: too many nodes selected ────────────────────────
        if (selection.length > 1) {
            figma.ui.postMessage({
                type: "error",
                message: "Please select only one vector node at a time.",
            });
            return;
        }
        const node = selection[0];
        // ── Guard: unsupported node type ──────────────────────────
        if (!isSupportedNode(node)) {
            figma.ui.postMessage({
                type: "error",
                message: `Selected layer is a "${node.type}" — please select a Vector (flattened SVG path).`,
            });
            return;
        }
        figma.ui.postMessage({
            type: "progress",
            message: "Reading path data…",
        });
        // ── Read path data ─────────────────────────────────────────
        const pathData = getVectorPathData(node);
        if (!pathData || pathData.trim() === "") {
            figma.ui.postMessage({
                type: "error",
                message: "Could not read path data from the selected node.",
            });
            return;
        }
        figma.ui.postMessage({
            type: "progress",
            message: "Parsing and splitting paths…",
        });
        // ── Split sub-paths ────────────────────────────────────────
        let subPaths;
        try {
            subPaths = splitPathData(pathData);
        }
        catch (err) {
            figma.ui.postMessage({
                type: "error",
                message: `Failed to parse path data: ${err.message}`,
            });
            return;
        }
        // ── Guard: already multiple sub-paths in one VectorNode ───
        if (subPaths.length <= 1) {
            figma.ui.postMessage({
                type: "error",
                message: subPaths.length === 0
                    ? "No valid sub-paths found in the selected vector."
                    : "The selected vector already contains a single path — nothing to split.",
            });
            return;
        }
        figma.ui.postMessage({
            type: "progress",
            message: `Creating ${subPaths.length} vector layers…`,
        });
        // ── Build individual vector nodes ──────────────────────────
        const parent = (_a = node.parent) !== null && _a !== void 0 ? _a : figma.currentPage;
        const originalIndex = parent.children.indexOf(node);
        const newVectors = subPaths.map((sp, idx) => createVectorFromSubPath(sp, node, idx));
        // ── Group them ────────────────────────────────────────────
        // First append all vectors so we can evaluate them
        newVectors.forEach(v => parent.appendChild(v));
        // Separate vectors based on whether they actively use fills
        const filledVectors = newVectors.filter(v => Array.isArray(v.fills) && v.fills.length > 0);
        const strokedVectors = newVectors.filter(v => !Array.isArray(v.fills) || v.fills.length === 0);
        const containerNodes = [];
        if (filledVectors.length > 1) {
            // Multiple filled shapes: use EXCLUDE to preserve transparent holes natively!
            const boolNode = figma.exclude(filledVectors, parent);
            boolNode.name = "Filled Shapes (Compound)";
            containerNodes.push(boolNode);
        }
        else if (filledVectors.length === 1) {
            containerNodes.push(filledVectors[0]);
        }
        // Loose lines or stroke-only paths simply join the structure normally without being eaten by booleans
        strokedVectors.forEach(v => containerNodes.push(v));
        let finalNode;
        if (containerNodes.length > 1) {
            finalNode = figma.group(containerNodes, parent);
            finalNode.name = `${node.name} — Split Paths`;
        }
        else if (containerNodes.length === 1) {
            finalNode = containerNodes[0];
            finalNode.name = `${node.name} — Split Paths`;
        }
        else {
            finalNode = figma.group(newVectors, parent);
        }
        finalNode.x = node.x;
        finalNode.y = node.y;
        // Insert the final construct cleanly into the layer tree
        parent.insertChild(originalIndex, finalNode);
        // ── Remove the original node ──────────────────────────────
        node.remove();
        // Select the new group for the user
        figma.currentPage.selection = [finalNode];
        figma.viewport.scrollAndZoomIntoView([finalNode]);
        figma.ui.postMessage({
            type: "success",
            count: subPaths.length,
        });
    });
}
// ── Plugin entry-point ───────────────────────────────────────
figma.showUI(__html__, { width: 340, height: 420, themeColors: true });
// Listen for messages from the UI
figma.ui.onmessage = (msg) => __awaiter(void 0, void 0, void 0, function* () {
    switch (msg.type) {
        case "convert":
            yield convertSelection();
            break;
        case "cancel":
            figma.closePlugin();
            break;
        default:
            break;
    }
});
