export function InkOutline({ radius = 4 }: { radius?: number }) {
  return <span className="ink-outline" aria-hidden="true" style={{ borderRadius: radius }} />;
}
