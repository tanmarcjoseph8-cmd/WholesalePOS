export type PaginationInput = {
  page?: number;
  pageSize?: number;
};

export const maxPageSize = 1000;

export function getPagination(input: PaginationInput) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, input.pageSize ?? 25));

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

export function buildPaginatedResponse<T>(items: T[], total: number, page: number, pageSize: number) {
  const pagination = {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize)
  };

  return {
    items,
    ...pagination,
    pagination
  };
}
