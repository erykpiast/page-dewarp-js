# Algorithms

## 1. Contour Orientation (PCA/Moments)

To determine the local orientation of a text blob, the system uses 2nd-order central moments.

- **Covariance Matrix**: Constructed from moments `mu20`, `mu11`, `mu02`.
- **SVD/PCA**: The eigenvectors of this matrix represent the principal axes of the blob.
- **Tangent**: The primary eigenvector gives the direction of the text line at that point.

## 2. Contour Filtering Criteria

Before span assembly, detected contours are filtered to retain only valid text blobs.

### Geometric Constraints

- **TEXT_MIN_WIDTH** (default: 15px): Minimum contour bounding box width. Filters out very narrow artifacts.
- **TEXT_MIN_HEIGHT** (default: 2px): Minimum contour bounding box height. Removes horizontal lines and noise.
- **TEXT_MIN_ASPECT** (default: 1.5): Minimum width/height ratio. Text blobs are typically wider than tall.

### Thickness Test

- **TEXT_MAX_THICKNESS** (default: 10px): Maximum "thickness" of a text blob.
- Computed by scanning column-by-column through the contour's tight mask.
- For each column, count consecutive foreground pixels (runs).
- The longest run across all columns is the "maximum thickness".
- Rejects thick blobs that are likely images or non-text elements.

### Purpose

These filters ensure the optimization stage only considers legitimate text regions, improving robustness and speed.

## 3. Span Assembly

Contours are linked into chains (spans) using a greedy pairing strategy.

### Span Assembly Scoring

For every pair of contours, a "link score" is calculated to determine if they belong to the same text line:

#### Distance Component

- **EDGE_MAX_LENGTH** (default: 100px): Maximum allowed distance between contour centers.
- Links beyond this distance are rejected outright.
- For valid distances, cost increases with separation.

#### Overlap Component

- **EDGE_MAX_OVERLAP** (default: 1.0): Maximum allowed overlap ratio.
- Overlap is computed by projecting both contours onto the line connecting their centers.
- Penalizes contours that overlap significantly (likely vertically stacked rather than horizontally adjacent).

#### Angular Alignment

- **EDGE_ANGLE_COST** (default: 10.0): Multiplier applied to angular differences.
- **EDGE_MAX_ANGLE** (default: 7.5°): Maximum allowed angle difference between contour orientations.
- Contours in the same text line should have similar orientations (tangent vectors).
- Cost = `angle_difference × EDGE_ANGLE_COST`.

#### Total Score

The total link score combines distance, overlap, and angular components. Lower scores indicate better matches.

### Graph Building

The best links are chosen to form predecessor/successor relationships, creating linear chains (spans) that represent text lines.

## 4. Cubic Projection Model

The page surface is modeled as a "generalized cylinder" or a surface swept by a cubic curve.

- **Cubic Curve**: $z = f(x)$
- **Boundary Conditions**:
  - $f(0) = 0$
  - $f(1) = 0$
  - $f'(0) = \alpha$
  - $f'(1) = \beta$
- **Polynomial**: Derived from these conditions:
  $poly = [\alpha + \beta, -2\alpha - \beta, \alpha, 0]$
- **Projection**: 3D points $(x, y, z)$ are projected to 2D image coordinates using the camera intrinsic matrix $K$ and pose $(rvec, tvec)$.

## 5. Optimization

The core problem is finding the parameters that best align the 3D model with the observed 2D text spans.

- **Objective Function**: $\sum || \text{detected\_points} - \text{projected\_points} ||^2$
- **Parameters**:
  - Rigid pose ($rvec, tvec$) - 6 params.
  - Shape ($\alpha, \beta$) - 2 params.
  - Grid refinements ($y_i, x_{ij}$) - many params.
- **Method**: Powell's method (derivative-free optimization using sequential 1D line searches) is used in both Python and JavaScript implementations.

## 6. Coordinate Remapping

To generate the final image, we reverse the projection.

- We iterate over the target (flat) image pixels.
- Map each target $(u, v)$ to a normalized page coordinate $(x, y)$.
- Calculate $z$ using the cubic model.
- Project $(x, y, z)$ to source image coordinates $(u', v')$.
- Sample the source image at $(u', v')$.
