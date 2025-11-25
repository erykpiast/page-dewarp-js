# Debugging & Metrics Collection

This document describes the debugging and metrics collection infrastructure available in `page-dewarp-js` and how to use it to diagnose processing issues and compare implementations.

## Overview

The library includes a comprehensive metrics collection system that captures intermediate state at each stage of the processing pipeline. This is particularly useful for:

- Comparing JavaScript implementation against the reference Python implementation
- Diagnosing why specific images fail to dewarp correctly
- Understanding where in the pipeline divergence occurs
- Performance profiling and optimization

## Directory Structure for Benchmarking

For benchmarking and debugging purposes, the Python reference implementation should be located next to this repository:

```
Development/
├── page-dewarp/          # Python reference implementation
└── page-dewarp-js/       # JavaScript implementation (this repository)
```

This allows comparison scripts and tools to access both implementations easily. The Python implementation can be cloned from:

```bash
cd /path/to/Development
git clone https://github.com/lmmx/page-dewarp.git
```

With both repositories in place, you can compare outputs and metrics between implementations using the same test images.

## Debug Levels

The library supports multiple debug levels controlled by the `DEBUG_LEVEL` config parameter:

- **0**: No debug output (production mode)
- **1**: Save keypoint correspondence visualizations (before/after optimization)
- **2**: Additional intermediate visualizations
- **3**: Full debugging output including original image

Enable debug output via CLI:

```bash
node src/cli.js image.jpg -d 1
```

## Debug Metrics System

### DebugMetrics Class

Located in `src/debug-metrics.js`, this singleton class collects structured metrics during processing.

**Key Methods:**

- `DebugMetrics.add(key, value)` - Record a metric
- `DebugMetrics.save(filepath)` - Export all metrics to JSON
- `DebugMetrics.reset()` - Clear collected metrics
- `DebugMetrics.getAll()` - Retrieve all metrics

### Collected Metrics

The following metrics are automatically collected during processing:

#### 1. Image Dimensions
```json
{
  "image_dims": {
    "original": {"width": 2448, "height": 3264},
    "resized": {"width": 490, "height": 653}
  }
}
```

#### 2. Page Extents
```json
{
  "page_extents": {
    "page_outline": [[50, 20], [50, 633], [440, 633], [440, 20]]
  }
}
```

#### 3. Contour Detection
```json
{
  "contours_count": 112,
  "contours_sample": [
    {"x": 359, "y": 584, "width": 53, "height": 8},
    // ... first 5 contours
  ]
}
```

#### 4. Span Assembly
```json
{
  "spans_count": 54,
  "spans_sample": [
    {
      "x0": 107,
      "x1": 370,
      "y_start": 47.807,
      "y_end": 28.439,
      "contour_count": 3
    },
    // ... first 5 spans
  ]
}
```

#### 5. Keypoint Generation
```json
{
  "keypoints_count": 42,
  "keypoints_sample": [
    [-0.596, -0.944],
    [0.607, -0.937],
    // ... first 10 keypoints
  ],
  "dstpoints": [/* all destination points */]
}
```

#### 6. Optimization Metrics
```json
{
  "initial_params": [/* parameter vector before optimization */],
  "initial_cost": 0.0744,
  "final_params": [/* optimized parameter vector */],
  "final_cost": 0.00502,
  "optimization_time": 15.8,
  "page_dims": [1.190, 1.846]
}
```

## Comparing Implementations

### Running Both Implementations

To collect comparable metrics from both Python and JavaScript implementations:

**Python:**
```bash
cd page-dewarp
python -m page_dewarp example_input/boston_cooking_a.jpg -d 1
```

This generates: `debug/boston_cooking_a_metrics_python.json`

**JavaScript:**
```bash
cd page-dewarp-js
node src/cli.js ../page-dewarp/example_input/boston_cooking_a.jpg -d 1
```

This generates: `debug/boston_cooking_a_metrics_js.json`

### Analyzing Differences

The metrics files can be compared stage-by-stage to identify where implementations diverge:

**Stage 1: Image Loading**
- If `image_dims` differ, check image loading/resizing logic

**Stage 2: Contour Detection**
- If `contours_count` differs significantly (>10%), check:
  - Adaptive threshold parameters
  - Morphological operations
  - Contour filtering criteria

**Stage 3: Span Assembly**
- If `spans_count` differs, investigate:
  - Edge cost calculations in `spans.js`
  - Contour sorting/pairing logic
  - Span merging thresholds

