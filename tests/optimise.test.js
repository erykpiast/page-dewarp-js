import { describe, it, expect } from "vitest";
import { minimize } from "../src/optimise.js";

describe("minimize", () => {
  it("should minimize simple quadratic function", () => {
    // f(x) = (x - 2)^2, minimum at x = 2
    const objective = (x) => Math.pow(x[0] - 2, 2);
    const initialParams = [0];

    const result = minimize(objective, initialParams, {
      maxIter: 100,
      tol: 1e-6,
      log: false,
    });

    expect(result.x[0]).toBeCloseTo(2, 3);
    expect(result.fx).toBeCloseTo(0, 6);
  });

  it("should minimize 2D quadratic function", () => {
    // f(x, y) = (x - 3)^2 + (y + 1)^2, minimum at (3, -1)
    const objective = (p) => Math.pow(p[0] - 3, 2) + Math.pow(p[1] + 1, 2);
    const initialParams = [0, 0];

    const result = minimize(objective, initialParams, {
      maxIter: 100,
      tol: 1e-6,
      log: false,
    });

    expect(result.x[0]).toBeCloseTo(3, 3);
    expect(result.x[1]).toBeCloseTo(-1, 3);
    expect(result.fx).toBeCloseTo(0, 6);
  });

  it("should minimize Rosenbrock function", () => {
    // Rosenbrock function: f(x, y) = (1-x)^2 + 100*(y-x^2)^2
    // Minimum at (1, 1)
    const objective = (p) => {
      const x = p[0];
      const y = p[1];
      return Math.pow(1 - x, 2) + 100 * Math.pow(y - x * x, 2);
    };
    const initialParams = [0, 0];

    const result = minimize(objective, initialParams, {
      maxIter: 200,
      tol: 1e-6,
      log: false,
    });

    // Rosenbrock is harder to optimize, so we allow larger tolerance
    expect(result.x[0]).toBeCloseTo(1, 2);
    expect(result.x[1]).toBeCloseTo(1, 2);
    expect(result.fx).toBeLessThan(0.01);
  });

  it("should decrease objective value", () => {
    const objective = (p) => Math.pow(p[0] - 5, 2) + Math.pow(p[1] - 3, 2);
    const initialParams = [0, 0];
    const initialValue = objective(initialParams);

    const result = minimize(objective, initialParams, {
      maxIter: 100,
      tol: 1e-6,
      log: false,
    });

    expect(result.fx).toBeLessThan(initialValue);
  });

  it("should handle high-dimensional problems", () => {
    // Sum of squares: f(x1, ..., xn) = sum((xi - i)^2)
    // Minimum at x = [1, 2, 3, 4, 5]
    const n = 5;
    const objective = (p) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += Math.pow(p[i] - (i + 1), 2);
      }
      return sum;
    };
    const initialParams = new Array(n).fill(0);

    const result = minimize(objective, initialParams, {
      maxIter: 200,
      tol: 1e-6,
      log: false,
    });

    for (let i = 0; i < n; i++) {
      expect(result.x[i]).toBeCloseTo(i + 1, 2);
    }
    expect(result.fx).toBeCloseTo(0, 4);
  });

  it("should respect maxIter limit", () => {
    const objective = (p) => Math.pow(p[0] - 100, 2);
    const initialParams = [0];

    // With only 1 iteration, might not reach optimum
    const result = minimize(objective, initialParams, {
      maxIter: 1,
      tol: 1e-6,
      log: false,
    });

    // Initial value is 10000, with 1 iteration it should improve but not reach 0
    const initialValue = objective(initialParams);
    expect(result.fx).toBeLessThan(initialValue);
  });

  it("should handle flat region (constant function)", () => {
    const objective = (p) => 5;
    const initialParams = [1, 2, 3];

    const result = minimize(objective, initialParams, {
      maxIter: 100,
      tol: 1e-6,
      log: false,
    });

    expect(result.fx).toBe(5);
  });

  it("should return result with x and fx properties", () => {
    const objective = (p) => p[0] * p[0];
    const initialParams = [3];

    const result = minimize(objective, initialParams, {
      maxIter: 100,
      tol: 1e-6,
      log: false,
    });

    expect(result).toHaveProperty("x");
    expect(result).toHaveProperty("fx");
    expect(Array.isArray(result.x)).toBe(true);
    expect(typeof result.fx).toBe("number");
  });
});

