# Data Structures

## ContourInfo

Represents a single detected blob (character or word).

- `contour`: Raw points (numpy array / cv.Mat).
- `rect`: Bounding box `(x, y, w, h)`.
- `mask`: Binary mask of the contour.
- `center`: Centroid `(x, y)`.
- `tangent`: Orientation unit vector.
- `angle`: Orientation angle.
- `point0`, `point1`: Extremities along the major axis.
- `pred`, `succ`: Pointers to predecessor/successor `ContourInfo` objects (linked list structure for spans).

## Span

A `Span` is simply a list of `ContourInfo` objects: `[c1, c2, ..., cn]`.

- Represents a single line of text.
- Assembled by linking contours based on geometric proximity and alignment.

## Parameter Vector (`pvec`)

A flat 1D array optimized by the solver. All parameters are continuous values subject to optimization.

### Structure

The parameter vector is partitioned into the following sections (indices defined in `Config`):

1. **Camera Pose** (indices 0-5):
   - `rvec` (indices 0-2): Rotation vector in Rodrigues format `[rx, ry, rz]`
   - `tvec` (indices 3-5): Translation vector `[tx, ty, tz]`
   - Together these define the 3D pose of the page relative to the camera

2. **Cubic Surface Parameters** (indices 6-7):
   - `alpha` (index 6): Slope at left edge of cubic curve
   - `beta` (index 7): Slope at right edge of cubic curve
   - Define the page curvature along the horizontal axis

3. **Span Y-coordinates** (indices 8 to 8+N_SPANS):
   - One value per text line span
   - Represents the normalized vertical position of each span on the flattened page
   - Allows vertical refinement beyond uniform spacing

4. **Keypoint X-coordinates** (indices 8+N_SPANS to end):
   - One value per sampled keypoint across all spans
   - Represents the normalized horizontal position of each keypoint
   - Allows horizontal refinement along each text line

### Index Calculation

Given span index `i` and point index `j` within that span:

```javascript
const ycoordIdx = 8 + i;
const xcoordIdx = 8 + N_SPANS + keypointIndex[i][j];
```

The `keypointIndex` data structure (created by `makeKeypointIndex()`) maps each `(span, point)` pair to its index in the parameter vector.

### Total Size

```
totalParams = 8 + N_SPANS + N_KEYPOINTS
```

where:
- `N_SPANS` = number of text lines detected
- `N_KEYPOINTS` = total number of sampled points across all spans

### Optimization

The entire parameter vector is optimized simultaneously using Powell's method to minimize the reprojection error between detected 2D keypoints and their projected positions from the 3D model.

## Mask

Represents a binary text mask generated from the input image.

### Properties

- `name`: Image identifier for debugging
- `small`: Downsampled image (cv.Mat)
- `pagemask`: Binary mask defining the valid page area
- `text`: Boolean flag (true for text mode, false for line mode)
- `value`: Generated binary mask (cv.Mat)

### Process

1. Convert to grayscale
2. Apply adaptive thresholding (window size: `ADAPTIVE_WINSZ`)
3. Apply morphological closing to connect nearby text pixels
4. Intersect with page mask to remove margin areas
5. Clean up noise with erosion/dilation

The resulting mask highlights text regions suitable for contour detection.

## RemappedImage

Handles the final dewarping and output generation.

### Properties

- `name`: Image identifier
- `img`: Full-resolution input image (cv.Mat RGB)
- `small`: Downsampled version
- `pageDims`: Normalized page dimensions `[width, height]`
- `params`: Optimized parameter vector
- `threshfile`: Output filename

### Process

1. **Compute Output Dimensions**: Calculate output image size based on page aspect ratio and zoom settings
2. **Build Remap Maps**: For each output pixel, compute corresponding input coordinates using the inverse projection
3. **Apply Remapping**: Use `cv.remap()` to generate the flattened image
4. **Threshold**: Apply adaptive thresholding to the dewarped image for clean binary output
5. **Save**: Write result to file

The remap maps are built at a reduced resolution (`REMAP_DECIMATE`) for performance, then upscaled for the final output.

## Config

Global configuration object (singleton).

- Camera intrinsics (Focal length).
- Detection thresholds (min width, max thickness).
- Optimization constraints.
- Output settings (DPI, Zoom).