**Stage 4: Initial Optimization State**
- If `initial_cost` differs, the problem is in:
  - `dstpoints` generation (keypoint sampling)
  - `project_keypoints` implementation
  - Parameter initialization in `solve.js`

**Stage 5: Optimization Convergence**
- If `final_cost` differs significantly:
  - Optimizer algorithm differences (Powell vs Coordinate Descent)
  - Number of iterations
  - Convergence tolerance

## Debug Visualizations

When `DEBUG_LEVEL >= 1`, the following visualizations are automatically saved to the `debug/` folder:

### Keypoint Correspondences

- `{stem}_4_keypoints_before.png` - Shows detected points (red) and initial projected points (blue) with connecting lines
- `{stem}_4_keypoints_after.png` - Shows the same after optimization

These visualizations help verify that:
1. Text spans were detected correctly
2. The projection model is reasonable
3. Optimization improved the alignment

### Warped Grid

- `{stem}_5_warped_grid.png` - Shows the projected grid overlaid on the original image after optimization

This helps verify:
1. The dewarping model captures the page curvature
2. Grid lines follow text lines correctly

## Performance Profiling

The metrics include timing information:

- `optimization_time` - Duration of the parameter optimization step (typically 5-20 seconds)

Additional timing can be added by instrumenting specific functions with:

```javascript
const start = Date.now();
// ... code to profile ...
const duration = (Date.now() - start) / 1000;
DebugMetrics.add('my_operation_time', duration);
```

## Troubleshooting Common Issues

### Low SSIM Scores in Benchmarks

If benchmark tests show low SSIM (Structural Similarity Index) scores:

1. Compare `spans_count` - Too few/many spans indicate span assembly issues
2. Check `initial_cost` vs `final_cost` - Small improvement suggests optimizer stuck
3. Examine `page_dims` - Incorrect dimensions will stretch/compress output

### Optimization Not Converging

If `final_cost` remains high (>0.01):

1. Check `initial_cost` - If already high, the issue is upstream
2. Verify `dstpoints` has sufficient samples
3. Consider increasing `maxIter` in the optimizer
4. Try a different optimization algorithm

### Missing or Incorrect Spans

If text lines aren't detected:

1. Adjust contour filtering thresholds (`TEXT_MIN_WIDTH`, `TEXT_MIN_HEIGHT`)
2. Modify edge assembly parameters (`EDGE_MAX_ANGLE`, `EDGE_MAX_LENGTH`)
3. Check the threshold visualization to ensure text is visible

## API Usage

### Programmatic Metric Access

```javascript
import { DebugMetrics } from './debug-metrics.js';
import { WarpedImage } from './image.js';

// Reset before processing
DebugMetrics.reset();

// Process image
const img = new WarpedImage('input.jpg');
await img.process();

// Access metrics
const metrics = DebugMetrics.getAll();
console.log('Spans detected:', metrics.spans_count);
console.log('Final cost:', metrics.final_cost);

// Save to custom location
DebugMetrics.save('my-analysis/results.json');
```

### Comparing Python and JavaScript Implementations

The `compare-metrics.js` script provides automated comparison between Python and JavaScript metrics output:

```bash
# Generate metrics from both implementations
cd ../page-dewarp
python -m page_dewarp.cli benchmark/example_input/boston_cooking_a.jpg -d 2
# Creates: debug/boston_cooking_a_metrics_python.json

cd ../page-dewarp-js
node src/cli.js benchmark/example_input/boston_cooking_a.jpg -d 2
# Creates: debug/boston_cooking_a_metrics_js.json

# Compare metrics
node compare-metrics.js
```

The comparison script analyzes:

- Image dimensions and page extents
- Contour detection counts and bounding boxes
- Mask pipeline statistics
- Span assembly results
- Keypoint generation and sampling
- Initial parameter values
- Optimization convergence
- Page dimensions

Output includes color-coded status indicators (🟢/🟡/🔴) highlighting areas of alignment or divergence.

**Note:** The script expects the Python implementation to be at `../page-dewarp/` relative to this repository.

### Python Equivalent

```python
from page_dewarp.debug_utils import DebugMetrics
from page_dewarp.image import WarpedImage

# Reset before processing
DebugMetrics.reset()

# Process image
img = WarpedImage('input.jpg')

# Metrics are automatically saved to debug/{stem}_metrics_python.json
```

## Future Enhancements

Potential additions to the debugging system:

- **Diff Tool**: Automated script to compare Python vs JS metrics and highlight differences
- **Visual Comparison**: Side-by-side image comparison in HTML report
- **Performance Flamegraphs**: Detailed timing breakdown per function
- **Metric History**: Track how metrics change across optimization iterations

