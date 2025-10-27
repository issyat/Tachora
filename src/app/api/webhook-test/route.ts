import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    message: 'Webhook test endpoint is working',
    timestamp: new Date().toISOString(),
    env: {
      hasWebhookSecret: !!process.env.CLERK_WEBHOOK_SECRET,
      nodeEnv: process.env.NODE_ENV
    }
  });
}

export async function POST(req: NextRequest) {
  console.log('🧪 WEBHOOK TEST - Received POST request');
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  try {
    const body = await req.json();
    console.log('Body:', JSON.stringify(body, null, 2));
    
    return NextResponse.json({ 
      message: 'Test webhook received successfully',
      receivedAt: new Date().toISOString(),
      bodyType: typeof body,
      hasData: !!body.data
    });
  } catch (error) {
    console.log('Error parsing body:', error);
    return NextResponse.json({ 
      message: 'Test webhook received but could not parse body',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}