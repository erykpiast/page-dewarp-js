import { describe, it, expect } from "vitest";
import { pix2norm, norm2pix, roundNearestMultiple, imgsize } from "../src/utils.js";

describe("pix2norm", () => {
  it("should map center pixel to (0, 0)", () => {
    const shape = { rows: 100, cols: 200 };
    const pts = [[100, 50]];
    const result = pix2norm(shape, pts);
    expect(result[0][0]).toBeCloseTo(0, 10);
    expect(result[0][1]).toBeCloseTo(0, 10);
  });

  it("should map corners correctly for square image", () => {
    const shape = { rows: 100, cols: 100 };
    const pts = [
      [0, 0],
      [100, 0],
      [0, 100],
      [100, 100],
    ];
    const result = pix2norm(shape, pts);
    
    // Top-left: (0, 0) -> (-1, -1)
    expect(result[0][0]).toBeCloseTo(-1, 10);
    expect(result[0][1]).toBeCloseTo(-1, 10);
    
    // Top-right: (100, 0) -> (1, -1)
    expect(result[1][0]).toBeCloseTo(1, 10);
    expect(result[1][1]).toBeCloseTo(-1, 10);
    
    // Bottom-left: (0, 100) -> (-1, 1)
    expect(result[2][0]).toBeCloseTo(-1, 10);
    expect(result[2][1]).toBeCloseTo(1, 10);
    
    // Bottom-right: (100, 100) -> (1, 1)
    expect(result[3][0]).toBeCloseTo(1, 10);
    expect(result[3][1]).toBeCloseTo(1, 10);
  });

  it("should handle array shape format", () => {
    const shape = [100, 200];
    const pts = [[100, 50]];
    const result = pix2norm(shape, pts);
    expect(result[0][0]).toBeCloseTo(0, 10);
    expect(result[0][1]).toBeCloseTo(0, 10);
  });

  it("should handle rectangular images", () => {
    const shape = { rows: 100, cols: 200 };
    const pts = [
      [0, 0],
      [200, 100],
    ];
    const result = pix2norm(shape, pts);
    
    // For 200x100 image, max dimension is 200, scale is 2/200 = 0.01
    // Center is at (100, 50)
    // Top-left: (0, 0) -> ((0-100)*0.01, (0-50)*0.01) = (-1, -0.5)
    expect(result[0][0]).toBeCloseTo(-1, 10);
    expect(result[0][1]).toBeCloseTo(-0.5, 10);
    
    // Bottom-right: (200, 100) -> ((200-100)*0.01, (100-50)*0.01) = (1, 0.5)
    expect(result[1][0]).toBeCloseTo(1, 10);
    expect(result[1][1]).toBeCloseTo(0.5, 10);
  });
});

describe("norm2pix", () => {
  it("should map (0, 0) to center pixel", () => {
    const shape = { rows: 100, cols: 200 };
    const pts = [[0, 0]];
    const result = norm2pix(shape, pts);
    expect(result[0][0]).toBe(100);
    expect(result[0][1]).toBe(50);
  });

  it("should round-trip with pix2norm", () => {
    const shape = { rows: 100, cols: 200 };
    const originalPts = [
      [50, 25],
      [150, 75],
      [100, 50],
    ];
    
    const normalized = pix2norm(shape, originalPts);
    const roundTrip = norm2pix(shape, normalized);
    
    for (let i = 0; i < originalPts.length; i++) {
      expect(roundTrip[i][0]).toBeCloseTo(originalPts[i][0], 0);
      expect(roundTrip[i][1]).toBeCloseTo(originalPts[i][1], 0);
    }
  });

  it("should return floating point when asInteger is false", () => {
    const shape = { rows: 100, cols: 200 };
    const pts = [[0.123, 0.456]];
    const result = norm2pix(shape, pts, false);
    
    // Should be floating point values
    expect(typeof result[0][0]).toBe("number");
    expect(typeof result[0][1]).toBe("number");
    // With non-trivial values, we should get non-integers
    expect(result[0][0]).not.toBe(Math.floor(result[0][0]));
  });

  it("should return integers when asInteger is true", () => {
    const shape = { rows: 100, cols: 200 };
    const pts = [[0.5, 0.5]];
    const result = norm2pix(shape, pts, true);
    
    // Should be integers
    expect(Number.isInteger(result[0][0])).toBe(true);
    expect(Number.isInteger(result[0][1])).toBe(true);
  });
});

describe("roundNearestMultiple", () => {
  it("should round up to nearest multiple", () => {
    expect(roundNearestMultiple(17, 16)).toBe(32);
    expect(roundNearestMultiple(33, 16)).toBe(48);
  });

  it("should keep exact multiples unchanged", () => {
    expect(roundNearestMultiple(32, 16)).toBe(32);
    expect(roundNearestMultiple(64, 16)).toBe(64);
  });

  it("should handle factor of 1", () => {
    expect(roundNearestMultiple(17.5, 1)).toBe(18);
  });

  it("should round 0 to 0", () => {
    expect(roundNearestMultiple(0, 16)).toBe(0);
  });

  it("should handle small values", () => {
    expect(roundNearestMultiple(1, 16)).toBe(16);
  });
});

describe("imgsize", () => {
  it("should format size as WIDTHxHEIGHT", () => {
    const img = { rows: 100, cols: 200 };
    expect(imgsize(img)).toBe("200x100");
  });

  it("should handle different dimensions", () => {
    const img = { rows: 768, cols: 1024 };
    expect(imgsize(img)).toBe("1024x768");
  });
});

