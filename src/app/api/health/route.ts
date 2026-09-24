export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true, data: { status: 'up', time: new Date().toISOString() } });
}
