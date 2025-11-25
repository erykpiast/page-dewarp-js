# Architecture Overview

The `page-dewarp` library is a pipeline for rectifying photos of curved document pages. It follows a "optimization-based" approach where a 3D geometric model of the page surface is fitted to the 2D image data.

## Pipeline Diagram

```
┌──────────────────┐
│  Load Image      │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Preprocessing    │ (Grayscale, Downsample, Masking)
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Contour          │ (Find text blobs, compute geometry)
│ Detection        │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Span Assembly    │ (Group contours into text lines)
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Sample Keypoints │ (Extract grid points along spans)
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Initial Pose     │ (solvePnP on page corners)
│ Estimation       │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Optimization     │ (Powell's method: minimize reprojection error)
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Remap & Dewarp   │ (Generate flattened output)
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Save Output      │
└──────────────────┘
```

## High-Level Pipeline

The processing flow is orchestrated by the `WarpedImage` class (in `src/image.js`).

1.  **Image Loading & Preprocessing**:

    - Load original image.
    - Create a downsampled "small" version for analysis (speed optimization).
    - Convert to grayscale.

2.  **Page Segmentation**:

    - Determine the "page mask" (valid area minus margins).
    - Generate a text/line mask using adaptive thresholding and morphological operations (`Mask` class).

3.  **Contour Detection**:

    - Detect external contours in the mask.
    - Filter contours by size, aspect ratio, and density.
    - Compute geometric properties (center, tangent/orientation) for each contour using PCA/Moments (`ContourInfo` class).

4.  **Span Assembly**:

    - Group contours into horizontal "spans" (text lines) based on proximity and alignment.
    - This forms the basis of the grid structure used to model the page surface.

5.  **Keypoint Sampling**:

    - Sample points along each span at regular intervals.
    - Generate a set of "destination" points (a flat grid) and "source" points (detected in image).

6.  **Parameter Estimation (Initial Solve)**:

    - Estimate the 3D pose (Rotation `rvec`, Translation `tvec`) of the page using `cv.solvePnP` on the page corners.
    - Initialize cubic surface parameters (alpha, beta) to zero (flat page).

7.  **Optimization**:

    - Define an objective function: Sum of squared errors between projected 3D model points and detected 2D image points.
    - Parameters optimized:
      - `rvec` (3), `tvec` (3): Camera/Page pose.
      - `alpha`, `beta`: Cubic polynomial coefficients describing page curvature.
      - `ycoords`, `xcoords`: Refined grid positions.
    - Algorithm: Powell's method (derivative-free optimization).

8.  **Dewarping (Remapping)**:

    - Use the optimized parameters to create a dense coordinate map.
    - For every pixel in the target (flat) image, calculate its corresponding position in the source (curved) image.
    - Apply `cv.remap` to generate the rectified image.

9.  **Post-processing**:
    - Apply adaptive thresholding to the rectified image to obtain a clean, binarized output.

## Source Files and Responsibilities

### Core Pipeline

- **`src/image.js`** (`WarpedImage` class)
  - Main entry point orchestrating the full pipeline
  - Handles image loading, processing coordination, and output generation
  - Manages OpenCV Mat lifecycle

- **`src/dewarp.js`** (`RemappedImage` class)
  - Generates the final dewarped output
  - Creates coordinate remap maps from optimized parameters
  - Applies remapping and optional thresholding

### Detection and Analysis

- **`src/mask.js`** (`Mask` class)
  - Generates binary text mask using adaptive thresholding
  - Applies morphological operations to clean up the mask

- **`src/contours.js`** (`ContourInfo` class, `getContours()`)
  - Detects text contours from binary mask
  - Filters contours by geometric criteria
  - Computes center and orientation (tangent) using image moments

- **`src/spans.js`**
  - Groups contours into horizontal text lines (spans)
  - Samples points along each span
  - Computes normalized coordinates for keypoints

### 3D Modeling and Optimization

- **`src/projection.js`**
  - Projects 2D page coordinates to 2D image coordinates
  - Implements cubic surface model for page curvature
  - Manages camera intrinsic matrix

- **`src/solve.js`**
  - Computes initial camera pose using solvePnP
  - Builds initial parameter vector for optimization

- **`src/solvepnp/`**
  - **`index.js`**: Main solvePnP entry point
  - **`dlt.js`**: Direct Linear Transform (DLT) for planar pose estimation
  - **`optimizer.js`**: Levenberg-Marquardt refinement

- **`src/keypoints.js`**
  - Manages keypoint indexing
  - Projects all keypoints using current parameters

- **`src/optimise.js`**
  - Implements Powell's method for derivative-free optimization
  - Minimizes reprojection error between detected and projected keypoints

### Utilities

- **`src/config.js`**
  - Global configuration parameters
  - Thresholds for detection, filtering, and optimization

- **`src/utils.js`**
  - Coordinate transformation utilities (pixel ↔ normalized)
  - Image loading and saving helpers

- **`src/cv-loader.js`**
  - OpenCV WASM loading and initialization

- **`src/visualization.js`**
  - Debug visualization utilities
  - Drawing functions for contours, spans, keypoints, grids

- **`src/debug.js`** and **`src/debug-metrics.js`**
  - Debug output management
  - Metrics collection for validation

### Command-Line Interface

- **`src/cli.js`**
  - Parses command-line arguments
  - Configures pipeline parameters
  - Processes input images
