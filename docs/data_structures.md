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

A flat 1D array optimized by the solver.
Structure:

- `[0:3]`: `rvec` (Rotation vector, Rodriques format).
- `[3:6]`: `tvec` (Translation vector).
- `[6:8]`: `cubic_slopes` (`alpha`, `beta`).
- `[8:8+N_SPANS]`: `ycoords` (Vertical position of each text line on the flat page).
- `[8+N_SPANS:]`: `xcoords` (Horizontal positions of sample points along each span).

## Config

Global configuration object (singleton).

- Camera intrinsics (Focal length).
- Detection thresholds (min width, max thickness).
- Optimization constraints.
- Output settings (DPI, Zoom).
