import { NextResponse } from 'next/server';
import { kitRequestSchema, refineRequestSchema } from '@/contract/schemas';
import type { KitEvent } from '@/contract/types';
import { ownerFrom, personaFrom } from '@/server/identity';
import { HttpError, jsonEndpoint } from '@/server/http';
import { runKit, type PipelineDeps } from '@/server/pipeline';
import { loadRefineThread, runRefine } from '@/server/refine';
type Dependencies = PipelineDeps | (() => PipelineDeps);
function browserOwner(request: Request) {
  try {
    return ownerFrom(request);
  } catch {
    throw new HttpError(400, 'invalid_request', 'Invalid request');
  }
}
function sseResponse(pipeline: AsyncGenerator<KitEvent>) {
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
}

/** Dependency injection stays at the public handler boundary. */
export function createKitHandler(deps: Dependencies) {
  return async function handleKit(request: Request): Promise<Response> {
    return jsonEndpoint(async () => {
      const owner = browserOwner(request);
      const persona = personaFrom(request);
      const body = kitRequestSchema.parse(await request.json());
      return sseResponse(
        runKit(
          { ...body, owner, persona },
          typeof deps === 'function' ? deps() : deps,
        ),
      );
    });
  };
}
export function createRefineHandler(deps: Dependencies) {
  return async function handleRefine(request: Request): Promise<Response> {
    return jsonEndpoint(async () => {
      const owner = browserOwner(request);
      const body = refineRequestSchema.parse(await request.json());
      const dependencies = typeof deps === 'function' ? deps() : deps;
      const thread = await loadRefineThread(
        body.threadId,
        owner,
        dependencies.store,
      );
      return sseResponse(runRefine({ ...body, owner }, dependencies, thread));
    });
  };
}
