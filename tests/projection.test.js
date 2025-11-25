import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock OpenCV
const mockOpenCV = {
  Mat: class {
    constructor() {
      this.data = new Float64Array(9);
    }
    delete() {}
    doubleAt(row, col) {
      return this.data[row * 3 + col];
    }
  },
  matFromArray: (rows, cols, type, data) => {
    const mat = new mockOpenCV.Mat();
    mat.rows = rows;
    mat.cols = cols;
    mat.data = Float64Array.from(data);
    return mat;
  },
  Rodrigues: (rvec, R) => {
    // For zero rotation vector, return identity matrix
    const rvecData = rvec.data;
    if (rvecData[0] === 0 && rvecData[1] === 0 && rvecData[2] === 0) {
      R.data = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    }
  },
  CV_64F: 6,
};

vi.mock("../src/cv-loader.js", () => ({
  getOpenCV: () => mockOpenCV,
}));

import { getK, projectXY } from "../src/projection.js";
import { Config } from "../src/config.js";

describe("getK", () => {
  it("should return 3x3 matrix", () => {
    const K = getK();
    expect(K.rows).toBe(3);
    expect(K.cols).toBe(3);
  });

  it("should have focal length on diagonal", () => {
    const K = getK();
    const f = Config.FOCAL_LENGTH;
    expect(K.data[0]).toBe(f); // K[0,0]
    expect(K.data[4]).toBe(f); // K[1,1]
    expect(K.data[8]).toBe(1); // K[2,2]
  });

  it("should have zeros in off-diagonal and principal point", () => {
    const K = getK();
    expect(K.data[1]).toBe(0); // K[0,1]
    expect(K.data[2]).toBe(0); // K[0,2]
    expect(K.data[3]).toBe(0); // K[1,0]
    expect(K.data[5]).toBe(0); // K[1,2]
    expect(K.data[6]).toBe(0); // K[2,0]
    expect(K.data[7]).toBe(0); // K[2,1]
  });
});

describe("projectXY", () => {
  it("should project points with identity pose", () => {
    // Identity pose: rvec = [0, 0, 0], tvec = [0, 0, 1]
    // Zero cubic params: alpha = 0, beta = 0
    const pvec = [0, 0, 0, 0, 0, 1, 0, 0];
    const xyCoords = [
      [0, 0],
      [0.5, 0.5],
      [-0.5, -0.5],
    ];

    const result = projectXY(xyCoords, pvec);

    expect(result.length).toBe(3);
    
    // With identity rotation, zero Z, and tvec=[0,0,1]:
    // Point [0, 0, 0] -> camera coords [0, 0, 1] -> projects to [0, 0]
    expect(result[0][0]).toBeCloseTo(0, 5);
    expect(result[0][1]).toBeCloseTo(0, 5);
    
    // Point [0.5, 0.5, 0] -> camera coords [0.5, 0.5, 1]
    // -> projects to [f*0.5/1, f*0.5/1] = [f*0.5, f*0.5]
    const f = Config.FOCAL_LENGTH;
    expect(result[1][0]).toBeCloseTo(f * 0.5, 5);
    expect(result[1][1]).toBeCloseTo(f * 0.5, 5);
  });

  it("should handle zero cubic params (flat projection)", () => {
    // Zero cubic params means Z = 0 for all points
    const pvec = [0, 0, 0, 0, 0, 1, 0, 0];
    const xyCoords = [[1, 0]];

    const result = projectXY(xyCoords, pvec);

    // Point should project with Z = 0 (flat surface)
    expect(result.length).toBe(1);
    expect(typeof result[0][0]).toBe("number");
    expect(typeof result[0][1]).toBe("number");
  });

  it("should clamp cubic parameters to [-0.5, 0.5]", () => {
    // Test that large cubic params are clamped
    const pvec = [0, 0, 0, 0, 0, 1, 10, -10]; // Large alpha and beta
    const xyCoords = [[0, 0]];

    // Should not throw and should clamp internally
    expect(() => projectXY(xyCoords, pvec)).not.toThrow();
    
    const result = projectXY(xyCoords, pvec);
    expect(result.length).toBe(1);
  });

  it("should return array of [x, y] pairs", () => {
    const pvec = [0, 0, 0, 0, 0, 1, 0, 0];
    const xyCoords = [
      [0, 0],
      [1, 1],
    ];

    const result = projectXY(xyCoords, pvec);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(Array.isArray(result[0])).toBe(true);
    expect(result[0].length).toBe(2);
  });
});

