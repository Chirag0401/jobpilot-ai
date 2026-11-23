import { NextResponse } from "next/server";
import { getJobs } from "@/lib/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
 try {
  const data = await getJobs();
  return NextResponse.json(data, { headers: {"Cache-Control":"public, s-maxage=300, stale-while-revalidate=900"} });
 } catch {
  return NextResponse.json({error:"Unable to search feeds right now",jobs:[],warnings:[]},{status:503});
 }
}
