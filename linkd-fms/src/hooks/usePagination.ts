import { useState, useCallback, useMemo } from "react";

export interface PaginationState {
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (s: number) => void;
  from: number;
  to: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  resetPage: () => void;
  showing: { from: number; to: number; total: number };
}

/**
 * Reusable pagination state.
 *
 * For server-side pagination: pass `from` and `to` to the Supabase
 * `.range(from, to)` call.
 *
 * For client-side pagination: use `from` and `to` to `.slice()` the
 * data array: `data.slice(from, to + 1)`.
 */
export function usePagination(
  totalCount: number,
  defaultPageSize = 25
): PaginationState {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const resetPage = useCallback(() => setPage(1), []);

  const setPageSize = useCallback(
    (s: number) => {
      setPageSizeRaw(s);
      setPage(1);
    },
    []
  );

  const showing = useMemo(
    () => ({
      from: totalCount === 0 ? 0 : from + 1,
      to: Math.min(to + 1, totalCount),
      total: totalCount,
    }),
    [from, to, totalCount]
  );

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    from,
    to,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
    resetPage,
    showing,
  };
}
