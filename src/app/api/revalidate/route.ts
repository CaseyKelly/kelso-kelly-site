import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * POST /api/revalidate
 * Manually trigger revalidation of specific paths
 * Can be called after syncing data to immediately update the site
 */
export async function POST(req: NextRequest) {
  try {
    // Optional: Add authentication
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret && secret !== process.env.REVALIDATE_SECRET) {
      return new NextResponse("Invalid secret", { status: 401 });
    }

    const body = await req.json();
    const { path, paths } = body;

    // Revalidate specific path or multiple paths
    const pathsToRevalidate = paths || (path ? [path] : ['/schedule', '/media']);
    
    for (const p of pathsToRevalidate) {
      revalidatePath(p);
      console.log(`Revalidated path: ${p}`);
    }

    return NextResponse.json({
      revalidated: true,
      paths: pathsToRevalidate,
      now: Date.now(),
    });
  } catch (err) {
    console.error('Revalidate error:', err);
    return new NextResponse(`${err}`, { status: 500 });
  }
}

/**
 * GET /api/revalidate?path=/schedule&secret=xxx
 * Revalidate via GET request (useful for testing)
 */
export async function GET(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret && secret !== process.env.REVALIDATE_SECRET) {
      return new NextResponse("Invalid secret", { status: 401 });
    }

    const path = req.nextUrl.searchParams.get('path') || '/';
    
    revalidatePath(path);
    console.log(`Revalidated path: ${path}`);

    return NextResponse.json({
      revalidated: true,
      path,
      now: Date.now(),
    });
  } catch (err) {
    console.error('Revalidate error:', err);
    return new NextResponse(`${err}`, { status: 500 });
  }
}
