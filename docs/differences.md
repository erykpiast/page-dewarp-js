# Differences Between page-dewarp-js and Python Original

This document compares the JavaScript port (`page-dewarp-js`) with the Python original (`page-dewarp`) in terms of architecture and algorithms used.

## Architecture Comparison

### Module Structure

| Python (`page-dewarp`) | JavaScript (`page-dewarp-js`) | Notes                               |
| ---------------------- | ----------------------------- | ----------------------------------- |
| `image.py`             | `image.js`                    | Main pipeline orchestrator          |
| `dewarp.py`            | `dewarp.js`                   | Final remapping/thresholding        |
| `contours.py`          | `contours.js`                 | Contour detection & filtering       |
| `spans.py`             | `spans.js`                    | Span assembly & keypoint extraction |
| `mask.py`              | `mask.js`                     | Binary mask creation                |
| `optimise.py`          | `optimise.js`                 | Parameter optimization              |
| `projection.py`        | `projection.js`               | 3D→2D projection                    |
| `solve.py`             | `solve.js`                    | Initial parameter estimation        |
| `keypoints.py`         | `keypoints.js`                | Keypoint indexing                   |
| `normalisation.py`     | `utils.js` (partial)          | Coordinate transforms               |
| `options/core.py`      | `config.js`                   | Configuration                       |
| `options/k_opt.py`     | (inlined in `projection.js`)  | Camera matrix                       |
| N/A                    | `solvepnp/` (3 files)         | **Custom PnP solver**               |
| N/A                    | `cv-loader.js`                | OpenCV.js loader                    |

### Key Architectural Differences

#### 1. Asynchronous Design

The JS version uses `async/await` throughout (`process()`, `debugShow()`, etc.) while Python is synchronous.

#### 2. Memory Management

JS requires explicit `.delete()` calls for OpenCV.js Mat objects, with a `destroy()` pattern for cleanup:

```javascript
// src/contours.js
destroy() {
  if (this.contour && !this.contour.isDeleted()) {
    this.contour.delete();
  }
  if (this.mask && !this.mask.isDeleted()) {
    this.mask.delete();
  }
}
```

#### 3. Configuration

Python uses `msgspec.Struct` with type annotations and descriptions:

```python
# Python: Structured config with metadata
class Config(Struct):
    FOCAL_LENGTH: desc(float, "Normalized focal length of camera") = 1.2
```

JavaScript uses a simple object with an `updateConfig()` helper:

```javascript
// JS: Plain object
export const Config = {
  FOCAL_LENGTH: 1.2,
  // ...
};
```

---

## Algorithm Differences

### 1. Parameter Optimization (Powell's Method)

Both implementations use Powell's conjugate direction method—a derivative-free optimization algorithm well-suited for problems where gradients are expensive or unavailable. The goal is to minimize the reprojection error between detected keypoints and their projected positions based on the current page model.

#### Python Approach

The Python version delegates to SciPy's highly optimized `minimize` function with `method="Powell"`. SciPy's implementation is battle-tested, written in Fortran/C under the hood, and uses adaptive tolerances with sophisticated convergence criteria. It inherits SciPy's default settings for maximum iterations and convergence thresholds.

#### JavaScript Approach

Since SciPy isn't available in JavaScript, the JS version implements Powell's method from scratch. The implementation follows the classical algorithm structure:

1. **Direction Set Initialization**: Starts with the standard basis vectors (coordinate directions) as the initial search directions.

2. **Sequential Line Search**: For each iteration, the algorithm performs a one-dimensional minimization along each direction in the direction set. This is where the major algorithmic difference lies—the JS version uses **Brent's method** for the 1D line search.

3. **Brent's Method**: This is a root-finding/minimization algorithm that combines the reliability of bisection with the speed of inverse quadratic interpolation. It:

   - First brackets the minimum using a golden-section expansion
   - Then refines the minimum using parabolic interpolation when safe
   - Falls back to golden-section steps when parabolic interpolation would be unreliable
   - Guarantees convergence while typically achieving superlinear convergence rates

