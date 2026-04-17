import { NextResponse } from "next/server";
import { profiles } from "@/data/profiles";

export async function GET() {
  return NextResponse.json(profiles);
}
