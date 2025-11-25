import { describe, it, expect } from "vitest";
import { solvePnP } from "../src/solvepnp/index.js";

describe("solvePnP", () => {
  it("should find pose for planar square", () => {
    // Define a square in 3D at Z=0
    const objectPoints = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];

    // Simple camera matrix
    const cameraMatrix = [1.2, 0, 0, 0, 1.2, 0, 0, 0, 1];

    // Project the square with known pose: identity rotation, translation [0, 0, 2]
    // This should project points to approximately:
    // [0, 0, 2] -> [0, 0]
    // [1, 0, 2] -> [0.6, 0]
    // [1, 1, 2] -> [0.6, 0.6]
    // [0, 1, 2] -> [0, 0.6]
    const imagePoints = [
      [0, 0],
      [0.6, 0],
      [0.6, 0.6],
      [0, 0.6],
    ];

    const result = solvePnP(objectPoints, imagePoints, cameraMatrix);

    expect(result).toHaveProperty("rvec");
    expect(result).toHaveProperty("tvec");
    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
    expect(Array.isArray(result.rvec)).toBe(true);
    expect(Array.isArray(result.tvec)).toBe(true);
    expect(result.rvec.length).toBe(3);
    expect(result.tvec.length).toBe(3);
  });

  it("should return reasonable rotation vector", () => {
    const objectPoints = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];
    const imagePoints = [
      [0, 0],
      [0.6, 0],
      [0.6, 0.6],
      [0, 0.6],
    ];
    const cameraMatrix = [1.2, 0, 0, 0, 1.2, 0, 0, 0, 1];

    const result = solvePnP(objectPoints, imagePoints, cameraMatrix);

    // Rotation vector should be small for near-frontal view
    const rvecMagnitude = Math.sqrt(
      result.rvec[0] ** 2 + result.rvec[1] ** 2 + result.rvec[2] ** 2
    );
    
    // For a frontal view, rotation should be small
    expect(rvecMagnitude).toBeLessThan(1.0);
  });

  it("should return reasonable translation vector", () => {
    const objectPoints = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];
    const imagePoints = [
      [0, 0],
      [0.6, 0],
      [0.6, 0.6],
      [0, 0.6],
    ];
    const cameraMatrix = [1.2, 0, 0, 0, 1.2, 0, 0, 0, 1];

    const result = solvePnP(objectPoints, imagePoints, cameraMatrix);

    // Translation Z should be positive (object in front of camera)
    expect(result.tvec[2]).toBeGreaterThan(0);
  });

  it("should throw on mismatched point counts", () => {
    const objectPoints = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ];
    const imagePoints = [
      [0, 0],
      [0.6, 0],
    ];
    const cameraMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    expect(() => {
      solvePnP(objectPoints, imagePoints, cameraMatrix);
    }).toThrow();
  });

  it("should handle minimum point set (4 points)", () => {
    const objectPoints = [
      [-1, -1, 0],
      [1, -1, 0],
      [1, 1, 0],
      [-1, 1, 0],
    ];
    const imagePoints = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ];
    const cameraMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    const result = solvePnP(objectPoints, imagePoints, cameraMatrix);

    expect(result.success).toBe(true);
    expect(result.rvec.length).toBe(3);
    expect(result.tvec.length).toBe(3);
  });

  it("should work with more than 4 points", () => {
    const objectPoints = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [2, 1, 0],
    ];
    const imagePoints = [
      [0, 0],
      [0.3, 0],
      [0.6, 0],
      [0, 0.3],
      [0.3, 0.3],
      [0.6, 0.3],
    ];
    const cameraMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    const result = solvePnP(objectPoints, imagePoints, cameraMatrix);

    expect(result.success).toBe(true);
  });

  it("should accept optional distortion coefficients", () => {
    const objectPoints = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];
    const imagePoints = [
      [0, 0],
      [0.6, 0],
      [0.6, 0.6],
      [0, 0.6],
    ];
    const cameraMatrix = [1.2, 0, 0, 0, 1.2, 0, 0, 0, 1];
    const distCoeffs = [0.1, 0.01, 0, 0, 0];

    const result = solvePnP(objectPoints, imagePoints, cameraMatrix, distCoeffs);

    expect(result.success).toBe(true);
  });
});