4. **Direction Set Update**: After completing all line searches, Powell's method updates the direction set by replacing the direction that yielded the largest decrease with the overall displacement direction. This helps the algorithm discover conjugate directions that don't interfere with each other.

5. **Convergence Check**: The JS version uses explicit configurable parameters (`OPTIM_MAX_ITER: 60` and `OPTIM_TOL: 1e-6`) rather than SciPy's adaptive defaults.

#### Practical Differences

- **Performance**: SciPy's version is faster due to compiled code; JS runs in interpreted JavaScript
- **Tunability**: JS exposes iteration limits and tolerances as configuration options
- **Numerical Precision**: Both use 64-bit floating point, but SciPy may have better numerical stability in edge cases
- **Memory**: JS uses typed Float64Arrays for efficiency; Python uses NumPy arrays

---

### 2. Pose Estimation (SolvePnP)

The Perspective-n-Point (PnP) problem estimates camera pose (rotation and translation) given known 3D points and their 2D image projections. This is critical for establishing the initial camera-to-page transformation.

#### Python Approach

OpenCV's `solvePnP` is a mature implementation that typically uses the EPnP (Efficient PnP) algorithm followed by Levenberg-Marquardt refinement. It handles various point configurations and includes robust outlier handling.

#### JavaScript Approach

OpenCV.js omits `solvePnP`, so the JS version implements a custom two-stage solver:

**Stage 1: Direct Linear Transform (DLT) Initialization**

For the page dewarping case, the 3D points lie on a plane (Z=0), which allows using a simpler homography-based approach:

1. Compute a 2D homography matrix H that maps the planar 3D coordinates to 2D image coordinates
2. Decompose the homography into rotation and translation using the relationship H = K[r1 | r2 | t] where K is the camera intrinsic matrix
3. Extract the two rotation column vectors from the homography
4. Compute the third rotation vector as their cross product
5. Orthogonalize the rotation matrix using SVD (since the extracted rotation may not be perfectly orthogonal due to noise)
6. Convert the rotation matrix to a rotation vector using the Rodrigues formula

The custom 3×3 SVD uses **Jacobi iteration**, an iterative eigenvalue algorithm that repeatedly applies rotation transformations to diagonalize the matrix. While slower than optimized LAPACK routines, it's numerically stable and straightforward to implement.

**Stage 2: Levenberg-Marquardt Refinement**

The DLT solution is approximate, so a nonlinear refinement step minimizes reprojection error:

1. The 6 pose parameters (3 rotation, 3 translation) are optimized to minimize the sum of squared distances between observed 2D points and projected 3D points
2. Levenberg-Marquardt combines the reliability of gradient descent with the speed of Gauss-Newton optimization
3. The JS version uses the `ml-levenberg-marquardt` npm package, which handles the damping parameter adaptation automatically
4. The algorithm projects each 3D point through the current pose estimate, computes residuals against observed points, and iteratively adjusts parameters

#### Practical Differences

- **Generality**: OpenCV handles non-planar cases; JS only handles planar (Z=0) configurations
- **Robustness**: OpenCV includes RANSAC-based outlier rejection; JS assumes clean correspondences
- **Accuracy**: Both achieve similar final accuracy due to the L-M refinement stage

---

### 2a. Levenberg-Marquardt in the JS Version

The `ml-levenberg-marquardt` npm package is a JS-specific dependency that has no direct equivalent usage in the Python version. Here's why it's needed and how it works:

#### Why L-M Is Explicit in JS But Hidden in Python

In the Python version, Levenberg-Marquardt is used internally by OpenCV's `solvePnP` function—it's an implementation detail that users never directly interact with. The function simply returns a rotation vector and translation vector; the refinement happens behind the scenes in optimized C++ code.

In the JS version, since `solvePnP` isn't available in OpenCV.js, we must implement the entire pose estimation pipeline ourselves. This means explicitly calling a nonlinear least-squares solver, which is where `ml-levenberg-marquardt` comes in.

