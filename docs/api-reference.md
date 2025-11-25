# API Reference

This document provides a reference for the public API of `page-dewarp-js`.

## WarpedImage Class

The main entry point for dewarping images programmatically.

### Constructor

```javascript
new WarpedImage(imgfile);
```

**Parameters:**

- `imgfile` (string): Path to the input image file

**Example:**

```javascript
import { loadOpenCV } from "./src/cv-loader.js";
import { WarpedImage } from "./src/image.js";

await loadOpenCV();

const warpedImage = new WarpedImage("input.jpg");
await warpedImage.process();
warpedImage.destroy();
```

### Methods

#### `async process()`

Executes the full dewarping pipeline:

1. Load and preprocess the image
2. Detect page boundaries
3. Generate text mask
4. Detect and filter text contours
5. Assemble contours into spans
6. Sample keypoints
7. Estimate initial pose
8. Optimize parameters
9. Generate and save dewarped output

**Returns:** `Promise<void>`

**Side Effects:**

- Creates output file: `{input_name}_thresh.png`
- If `DEBUG_LEVEL >= 1`, creates debug visualization images

#### `destroy()`

Releases OpenCV Mat resources. Should be called after processing is complete to prevent memory leaks.

**Returns:** `void`

### Properties

- `imgfile` (string): Input image file path
- `basename` (string): Input filename with extension
- `stem` (string): Input filename without extension
- `cv2_img` (cv.Mat): Full-resolution input image
- `small` (cv.Mat): Downsampled version for processing
- `pagemask` (cv.Mat): Binary mask of valid page area
- `page_outline` (Array): Page boundary coordinates
- `contour_list` (Array<ContourInfo>): Detected text contours

## Config Object

Global configuration singleton controlling all aspects of the pipeline.

### Usage

```javascript
import { Config, updateConfig } from "./src/config.js";

// Read a config value
console.log(Config.FOCAL_LENGTH);

// Update config
updateConfig({
  FOCAL_LENGTH: 1.5,
  TEXT_MIN_WIDTH: 20,
  DEBUG_LEVEL: 2,
});
```

### Camera Parameters

| Key            | Type   | Default | Description                                             |
| -------------- | ------ | ------- | ------------------------------------------------------- |
| `FOCAL_LENGTH` | number | 1.2     | Camera focal length as multiplier of max(width, height) |

### Contour Detection

| Key                  | Type   | Default | Description                                              |
| -------------------- | ------ | ------- | -------------------------------------------------------- |
| `TEXT_MIN_WIDTH`     | number | 15      | Minimum contour width in pixels                          |
| `TEXT_MIN_HEIGHT`    | number | 2       | Minimum contour height in pixels                         |
| `TEXT_MIN_ASPECT`    | number | 1.5     | Minimum width/height ratio                               |
| `TEXT_MAX_THICKNESS` | number | 10      | Maximum thickness (max consecutive pixels in any column) |

### Masking

| Key              | Type   | Default | Description                                  |
| ---------------- | ------ | ------- | -------------------------------------------- |
| `ADAPTIVE_WINSZ` | number | 55      | Adaptive threshold window size (must be odd) |

### Span Assembly

| Key                | Type   | Default | Description                                  |
| ------------------ | ------ | ------- | -------------------------------------------- |
| `SPAN_MIN_WIDTH`   | number | 30      | Minimum span width in pixels                 |
| `SPAN_PX_PER_STEP` | number | 20      | Spacing between keypoint samples along spans |

### Edge Scoring (Span Assembly)

| Key                | Type   | Default | Description                              |
| ------------------ | ------ | ------- | ---------------------------------------- |
| `EDGE_MAX_OVERLAP` | number | 1.0     | Maximum allowed contour overlap ratio    |
| `EDGE_MAX_LENGTH`  | number | 100.0   | Maximum distance between contour centers |
| `EDGE_ANGLE_COST`  | number | 10.0    | Cost multiplier for angle differences    |
| `EDGE_MAX_ANGLE`   | number | 7.5     | Maximum angle difference in degrees      |

### Page Margins

| Key             | Type   | Default | Description                 |
| --------------- | ------ | ------- | --------------------------- |
| `PAGE_MARGIN_X` | number | 50      | Horizontal margin in pixels |
| `PAGE_MARGIN_Y` | number | 20      | Vertical margin in pixels   |

### Optimization

| Key              | Type   | Default | Description                     |
| ---------------- | ------ | ------- | ------------------------------- |
| `OPTIM_MAX_ITER` | number | 60      | Maximum optimization iterations |
| `OPTIM_TOL`      | number | 1e-6    | Convergence tolerance           |

### Output

| Key              | Type   | Default | Description                                |
| ---------------- | ------ | ------- | ------------------------------------------ |
| `OUTPUT_ZOOM`    | number | 1.0     | Output scaling factor                      |
| `OUTPUT_DPI`     | number | 300     | Output DPI (for PDF conversion)            |
| `REMAP_DECIMATE` | number | 16      | Downsampling factor for remap computation  |
| `NO_BINARY`      | number | 0       | Skip binary thresholding (0=apply, 1=skip) |

### Debug

