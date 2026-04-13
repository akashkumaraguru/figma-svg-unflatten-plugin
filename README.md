# SVG Path Splitter — Figma Plugin

Convert a **flattened single-path SVG** into **multiple editable vector layers**, grouped for easy editing.

---

## 📁 Project Structure

```
svg-path-splitter/
├── manifest.json   ← Plugin metadata (Figma reads this)
├── code.js         ← Plugin logic (compiled, ready to run)
├── code.ts         ← TypeScript source (for editing/development)
└── ui.html         ← Plugin UI (self-contained HTML/CSS/JS)
```

---

## 🚀 Installation in Figma (Development Mode)

### Step 1 — Open Figma Desktop
The Figma Plugin API requires the **desktop app** (not the browser) for local plugin development.

### Step 2 — Open Plugin Manager
In Figma desktop:
1. Go to **Main Menu** (☰) → **Plugins** → **Development** → **Manage plugins in development…**

   *Or* use the keyboard shortcut:
   - macOS: `⌘ Cmd + /` → type "plugins"
   - Windows: `Ctrl + /` → type "plugins"

### Step 3 — Add the Plugin
1. Click the **"+"** button (top-right of the dialog)
2. Choose **"Import plugin from manifest…"**
3. Navigate to the `svg-path-splitter/` folder
4. Select **`manifest.json`**
5. Click **Open**

### Step 4 — Run the Plugin
1. Open any Figma file
2. Go to **Main Menu → Plugins → Development → SVG Path Splitter**
3. The plugin panel will appear

---

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

---

## ⚠️ Error Cases Handled

| Situation | Message |
|-----------|---------|
| Nothing selected | "No layer selected…" |
| Multiple nodes selected | "Please select only one…" |
| Non-vector node selected | "Selected layer is a `{TYPE}`…" |
| Already a single sub-path | "Already contains a single path…" |
| Empty/unreadable path data | "Could not read path data…" |

---

## 🔧 Development Notes

### Editing the TypeScript source
The plugin ships `code.js` (plain JS) so it runs without a build step. If you want to modify `code.ts`:

**Option A — Manual compile (no bundler)**
```bash
npx tsc code.ts --target ES6 --moduleResolution node --outDir .
```

**Option B — With Webpack (recommended for larger plugins)**
```bash
npm init -y
npm install --save-dev typescript webpack webpack-cli ts-loader @figma/plugin-typings
npx webpack
```

### Figma type definitions
To get full TypeScript support:
```bash
npm install --save-dev @figma/plugin-typings
```

Then add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "typeRoots": ["./node_modules/@figma/plugin-typings"]
  }
}
```

---

## 🧠 How the Path Splitting Works

SVG paths encode multiple disconnected shapes in a single `d` string by using multiple `M` (move-to) commands:

```
M 10 20 L 30 40 Z   ← sub-path 1
M 50 60 C 70 80...  ← sub-path 2
```

The parser:
1. **Tokenizes** the `d` string (separating commands from coordinates)
2. **Walks** the token list, starting a new sub-path at each `M`/`m`
3. **Handles implicit repetition** (e.g. `L 10 20 30 40` = two L commands)
4. Returns an array of path strings, one per sub-path

Each sub-path is then assigned to a new `figma.createVector()` node with the original's fill, stroke, and position cloned.

---

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
