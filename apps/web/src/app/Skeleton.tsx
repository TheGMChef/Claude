/** Static placeholder blocks with the page's own geometry; no spinner, no motion (loaders). */
export function Skeleton() {
  return (
    <main className="page" id="main" aria-busy="true" aria-label="Loading">
      <div className="skeleton" aria-hidden="true">
        <div className="skeleton__line skeleton__line--title" />
        <div className="skeleton__line" />
        <div className="skeleton__line" />
      </div>
    </main>
  );
}
