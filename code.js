"use strict";
// ============================================================
// SVG Path → Editable Stroke Vector — Figma Plugin
// Converts a selected flattened vector/SVG into a fully
// editable vector node with a visible stroke and no fill,
// ready for editing in Figma's vector network editor.
// ============================================================
// ── Helpers ──────────────────────────────────────────────────
/** Parse a hex color string (#RRGGBB or #RGB) into Figma RGB (0–1). */
function hexToRgb(hex) {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) {
        hex = hex.split("").map(c => c + c).join("");
    }
    const n = parseInt(hex, 16);
    return {
        r: ((n >> 16) & 0xff) / 255,
        g: ((n >> 8) & 0xff) / 255,
        b: (n & 0xff) / 255,
    };
}
/** Collect all VectorNodes from a node (handles groups / frames recursively). */
function collectVectors(node) {
    if (node.type === "VECTOR")
        return [node];
    if ("children" in node) {
        return node.children.reduce((acc, child) => acc.concat(collectVectors(child)), []);
    }
    return [];
}
// ── Main Conversion Logic ────────────────────────────────────
async function convertToEditableStroke(strokeColorHex, strokeWidth, removeOriginal) {
    var _a, _b, _c;
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
        figma.ui.postMessage({
            type: "error",
            message: "No layer selected. Please select a vector, SVG frame, or group.",
        });
        return;
    }
    if (selection.length > 1) {
        figma.ui.postMessage({
            type: "error",
            message: "Please select only one node at a time.",
        });
        return;
    }
    const node = selection[0];
    figma.ui.postMessage({ type: "progress", message: "Reading vector data…" });
    // Gather all vector paths inside the selected node
    const vectors = collectVectors(node);
    if (vectors.length === 0) {
        figma.ui.postMessage({
            type: "error",
            message: `Selected layer is a "${node.type}" — no vector paths found inside.`,
        });
        return;
    }
    figma.ui.postMessage({
        type: "progress",
        message: `Converting ${vectors.length} path(s) to editable stroke…`,
    });
    const strokeColor = hexToRgb(strokeColorHex);
    const parent = (_a = node.parent) !== null && _a !== void 0 ? _a : figma.currentPage;
    // Build a combined path data string from all vectors
    const allPathData = vectors
        .map(v => v.vectorPaths.map(p => p.data).join(" "))
        .join(" ");
    // Create one new editable vector node
    const newVec = figma.createVector();
    newVec.vectorPaths = [
        {
            windingRule: "NONZERO",
            data: allPathData,
        },
    ];
    // ── Stroke — fully editable ──────────────────────────────
    newVec.strokes = [
        {
            type: "SOLID",
            color: strokeColor,
            opacity: 1,
            visible: true,
            blendMode: "NORMAL",
        },
    ];
    newVec.strokeWeight = strokeWidth;
    newVec.strokeAlign = "CENTER";
    newVec.strokeCap = "ROUND";
    newVec.strokeJoin = "ROUND";
    newVec.strokeMiterLimit = 4;
    // ── No fill (pure stroke-based shape) ───────────────────
    newVec.fills = [];
    // ── Position & name ──────────────────────────────────────
    newVec.x = node.x;
    newVec.y = node.y;
    newVec.name = `${node.name} — Editable Stroke`;
    // Inherit opacity / blend mode (not all SceneNode subtypes expose these)
    const drawable = node;
    newVec.opacity = (_b = drawable.opacity) !== null && _b !== void 0 ? _b : 1;
    newVec.blendMode = (_c = drawable.blendMode) !== null && _c !== void 0 ? _c : "NORMAL";
    // Insert at the same stack position as original
    const originalIndex = parent.children.indexOf(node);
    parent.insertChild(originalIndex, newVec);
    if (removeOriginal) {
        node.remove();
    }
    figma.currentPage.selection = [newVec];
    figma.viewport.scrollAndZoomIntoView([newVec]);
    figma.ui.postMessage({
        type: "success",
        name: newVec.name,
    });
}
// ── Plugin entry-point ───────────────────────────────────────
figma.showUI(__html__, { width: 360, height: 480, themeColors: true });
figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
        case "convert":
            await convertToEditableStroke(msg.strokeColor, msg.strokeWidth, msg.removeOriginal);
            break;
        case "cancel":
            figma.closePlugin();
            break;
        default:
            break;
    }
};
