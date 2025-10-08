import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { message } = await request.json().catch(() => ({ message: "" }));
  const reply = message
    ? `I received: "${String(message).slice(0, 200)}". This is a stub; connect me to scheduling when ready.`
    : "Hello! Ask me to modify the schedule (stub).";
  return NextResponse.json({ reply });
}
