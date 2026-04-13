# SVG Path Splitter — Figma Plugin

Convert a **flattened single-path SVG** into **multiple editable vector layers**, grouped for easy editing.

## 🎯 How to Use

1. **Select a vector node** — Import or create a flattened SVG (single compound path). Use **Edit › Flatten Selection** if needed.
2. **Click "Convert to Editable Paths"** in the plugin panel.
3. The plugin will:
   - Parse the SVG path data (`d` attribute)
   - Split it into individual sub-paths
   - Create a **VectorNode per sub-path**
   - Wrap them all in a **named Group**
   - Delete the original flattened node
   - Select and zoom to the new group

## 📦 Supported SVG Path Commands

| Command | Description |
|---------|-------------|
| `M/m` | Move to (starts a new sub-path) |
| `L/l` | Line to |
| `H/h` | Horizontal line |
| `V/v` | Vertical line |
| `C/c` | Cubic Bézier curve |
| `S/s` | Smooth cubic Bézier |
| `Q/q` | Quadratic Bézier curve |
| `T/t` | Smooth quadratic Bézier |
| `A/a` | Arc |
| `Z/z` | Close path |

---

## 📄 License

MIT — free to use and modify.
