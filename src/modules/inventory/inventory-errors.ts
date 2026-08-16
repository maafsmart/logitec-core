export class InventoryMutationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}
