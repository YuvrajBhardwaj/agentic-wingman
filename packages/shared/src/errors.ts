export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'TOOL_INPUT_INVALID'
  | 'TOOL_EXECUTION_FAILED'
  | 'LLM_REQUEST_FAILED'
  | 'ABORTED'
  | 'DEPENDENCY_NOT_REGISTERED'
  | 'INTERNAL';

export interface ErrorContext {
  readonly [key: string]: unknown;
}

/** Base error carrying a stable machine-readable code and structured context. */
export class ForgewrightError extends Error {
  readonly code: ErrorCode;
  readonly context: ErrorContext;

  constructor(
    code: ErrorCode,
    message: string,
    context: ErrorContext = {},
    options?: { cause?: unknown },
  ) {
    super(message, options as ErrorOptions | undefined);
    this.name = 'ForgewrightError';
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, ForgewrightError.prototype);
  }
}

export const isForgewrightError = (value: unknown): value is ForgewrightError =>
  value instanceof ForgewrightError;

/** Normalize any thrown value into a ForgewrightError. */
export const toForgewrightError = (
  value: unknown,
  fallbackCode: ErrorCode = 'INTERNAL',
): ForgewrightError => {
  if (isForgewrightError(value)) return value;
  if (value instanceof Error) {
    return new ForgewrightError(fallbackCode, value.message, {}, { cause: value });
  }
  return new ForgewrightError(fallbackCode, String(value));
};
