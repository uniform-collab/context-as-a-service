import { NextRequest, NextResponse } from "next/server";
import { profiles } from "@/data/profiles";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const profile = profiles.find((p) => p.id === id);

  if (!profile) {
    return NextResponse.json(
      { error: `Profile with id "${id}" not found` },
      { status: 404 }
    );
  }

  return NextResponse.json(profile);
}
