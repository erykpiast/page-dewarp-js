# Algorithms

## 1. Contour Orientation (PCA/Moments)

To determine the local orientation of a text blob, the system uses 2nd-order central moments.

- **Covariance Matrix**: Constructed from moments `mu20`, `mu11`, `mu02`.
- **SVD/PCA**: The eigenvectors of this matrix represent the principal axes of the blob.
- **Tangent**: The primary eigenvector gives the direction of the text line at that point.

## 2. Span Assembly

Contours are linked into chains (spans) using a greedy pairing strategy.

- **Candidate Edges**: For every pair of contours, a "link score" is calculated based on:
  - Distance.
  - Overlap in the direction of the text.
  - Angular alignment.
- **Graph Building**: The best links are chosen to form predecessor/successor relationships, creating linear chains.

## 3. Cubic Projection Model

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

## 4. Optimization

The core problem is finding the parameters that best align the 3D model with the observed 2D text spans.

- **Objective Function**: $\sum || \text{detected\_points} - \text{projected\_points} ||^2$
- **Parameters**:
  - Rigid pose ($rvec, tvec$) - 6 params.
  - Shape ($\alpha, \beta$) - 2 params.
  - Grid refinements ($y_i, x_{ij}$) - many params.
- **Method**: Powell's method (derivative-free optimization) is used in Python. In JS, we will use Nelder-Mead (`fmin` package) as a robust alternative for derivative-free minimization.

## 5. Coordinate Remapping

To generate the final image, we reverse the projection.

- We iterate over the target (flat) image pixels.
- Map each target $(u, v)$ to a normalized page coordinate $(x, y)$.
- Calculate $z$ using the cubic model.
- Project $(x, y, z)$ to source image coordinates $(u', v')$.
- Sample the source image at $(u', v')$.
