export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    request_id?: string;
    retryable?: boolean;
  };
};

export class ApiError extends Error {
  code: string;
  requestId?: string;
  retryable: boolean;
  status: number;

  constructor(message: string, options: { code?: string; requestId?: string; retryable?: boolean; status: number }) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code ?? 'request_failed';
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  let data: unknown = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const body = (data ?? {}) as ApiErrorBody;
    throw new ApiError(body.error?.message ?? 'The request could not be completed.', {
      code: body.error?.code,
      requestId: body.error?.request_id,
      retryable: body.error?.retryable,
      status: response.status,
    });
  }
  return data as T;
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return error.requestId ? `${error.message} Request ID: ${error.requestId}` : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}
