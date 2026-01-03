/**
 * Analysis Routes
 *
 * Endpoints for the multi-agent analysis system.
 */

import { Router } from "express";
import { analysisOrchestrator } from "./orchestrator/analysisOrchestrator";
import type {
  AnalyzeRequestBody,
  AnalyzeResponseBody,
} from "./agents/types/analysisTypes";
import { getQuestionByIndex } from "./prompts/simpleConversationQuestions";
import { getLesson2Question } from "./prompts/lesson2Questions";

export const analysisRouter = Router();

/**
 * POST /api/analysis/evaluate
 *
 * Main endpoint for evaluating student responses.
 *
 * Request Body:
 * {
 *   transcription: string,      // Student's spoken response
 *   currentQuestion?: string,   // The question (optional if questionIndex provided)
 *   questionIndex: number,      // 1-based question index
 *   lessonNumber: number,       // 1 or 2
 *   sessionId: string,          // Session tracking ID
 *   partNumber?: number,        // For Lesson 2
 *   questionInPart?: number,    // For Lesson 2
 *   includeDebug?: boolean      // Include full agent outputs in response
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   decision: 'advance' | 'correct_and_retry' | 'clarify_and_retry' | 'off_topic_retry' | 'ignore',
 *   shouldAdvance: boolean,
 *   tutorInstruction: string,
 *   grammarFeedback?: string,
 *   processingTimeMs: number,
 *   debug?: { grammarResult, verifierResult, judgeResult }
 * }
 */
analysisRouter.post("/evaluate", async (req, res) => {
  const startTime = Date.now();

  try {
    const body: AnalyzeRequestBody = req.body;

    // Validate required fields
    if (!body.transcription) {
      return res.status(400).json({
        error: "Missing required field: transcription",
      });
    }

    if (!body.questionIndex && !body.currentQuestion) {
      return res.status(400).json({
        error: "Either questionIndex or currentQuestion is required",
      });
    }

    // Get the current question from the appropriate questions array
    let currentQuestion = body.currentQuestion;

    if (!currentQuestion) {
      if (body.lessonNumber === 2 && body.partNumber && body.questionInPart) {
        currentQuestion =
          getLesson2Question(body.partNumber, body.questionInPart) || "";
      } else {
        currentQuestion = getQuestionByIndex(body.questionIndex) || "";
      }
    }

    if (!currentQuestion) {
      return res.status(400).json({
        error: "Could not determine current question",
      });
    }

    // Call the orchestrator
    const result = await analysisOrchestrator.analyze(
      {
        transcription: body.transcription,
        currentQuestion,
        questionIndex: body.questionIndex,
        lessonNumber: body.lessonNumber || 1,
        sessionId: body.sessionId || "unknown",
        metadata: {
          partNumber: body.partNumber,
          questionInPart: body.questionInPart,
        },
      },
      body.includeDebug
    );

    // Log for debugging
    console.log(
      `[ANALYSIS] Session ${body.sessionId} | Q${body.questionIndex} | Decision: ${result.decision} | ${result.processingTimeMs}ms`
    );

    const response: AnalyzeResponseBody = {
      success: result.success,
      decision: result.decision,
      shouldAdvance: result.shouldAdvance,
      tutorInstruction: result.tutorInstruction,
      grammarFeedback: result.grammarFeedback,
      processingTimeMs: result.processingTimeMs,
    };

    if (body.includeDebug && result.debug) {
      response.debug = result.debug;
    }

    res.json(response);
  } catch (error: unknown) {
    console.error("[ANALYSIS] Endpoint error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({
      error: message,
      processingTimeMs: Date.now() - startTime,
    });
  }
});

/**
 * GET /api/analysis/health
 *
 * Health check endpoint for the analysis system.
 */
analysisRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    agents: ["grammar", "verifier", "judge"],
    timestamp: new Date().toISOString(),
  });
});
