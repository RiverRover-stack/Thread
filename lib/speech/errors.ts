export class TranscriptionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "TranscriptionError";
  }
}
