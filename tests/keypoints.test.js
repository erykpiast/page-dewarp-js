import { describe, it, expect, vi } from "vitest";

// Mock OpenCV and projection module
vi.mock("../src/cv-loader.js", () => ({
  getOpenCV: () => ({}),
}));

vi.mock("../src/projection.js", () => ({
  projectXY: (xyCoords, pvec) => {
    // Simple mock: just return the input coords
    return xyCoords.map(([x, y]) => [x, y]);
  },
}));

import { makeKeypointIndex, projectKeypoints } from "../src/keypoints.js";

describe("makeKeypointIndex", () => {
  it("should create index with correct length", () => {
    const spanCounts = [3, 4, 2];
    const totalPoints = 3 + 4 + 2;
    
    const index = makeKeypointIndex(spanCounts);
    
    // Index should have npts + 1 entries (including dummy first point)
    expect(index.length).toBe(totalPoints + 1);
  });

  it("should map first entry to [0, 0]", () => {
    const spanCounts = [3, 4, 2];
    const index = makeKeypointIndex(spanCounts);
    
    // First entry is dummy
    expect(index[0][0]).toBe(0);
    expect(index[0][1]).toBe(0);
  });

  it("should assign correct span indices", () => {
    const spanCounts = [3, 4];
    const index = makeKeypointIndex(spanCounts);
    
    // First 3 points (indices 1-3) should map to span index 8
    expect(index[1][1]).toBe(8);
    expect(index[2][1]).toBe(8);
    expect(index[3][1]).toBe(8);
    
    // Next 4 points (indices 4-7) should map to span index 9
    expect(index[4][1]).toBe(9);
    expect(index[5][1]).toBe(9);
    expect(index[6][1]).toBe(9);
    expect(index[7][1]).toBe(9);
  });

  it("should assign correct point indices", () => {
    const spanCounts = [2, 2];
    const nSpans = 2;
    const index = makeKeypointIndex(spanCounts);
    
    // Point indices start at 8 + nSpans = 10
    expect(index[1][0]).toBe(10); // First point (index 1) -> pvec[10]
    expect(index[2][0]).toBe(11); // Second point (index 2) -> pvec[11]
    expect(index[3][0]).toBe(12); // Third point (index 3) -> pvec[12]
    expect(index[4][0]).toBe(13); // Fourth point (index 4) -> pvec[13]
  });

  it("should handle single span", () => {
    const spanCounts = [5];
    const index = makeKeypointIndex(spanCounts);
    
    expect(index.length).toBe(6); // 5 points + 1 dummy
    expect(index[1][1]).toBe(8); // All points in first span
    expect(index[5][1]).toBe(8);
  });

  it("should handle empty spans list", () => {
    const spanCounts = [];
    const index = makeKeypointIndex(spanCounts);
    
    expect(index.length).toBe(1); // Just the dummy entry
  });
});

describe("projectKeypoints", () => {
  it("should return correct number of projected points", () => {
    const spanCounts = [3, 4];
    const index = makeKeypointIndex(spanCounts);
    
    // Create a minimal pvec with enough elements
    const pvec = new Array(20).fill(0);
    pvec[8] = 0.1; // y for span 0
    pvec[9] = 0.2; // y for span 1
    pvec[10] = 0.3; // x for point 0
    pvec[11] = 0.4; // x for point 1
    
    const result = projectKeypoints(pvec, index);
    
    // Should return same length as index
    expect(result.length).toBe(index.length);
  });

  it("should set first point to [0, 0]", () => {
    const spanCounts = [2];
    const index = makeKeypointIndex(spanCounts);
    const pvec = new Array(15).fill(0.5);
    
    const result = projectKeypoints(pvec, index);
    
    expect(result[0][0]).toBe(0);
    expect(result[0][1]).toBe(0);
  });

  it("should extract coordinates using index", () => {
    const spanCounts = [2, 2];
    const index = makeKeypointIndex(spanCounts);
    
    const pvec = new Array(20).fill(0);
    pvec[8] = 1.0;  // y for span 0
    pvec[9] = 2.0;  // y for span 1
    pvec[10] = 3.0; // x for point 0
    pvec[11] = 4.0; // x for point 1
    pvec[12] = 5.0; // x for point 2
    pvec[13] = 6.0; // x for point 3
    
    const result = projectKeypoints(pvec, index);
    
    // Note: Since we're mocking projectXY, it just returns input coords
    // In real use, these would be transformed
    expect(result.length).toBe(5); // 4 points + 1 dummy
  });

  it("should handle single keypoint", () => {
    const spanCounts = [1];
    const index = makeKeypointIndex(spanCounts);
    const pvec = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.3]; // rvec, tvec, cubic, span y, point x
    
    const result = projectKeypoints(pvec, index);
    
    expect(result.length).toBe(2); // 1 point + 1 dummy
  });
});

