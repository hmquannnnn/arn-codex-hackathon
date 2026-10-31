import { NextResponse } from 'next/server';
import { kitRequestSchema } from '@/contract/schemas';
import { ownerFrom, personaFrom } from '@/server/identity';
import { HttpError, jsonEndpoint } from '@/server/http';
import { runKit, type PipelineDeps } from '@/server/pipeline';

/** Dependency injection stays at the handler boundary; live factories run only after validation. */
export function createKitHandler(deps: PipelineDeps | (() => PipelineDeps)) {
  return async function handleKit(request: Request): Promise<Response> {
    return jsonEndpoint(async () => {
      let owner: string;
      try {
        owner = ownerFrom(request);
      } catch {
        throw new HttpError(400, 'invalid_request', 'Invalid request');
      }
      const persona = personaFrom(request);
      const body = kitRequestSchema.parse(await request.json());
      const input = { ...body, owner, persona };
      const pipeline = runKit(
        input,
        typeof deps === 'function' ? deps() : deps,
      );
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const result = await pipeline.next();
            if (result.done) {
              controller.close();
              return;
            }
            controller.enqueue(
              encoder.encode(
                `event: ${result.value.event}\ndata: ${JSON.stringify(result.value.data)}\n\n`,
              ),
            );
          } catch {
            controller.error(new Error('Kit stream unavailable'));
          }
        },
        async cancel() {
          await pipeline.return(undefined);
        },
      });
      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    });
  };
}