#### The Levenberg-Marquardt Algorithm

L-M is a hybrid optimization algorithm designed specifically for nonlinear least-squares problems (minimizing a sum of squared residuals). It interpolates between two classical methods:

1. **Gradient Descent**: Takes steps proportional to the negative gradient. Reliable but slow, especially near the minimum where gradients become small.

2. **Gauss-Newton**: Approximates the Hessian matrix using only first derivatives (the Jacobian). Very fast near the minimum but can diverge if the initial guess is poor or the problem is ill-conditioned.

L-M introduces a **damping parameter** (often called λ or μ) that controls the blend:

- When λ is large, the algorithm behaves like gradient descent (safe, slow)
- When λ is small, the algorithm behaves like Gauss-Newton (fast, aggressive)

The algorithm adaptively adjusts λ based on whether steps improve the objective:

- If a step reduces the error, decrease λ (become more aggressive)
- If a step increases the error, reject it and increase λ (become more cautious)

#### How It's Used in Pose Refinement

The solvePnP refinement formulates the problem as:

**Minimize**: Σᵢ ||observed₂ᴰ[i] - project(pose, point₃ᴰ[i])||²

Where:

- `observed₂ᴰ` are the detected 2D corner positions in the image
- `point₃ᴰ` are the known 3D corner positions on the page (at Z=0)
- `pose` consists of 6 parameters: 3 rotation (as a Rodrigues vector) + 3 translation
- `project()` applies the camera model to transform 3D points to 2D

The `ml-levenberg-marquardt` package requires:

1. **A model function factory**: Given parameters, returns a function that predicts observations
2. **Observed data**: The target x,y coordinates we want to match
3. **Initial parameters**: From the DLT stage
4. **Options**: Damping, gradient difference for numerical derivatives, iteration limits

The package handles:

- Numerical Jacobian computation (finite differences)
- Damping parameter adaptation
- Convergence detection
- Parameter bounds (if specified)

#### Why Not Use L-M for Everything?

One might ask: why use Powell for the main optimization and L-M only for pose estimation?

The main page dewarping optimization has **many more parameters** (typically 50-100+):

- 3 rotation parameters
- 3 translation parameters
- 2 cubic surface parameters
- N span y-coordinates (one per text line)
- M total x-coordinates (summed across all keypoints)

L-M requires computing a Jacobian matrix of size (observations × parameters), which becomes expensive for large parameter counts. It also assumes the objective is a sum of squared residuals, which is true here but the structure is more complex than simple point matching.

Powell's method, being derivative-free, scales better for high-dimensional problems where the Jacobian would be expensive. Each iteration only requires objective function evaluations, not gradient computations.

The 6-parameter pose estimation, by contrast, is a small, well-structured problem perfectly suited for L-M's strengths.

---

### 3. 3D to 2D Projection

This operation maps 3D world points through the camera model to 2D image coordinates, used extensively during optimization.

#### Python Approach

OpenCV's `projectPoints` is a comprehensive function that handles:

- Rotation vector to matrix conversion (Rodrigues formula)
- Rigid body transformation (rotation + translation)
- Perspective division
- Camera intrinsic application
- Lens distortion modeling (radial and tangential)

#### JavaScript Approach

The JS version implements the core projection pipeline manually:

1. **Rodrigues Conversion**: Uses OpenCV.js's `cv.Rodrigues()` to convert the 3-element rotation vector to a 3×3 rotation matrix
2. **Rigid Transformation**: Applies the standard formula P_camera = R × P_world + t
3. **Perspective Division**: Computes normalized image coordinates by dividing by the Z component
4. **Intrinsic Application**: Multiplies by focal length (assumes principal point at origin, which matches the normalized coordinate system used)

The JS version omits lens distortion since the algorithm works in a normalized coordinate system where distortion effects are minimal.

---

### 4. Principal Component Analysis (PCA)

PCA determines the dominant orientation of text spans, used to establish the page's horizontal axis direction.

#### Python Approach

