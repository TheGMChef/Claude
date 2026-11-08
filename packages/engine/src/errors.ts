export type ContentErrorCode =
  | 'duplicate-id'
  | 'unresolved-ref'
  | 'cycle'
  | 'empty-table'
  | 'bad-weight'
  | 'unknown-safety-tag'
  | 'unknown-tag'
  | 'weak-culture'
  | 'missing-source'
  | 'schema'
  | 'namespace';

export class ContentError extends Error {
  readonly code: ContentErrorCode;
  readonly path: string;
  readonly packId: string;

  constructor(code: ContentErrorCode, message: string, path: string, packId: string) {
    super(message);
    this.name = 'ContentError';
    this.code = code;
    this.path = path;
    this.packId = packId;
  }
}
