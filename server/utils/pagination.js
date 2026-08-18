/**
 * Shared pagination helpers for list endpoints.
 *
 * Endpoints accept `?page=&pageSize=` and return a consistent envelope:
 *   { data, total, page, pageSize, totalPages }
 *
 * Keeping this in one place ensures every paginated route parses params and
 * shapes its response identically, so the frontend can treat them uniformly.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/**
 * Parse and clamp pagination query params from an Express request.
 * @returns {{ page: number, pageSize: number, limit: number, offset: number }}
 */
export function parsePagination(query) {
  let page = Number.parseInt(query.page, 10);
  let pageSize = Number.parseInt(query.pageSize, 10);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}

/**
 * Wrap a page of rows in the standard response envelope.
 */
export function paginatedResponse(data, total, page, pageSize) {
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
