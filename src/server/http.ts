import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function jsonEndpoint(
  action: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await action();
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError)
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Invalid request' } },
        { status: 400 },
      );
    if (e instanceof HttpError)
      return NextResponse.json(
        { error: { code: e.code, message: e.message } },
        { status: e.status },
      );
    return NextResponse.json(
      {
        error: {
          code: 'unavailable',
          message: 'Store temporarily unavailable',
        },
      },
      { status: 503 },
    );
  }
}
