// ============================================================
// SVG Path → Editable Stroke Vector — Figma Plugin
// Converts a selected flattened vector/SVG into a fully
// editable vector node with a visible stroke and no fill,
// ready for editing in Figma's vector network editor.
// ============================================================

// ── Message types between UI and plugin ─────────────────────

type UIMessage =
  | { type: "convert"; strokeColor: string; strokeWidth: number; removeOriginal: boolean }
  | { type: "cancel" };

type PluginMessage =
  | { type: "progress"; message: string }
  | { type: "success"; name: string }
  | { type: "error"; message: string };

// ── Helpers ──────────────────────────────────────────────────

/** Parse a hex color string (#RRGGBB or #RGB) into Figma RGB (0–1). */
function hexToRgb(hex: string): RGB {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex.split("").map(c => c + c).join("");
  }
  const n = parseInt(hex, 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8)  & 0xff) / 255,
    b: (n         & 0xff) / 255,
  };
}

/** Collect all VectorNodes from a node (handles groups / frames recursively). */
function collectVectors(node: SceneNode): VectorNode[] {
  if (node.type === "VECTOR") return [node];
  if ("children" in node) {
    return (node.children as SceneNode[]).reduce<VectorNode[]>(
      (acc, child) => acc.concat(collectVectors(child)),
      []
    );
  }
  return [];
}

// ── Main Conversion Logic ────────────────────────────────────

async function convertToEditableStroke(
  strokeColorHex: string,
  strokeWidth: number,
  removeOriginal: boolean
): Promise<void> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: "error",
      message: "No layer selected. Please select a vector, SVG frame, or group.",
    } as PluginMessage);
    return;
  }

  if (selection.length > 1) {
    figma.ui.postMessage({
      type: "error",
      message: "Please select only one node at a time.",
    } as PluginMessage);
    return;
  }

  const node = selection[0];

  figma.ui.postMessage({ type: "progress", message: "Reading vector data…" } as PluginMessage);

  // Gather all vector paths inside the selected node
  const vectors = collectVectors(node);

  if (vectors.length === 0) {
    figma.ui.postMessage({
      type: "error",
      message: `Selected layer is a "${node.type}" — no vector paths found inside.`,
    } as PluginMessage);
    return;
  }

  figma.ui.postMessage({
    type: "progress",
    message: `Converting ${vectors.length} path(s) to editable stroke…`,
  } as PluginMessage);

  const strokeColor = hexToRgb(strokeColorHex);
  const parent = node.parent ?? figma.currentPage;

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
  newVec.strokeWeight    = strokeWidth;
  newVec.strokeAlign     = "CENTER";
  newVec.strokeCap       = "ROUND";
  newVec.strokeJoin      = "ROUND";
  newVec.strokeMiterLimit = 4;

  // ── No fill (pure stroke-based shape) ───────────────────
  newVec.fills = [];

  // ── Position & name ──────────────────────────────────────
  newVec.x    = node.x;
  newVec.y    = node.y;
  newVec.name = `${node.name} — Editable Stroke`;

  // Inherit opacity / blend mode (not all SceneNode subtypes expose these)
  const drawable = node as unknown as { opacity?: number; blendMode?: BlendMode };
  newVec.opacity   = drawable.opacity   ?? 1;
  newVec.blendMode = drawable.blendMode ?? "NORMAL";

  // Insert at the same stack position as original
  const originalIndex = parent.children.indexOf(node as SceneNode);
  parent.insertChild(originalIndex, newVec);

  if (removeOriginal) {
    node.remove();
  }

  figma.currentPage.selection = [newVec];
  figma.viewport.scrollAndZoomIntoView([newVec]);

  figma.ui.postMessage({
    type: "success",
    name: newVec.name,
  } as PluginMessage);
}

// ── Plugin entry-point ───────────────────────────────────────

figma.showUI(__html__, { width: 360, height: 480, themeColors: true });

figma.ui.onmessage = async (msg: UIMessage) => {
  switch (msg.type) {
    case "convert":
      await convertToEditableStroke(
        msg.strokeColor,
        msg.strokeWidth,
        msg.removeOriginal
      );
      break;

    case "cancel":
      figma.closePlugin();
      break;

    default:
      break;
  }
};