OpenCV's `PCACompute` performs full SVD-based PCA on arbitrary-dimensional data, returning eigenvalues and eigenvectors sorted by variance explained.

#### JavaScript Approach

Since span points are 2D, the JS version exploits a closed-form solution for 2×2 covariance matrices:

1. **Covariance Computation**: Calculate the 2×2 covariance matrix from centered point coordinates
2. **Eigenvalue Formula**: For a 2×2 matrix, eigenvalues can be computed directly using the quadratic formula applied to the characteristic polynomial: λ = (trace ± √(trace² - 4·det)) / 2
3. **Eigenvector Extraction**: The dominant eigenvector is computed from the eigenvalue using basic linear algebra

This approach is more efficient than general SVD for the 2D case and avoids the overhead of OpenCV's general-purpose implementation.

---

### 5. Contour Orientation Analysis

Each detected text blob needs an orientation (tangent direction) for span assembly.

#### Python Approach

Uses image moments to build a covariance matrix, then SVD to extract the principal axis. OpenCV's `SVDecomp` provides the general-purpose decomposition.

#### JavaScript Approach

Applies the same closed-form 2×2 eigenvalue solution as PCA:

1. Compute image moments (m00, m10, m01, mu20, mu11, mu02) using OpenCV.js
2. Build the 2×2 covariance matrix from central moments normalized by area
3. Apply the closed-form eigenvalue/eigenvector formulas
4. Handle the degenerate case (diagonal matrix) separately for numerical stability

The mathematical result is identical to SVD for this 2×2 case, just computed more directly

---

## Additional JS-Specific Features

### 1. Debug Metrics System

The JS version adds extensive metrics collection not present in Python:

```javascript
// src/optimise.js
DebugMetrics.add("initial_params", Array.from(params));
DebugMetrics.add("initial_cost", initialLoss);
// ...
DebugMetrics.add("final_params", newParams);
DebugMetrics.add("optimization_time", optimizationTime);
```

### 2. Output Dimension Clamping

JS adds safeguards against excessive output sizes:

```javascript
// src/dewarp.js
const MAX_DIM = 3000;
if (width > MAX_DIM || height > MAX_DIM) {
  const scale = MAX_DIM / Math.max(width, height);
  width = roundNearestMultiple(width * scale, Config.REMAP_DECIMATE);
  height = roundNearestMultiple(height * scale, Config.REMAP_DECIMATE);
}
```

### 3. Invalid Point Handling

JS adds explicit NaN/Infinity checks:

```javascript
// src/dewarp.js
if (!Number.isFinite(x) || !Number.isFinite(y)) {
  invalidPointCount++;
  x = 0;
  y = 0;
}
const MAX_COORD = 100000;
if (x > MAX_COORD) x = MAX_COORD;
```

---

## Summary Table

| Aspect              | Python                 | JavaScript                        |
| ------------------- | ---------------------- | --------------------------------- |
| **Optimization**    | SciPy Powell           | Custom Powell + Brent             |
| **SolvePnP**        | OpenCV native          | Custom DLT + L-M                  |
| **Projection**      | OpenCV `projectPoints` | Manual implementation             |
| **PCA**             | OpenCV `PCACompute`    | Manual 2×2 eigenvalue             |
| **SVD**             | OpenCV `SVDecomp`      | Jacobi iteration (3×3)            |
| **Data structures** | NumPy arrays           | Plain JS arrays                   |
| **Memory**          | Automatic GC           | Manual `.delete()`                |
| **Async**           | Synchronous            | Async/await throughout            |
| **Dependencies**    | NumPy, SciPy, OpenCV   | OpenCV.js, ml-levenberg-marquardt |

---

## Conclusion

The JS port is a faithful implementation that reimplements several algorithms that aren't available in OpenCV.js while maintaining algorithm parity with the Python original. The main trade-offs are:

- **More verbose code** due to manual algorithm implementations
- **Manual memory management** for OpenCV.js objects
- **Browser/Node.js compatibility** as the primary benefit
