// ============================================================
// SVG Path Splitter — Figma Plugin
// Splits a flattened single-path vector into individual editable
// vector layers, all grouped together for easy editing.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface SubPath {
  d: string;          // The SVG path data string for this sub-path
  isClosed: boolean;  // Whether the sub-path ends with a Z command
}

// ── Message types between UI and plugin ─────────────────────

type UIMessage =
  | { type: "convert" }
  | { type: "cancel" };

type PluginMessage =
  | { type: "progress"; message: string }
  | { type: "success"; count: number }
  | { type: "error"; message: string }
  | { type: "info"; subPathCount: number; isSingle: boolean };

// ── Path Parsing ─────────────────────────────────────────────

/**
 * Splits the SVG path d-string natively into discrete sub-paths.
 * Each sub-path always starts at an M or m command.
 */
function splitPathData(d: string): SubPath[] {
  const matches = d.match(/[Mm][^Mm]*/g);
  if (!matches) return [];

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
 */
function getVectorPathData(node: VectorNode): string {
  const paths = node.vectorPaths;
  if (!paths || paths.length === 0) return "";
  return paths.map(p => p.data).join(" ");
}

/**
 * Checks whether the node is a plain VectorNode.
 */
function isSupportedNode(node: SceneNode): node is VectorNode {
  return node.type === "VECTOR";
}

/**
 * Creates a new VectorNode from a sub-path string, faithfully copying
 * fills AND strokes from the original. No booleans are applied —
 * each path is placed as-is so the visual appearance is preserved.
 */
function createVectorFromSubPath(
  subPath: SubPath,
  original: VectorNode,
  index: number
): VectorNode {
  const vec = figma.createVector();

  // Use NONZERO winding — the standard SVG default that matches
  // how the original node was rendered before splitting.
  vec.vectorPaths = [
    {
      windingRule: "NONZERO",
      data: subPath.d,
    },
  ];

  // ── Copy fills exactly ──────────────────────────────────────
  const originalFills = Array.isArray(original.fills) ? original.fills : [];
  vec.fills = originalFills.length > 0
    ? JSON.parse(JSON.stringify(originalFills))
    : [];

  // ── Copy strokes exactly ────────────────────────────────────
  const originalStrokes = Array.isArray(original.strokes) ? original.strokes : [];
  if (originalStrokes.length > 0) {
    vec.strokes = JSON.parse(JSON.stringify(originalStrokes));
    vec.strokeWeight = typeof original.strokeWeight === "number"
      ? original.strokeWeight
      : 1;
    vec.strokeAlign = original.strokeAlign;
    vec.strokeCap   = original.strokeCap;
    vec.strokeJoin  = original.strokeJoin;
  } else {
    vec.strokes = [];
  }

  vec.x = original.x;
  vec.y = original.y;
  vec.name = `Path ${index + 1}`;
  return vec;
}

// ── Main Conversion Logic ────────────────────────────────────

async function convertSelection(): Promise<void> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: "error",
      message: "No layer selected. Please select a vector or SVG node.",
    } as PluginMessage);
    return;
  }

  if (selection.length > 1) {
    figma.ui.postMessage({
      type: "error",
      message: "Please select only one vector node at a time.",
    } as PluginMessage);
    return;
  }

  const node = selection[0];

  if (!isSupportedNode(node)) {
    figma.ui.postMessage({
      type: "error",
      message: `Selected layer is a "${node.type}" — please select a Vector (flattened SVG path).`,
    } as PluginMessage);
    return;
  }

  figma.ui.postMessage({ type: "progress", message: "Reading path data…" } as PluginMessage);

  const pathData = getVectorPathData(node);

  if (!pathData || pathData.trim() === "") {
    figma.ui.postMessage({
      type: "error",
      message: "Could not read path data from the selected node.",
    } as PluginMessage);
    return;
  }

  figma.ui.postMessage({ type: "progress", message: "Parsing and splitting paths…" } as PluginMessage);

  let subPaths: SubPath[];
  try {
    subPaths = splitPathData(pathData);
  } catch (err) {
    figma.ui.postMessage({
      type: "error",
      message: `Failed to parse path data: ${(err as Error).message}`,
    } as PluginMessage);
    return;
  }

  if (subPaths.length <= 1) {
    figma.ui.postMessage({
      type: "error",
      message:
        subPaths.length === 0
          ? "No valid sub-paths found in the selected vector."
          : "The selected vector already contains a single path — nothing to split.",
    } as PluginMessage);
    return;
  }

  figma.ui.postMessage({
    type: "progress",
    message: `Creating ${subPaths.length} vector layers…`,
  } as PluginMessage);

  const parent = node.parent ?? figma.currentPage;
  const originalIndex = parent.children.indexOf(node as SceneNode);

  // Build individual vector nodes — each is a exact style clone of the original
  const newVectors: VectorNode[] = subPaths.map((sp, idx) =>
    createVectorFromSubPath(sp, node, idx)
  );

  // Append all vectors to the parent first
  newVectors.forEach(v => parent.appendChild(v));

  // ── Group (no booleans) ───────────────────────────────────
  // Booleans (EXCLUDE, UNION, etc.) alter geometry and cause the
  // broken compound shape seen on the right side of the canvas.
  // A plain group preserves every path's appearance exactly.
  let finalNode: SceneNode;
  if (newVectors.length > 1) {
    finalNode = figma.group(newVectors, parent);
  } else {
    finalNode = newVectors[0];
  }
  finalNode.name = `${node.name} — Split Paths`;
  finalNode.x = node.x;
  finalNode.y = node.y;

  parent.insertChild(originalIndex, finalNode);
  node.remove();

  figma.currentPage.selection = [finalNode];
  figma.viewport.scrollAndZoomIntoView([finalNode]);

  figma.ui.postMessage({
    type: "success",
    count: subPaths.length,
  } as PluginMessage);
}

// ── Plugin entry-point ───────────────────────────────────────

figma.showUI(__html__, { width: 340, height: 420, themeColors: true });

figma.ui.onmessage = async (msg: UIMessage) => {
  switch (msg.type) {
    case "convert":
      await convertSelection();
      break;

    case "cancel":
      figma.closePlugin();
      break;

    default:
      break;
  }
};
