import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Polled by the board every 10 seconds. Kept cheap: one round trip. */
export async function GET() {
  try {
    const board = await loadBoard();
    return NextResponse.json(board, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("board load failed", err);
    return NextResponse.json(
      { error: "The board could not be loaded. Try again in a moment." },
      { status: 500 },
    );
  }
}
