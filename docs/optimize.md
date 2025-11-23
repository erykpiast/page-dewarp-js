# Optimization & Implementation Discrepancies

This document details significant algorithmic and implementation differences identified between the original Python `page-dewarp` and the JavaScript port `page-dewarp-js`.

## 1. Optimization Algorithm

The method used to refine the page model parameters differs fundamentally between the two versions.

- **Python (`optimise.py`)**: Uses **`scipy.optimize.minimize`** with the **`Powell`** method. Powell's method is a derivative-free optimization algorithm, which is robust for this geometric problem where the objective function (reprojection error) may not be perfectly smooth or where gradients are expensive/noisy to compute.
- **JavaScript (`optimise.js`)**: Currently implements a custom **`minimize`** function using **`Adam`** (Adaptive Moment Estimation). Adam is a gradient-based stochastic optimization method popular in machine learning. It approximates gradients using finite differences.
  - **Impact**: Gradient-based methods can be sensitive to hyperparameters (learning rate, betas) and initial conditions. For this specific geometric alignment task, Powell's method is generally more stable. The difference likely contributes to divergence in results.

## 2. Pose Estimation / Initialization

The logic for estimating the initial 3D pose of the page from the four corner points is different.

- **Python (`solve.py`)**: Uses **`cv2.solvePnP`** (Perspective-n-Point). This standard computer vision function solves for the rotation (`rvec`) and translation (`tvec`) that minimize the reprojection error of 3D-2D point correspondences given the camera matrix.
- **JavaScript (`solve.js`)**: Uses a manual **Homography Decomposition**. It calculates a homography matrix `H` using `cv.findHomography` and then mathematically decomposes it into rotation and translation vectors assuming a planar surface ($z=0$).
  - **Impact**: `solvePnP` is typically more robust and handles the camera intrinsics more explicitly. The manual decomposition relies on assumptions about the coordinate normalization that may introduce errors if not perfectly aligned with the Python preprocessing steps.

## 3. Keypoint Orientation (PCA Logic)

The method for determining the page's principal axes ("horizontal" text direction and "vertical" page direction) from the sampled text spans differs.

- **Python (`spans.py`)**: Computes PCA **locally for each span** to find its individual direction vector. It then calculates a **weighted average** of these vectors (weighted by span length) to determine the global page rotation.
- **JavaScript (`spans.js`)**: Flattens all sample points from all spans into a single dataset and computes a **global PCA** on the entire point cloud.
  - **Impact**: The JS approach treats all points equally, which means dense areas of text might skew the axis more than the Python approach. If the page has curved text lines, a global PCA yields a single average axis, whereas the Python weighted average of local tangents might better represent the "intended" horizontal axis of the text blocks.
