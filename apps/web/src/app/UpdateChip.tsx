import { Button, IconButton } from '../kit';

export interface UpdateChipProps {
  needRefresh: boolean;
  onReload: () => void;
  onDismiss: () => void;
}

export function UpdateChip({ needRefresh, onReload, onDismiss }: UpdateChipProps) {
  if (!needRefresh) return null;
  return (
    <div className="update-chip" role="status">
      <span className="update-chip__text">Update ready</span>
      <Button variant="outline" size="md" onClick={onReload}>
        Reload
      </Button>
      <IconButton icon="close" label="Dismiss update notice" onClick={onDismiss} />
    </div>
  );
}