| Key            | Type   | Default | Description                                    |
| -------------- | ------ | ------- | ---------------------------------------------- |
| `DEBUG_LEVEL`  | number | 0       | Debug verbosity: 0=none, 1=basic, 2=detailed   |
| `DEBUG_OUTPUT` | string | "file"  | Debug output mode: "file", "screen", or "both" |
| `SCREEN_MAX_W` | number | 1280    | Maximum width for screen display               |
| `SCREEN_MAX_H` | number | 700     | Maximum height for screen display              |

### PDF

| Key              | Type    | Default | Description                  |
| ---------------- | ------- | ------- | ---------------------------- |
| `CONVERT_TO_PDF` | boolean | false   | Convert output to PDF format |

### Parameter Indexing (Internal)

| Key         | Type  | Default | Description                                              |
| ----------- | ----- | ------- | -------------------------------------------------------- |
| `RVEC_IDX`  | Array | [0, 3]  | Start/end indices for rotation vector in parameter array |
| `TVEC_IDX`  | Array | [3, 6]  | Start/end indices for translation vector                 |
| `CUBIC_IDX` | Array | [6, 8]  | Start/end indices for cubic parameters                   |

## DebugMetrics Class

Static class for collecting and saving metrics during processing.

### Methods

#### `static reset()`

Clears all collected metrics. Automatically called at the start of each `WarpedImage.process()`.

**Returns:** `void`

#### `static add(key, value)`

Adds a metric to the collection.

**Parameters:**

- `key` (string): Metric identifier
- `value` (any): Metric value (arrays, objects, numbers, etc.)

**Example:**

```javascript
import { DebugMetrics } from "./src/debug-metrics.js";

DebugMetrics.add("image_dims", {
  width: 1920,
  height: 1080,
});

DebugMetrics.add("span_count", 42);
```

#### `static async save(filename)`

Saves all collected metrics to a JSON file.

**Parameters:**

- `filename` (string): Output file path

**Returns:** `Promise<void>`

**Example:**

```javascript
await DebugMetrics.save("debug/metrics.json");
```

### Collected Metrics

When `DEBUG_LEVEL >= 2`, the following metrics are automatically collected:

- `image_dims`: Original and resized image dimensions
- `page_extents`: Page outline coordinates
- `contour_stats`: Contour detection statistics
- `span_info`: Assembled spans data
- `keypoint_info`: Sampled keypoint coordinates
- `initial_params`: Initial parameter vector before optimization
- `optimization_result`: Final parameter vector and objective value
- `projection_stats`: Reprojection error statistics

## CLI Options

See [README.md](../README.md) for complete CLI documentation.

### Basic Usage

```bash
node src/cli.js [options] <input_images...>
```

### Common Options

```bash
# Enable debug output
node src/cli.js -d 2 -o both input.jpg

# Adjust text detection
node src/cli.js --min-text-width 20 --max-text-thickness 12 input.jpg

# High-resolution output
node src/cli.js --output-zoom 2 --output-dpi 600 input.jpg

# Disable binary thresholding
node src/cli.js --no-binary 1 input.jpg
```

## Low-Level APIs

### Projection

```javascript
import { projectXY, getK } from "./src/projection.js";

// Get camera intrinsic matrix
const K = getK(imgShape);

// Project 2D page coordinates to 2D image coordinates
const xyCoords = [[0, 0], [1, 0], [1, 1], [0, 1]];
const pvec = [...]; // Parameter vector
const imagePoints = projectXY(xyCoords, pvec);
```

### Optimization

```javascript
import { minimize } from "./src/optimise.js";

// Minimize a function using Powell's method
const objective = (x) => (x[0] - 2) ** 2 + (x[1] - 3) ** 2;
const result = minimize(objective, [0, 0], {
  maxIter: 100,
  tol: 1e-6,
  log: true,
});

console.log(result.x); // [2, 3]
console.log(result.fx); // 0
```

### Coordinate Utilities

```javascript
import { pix2norm, norm2pix } from "./src/utils.js";

const shape = { rows: 1080, cols: 1920 };

// Pixel to normalized coordinates (centered at image center)
const normalized = pix2norm(shape, [
  [960, 540],
  [1920, 1080],
]);

// Normalized to pixel coordinates
const pixels = norm2pix(shape, normalized, true); // true = round to integers
```

### Image I/O

```javascript
import { loadImageMat, saveMat } from "./src/utils.js";

// Load image
const img = await loadImageMat("input.jpg");

// Save image
await saveMat(img, "output.png");

// Clean up
img.delete();
```

## Type Definitions

### ContourInfo

Represents a detected text contour.

```typescript
class ContourInfo {
  contour: cv.Mat; // Raw contour points
  rect: {
    // Bounding box
    x: number;
    y: number;
    width: number;
    height: number;
  };
  mask: cv.Mat; // Cropped binary mask
  center: [number, number]; // Centroid [x, y]
  tangent: [number, number]; // Orientation vector [x, y]
  angle: number; // Orientation angle in radians
  point0: [number, number]; // Start of major axis
  point1: [number, number]; // End of major axis
  pred: ContourInfo | null; // Predecessor in span chain
  succ: ContourInfo | null; // Successor in span chain
}
```

### Span

A horizontal text line.

```typescript
type Span = ContourInfo[];
```

### Parameter Vector

See [data_structures.md](./data_structures.md) for detailed parameter vector structure.
