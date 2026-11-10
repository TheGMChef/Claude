import { Button } from './Button';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  label: string;
}

export function Pagination({ page, pageSize, total, onPage, label }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return (
    <nav className="pagination" aria-label={label}>
      <Button variant="outline" disabled={current <= 1} onClick={() => onPage(current - 1)}>
        Previous
      </Button>
      <span className="pagination__status">
        Page {current} of {pages} · {total} {total === 1 ? 'entry' : 'entries'}
      </span>
      <Button variant="outline" disabled={current >= pages} onClick={() => onPage(current + 1)}>
        Next
      </Button>
    </nav>
  );
}
