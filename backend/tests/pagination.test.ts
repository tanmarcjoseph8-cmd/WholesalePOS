import { describe, expect, it } from "vitest";
import { buildPaginatedResponse, getPagination } from "../src/shared/pagination.js";

describe("paginated responses", () => {
  it("keeps root pagination fields and exposes the frontend pagination object", () => {
    const response = buildPaginatedResponse([{ id: "product-1" }], 11, 2, 5);

    expect(response).toMatchObject({
      items: [{ id: "product-1" }],
      page: 2,
      pageSize: 5,
      total: 11,
      totalPages: 3,
      pagination: {
        page: 2,
        pageSize: 5,
        total: 11,
        totalPages: 3
      }
    });
  });

  it("allows local app lists up to one thousand rows", () => {
    expect(getPagination({ pageSize: 1000 }).take).toBe(1000);
    expect(getPagination({ pageSize: 5000 }).take).toBe(1000);
  });
});
