import { editHandlers } from '@/server/kit/edit-handlers';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return editHandlers.thread(request, (await context.params).id);
}
