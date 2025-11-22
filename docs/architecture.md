# Architecture Overview

The `page-dewarp` library is a pipeline for rectifying photos of curved document pages. It follows a "optimization-based" approach where a 3D geometric model of the page surface is fitted to the 2D image data.

## High-Level Pipeline

The processing flow is orchestrated by the `WarpedImage` class (in `src/image.js` / `image.py`).

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
    - Algorithm: Powell's method (Python) / Nelder-Mead (JS port).

8.  **Dewarping (Remapping)**:

    - Use the optimized parameters to create a dense coordinate map.
    - For every pixel in the target (flat) image, calculate its corresponding position in the source (curved) image.
    - Apply `cv.remap` to generate the rectified image.

9.  **Post-processing**:
    - Apply adaptive thresholding to the rectified image to obtain a clean, binarized output.
