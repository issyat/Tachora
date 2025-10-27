import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { processQuestionWithLLM } from "@/server/copilot/answer-pack-llm";
import { MemoryService } from "@/server/copilot/services/memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AnswerPackRequest {
  question: string;
  context: {
    storeId: string;
    isoWeek: string;
  };
  includeOtherStores?: boolean;
  threadId?: string;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. Authenticate
    const authResult = await auth();
    
    const { userId } = authResult;
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // TEMPORARY: Always use the known user ID for testing
    // TODO: Fix Clerk auth issue later
    const actualUserId = 'user_3329TDaGk7PRFLRGGcebxRgCqey';
    
    console.log("🎯 [ANSWERPACK-API] Using hardcoded userId for testing:", actualUserId);
    
    // 2. Parse request
    const body = (await req.json()) as AnswerPackRequest;
    const { question, context, includeOtherStores, threadId } = body;
    
    if (!question?.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }
    
    if (!context?.storeId || !context?.isoWeek) {
      return NextResponse.json(
        { error: "Context (storeId, isoWeek) is required" },
        { status: 400 }
      );
    }
    
    // 3. Generate thread ID and get memory
    const currentThreadId = threadId || MemoryService.generateThreadId(actualUserId, context.storeId);
    const threadMemory = MemoryService.getThreadMemory(currentThreadId);
    
    console.log("🎯 [ANSWERPACK-API] Request:", {
      question: question.substring(0, 100),
      storeId: context.storeId,
      isoWeek: context.isoWeek,
      includeOtherStores,
      threadId: currentThreadId,
      memory: threadMemory,
    });
    
    // 4. Process question with LLM (handles everything: language detection, entity resolution, data fetching, reasoning)
    const result = await processQuestionWithLLM(
      question,
      actualUserId,
      context.storeId,
      context.isoWeek,
      threadMemory,
      includeOtherStores
    );
    
    // 5. Update memory with the result
    MemoryService.updateThreadMemory(currentThreadId, result.updatedMemory);
    
    const totalTime = Date.now() - startTime;
    
    // 6. Log observability metrics
    console.log("✅ [ANSWERPACK-API] Response generated:", {
      fetchTime: `${result.metadata.fetchTime}ms`,
      llmTime: `${result.metadata.llmTime}ms`,
      totalTime: `${totalTime}ms`,
      payloadSize: `${(result.metadata.payloadSize / 1024).toFixed(1)} KB`,
      language: result.updatedMemory.language,
      threadId: currentThreadId,
    });
    
    // 7. Return structured response
    return NextResponse.json({
      answer: result.answer,
      metadata: {
        ...result.metadata,
        totalTime,
        language: result.updatedMemory.language,
        threadId: currentThreadId,
        disambiguation: false,
      },
    });
  } catch (error: any) {
    console.error("❌ [ANSWERPACK-API] Error:", error);
    
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}