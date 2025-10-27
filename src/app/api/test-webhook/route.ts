import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  console.log('🔔 TEST WEBHOOK CALLED!');
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  try {
    const body = await req.json();
    console.log('Body:', JSON.stringify(body, null, 2));
  } catch (e) {
    console.log('No JSON body');
  }
  
  return NextResponse.json({ message: 'Test webhook received' });
}

export async function GET() {
  return NextResponse.json({ message: 'Test webhook endpoint is working' });
}