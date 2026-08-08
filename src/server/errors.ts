/**
 * Application error types.
 *
 * Every error that can reach a user carries a Turkish message. Raw exception
 * text from the database or a third-party library is never surfaced.
 */

export type AppErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'internal';

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Turkish message safe to display to the user. */
  readonly userMessage: string;
  readonly status: number;

  constructor(code: AppErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(`${code}: ${userMessage}`, options);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.status = STATUS_BY_CODE[code];
  }
}

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export function unauthenticated(message = 'Bu işlem için giriş yapmanız gerekiyor.'): AppError {
  return new AppError('unauthenticated', message);
}

export function forbidden(message = 'Bu içeriği görüntüleme yetkiniz bulunmuyor.'): AppError {
  return new AppError('forbidden', message);
}

export function notFound(message = 'Aradığınız kayıt bulunamadı.'): AppError {
  return new AppError('not_found', message);
}

export function validationError(message: string): AppError {
  return new AppError('validation', message);
}

export function conflict(message: string): AppError {
  return new AppError('conflict', message);
}

export function rateLimited(
  message = 'Çok fazla deneme yaptınız. Lütfen bir süre sonra tekrar deneyin.',
): AppError {
  return new AppError('rate_limited', message);
}

export function internalError(cause?: unknown): AppError {
  return new AppError('internal', 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.', {
    cause,
  });
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Converts any thrown value into a safe Turkish message. Unknown errors are
 * deliberately flattened so library or database text cannot leak to the user.
 */
export function toUserMessage(error: unknown): string {
  if (isAppError(error)) return error.userMessage;
  return 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
}
