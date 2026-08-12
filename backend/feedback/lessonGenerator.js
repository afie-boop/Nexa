const feedbackStore = require("./feedbackStore");
const { analyzeFeedback } = require("./feedbackAnalyzer");

async function processUserFeedback(feedbackData) {
  // 1. Save raw feedback first
  const savedFeedback = feedbackStore.addFeedback(feedbackData);

  // 2. Process based on feedback type
  if (feedbackData.type === "positive") {
    // Adjust any overlapping lessons to decrease confidence since this represents a success case
    feedbackStore.adjustLessonOnPositiveFeedback(feedbackData.user_message + " " + feedbackData.ai_response);
    return {
      status: "success",
      feedback: savedFeedback
    };
  } else if (feedbackData.type === "negative") {
    // Dislike event requires error analysis
    try {
      const analysis = await analyzeFeedback(feedbackData);

      if (analysis.type === "preference") {
        const pref = feedbackStore.addOrUpdatePreference(analysis.lesson_or_preference);
        return {
          status: "processed_preference",
          feedback: savedFeedback,
          preference: pref
        };
      } else {
        const lesson = feedbackStore.addOrUpdateLesson({
          category: analysis.category,
          lesson: analysis.lesson_or_preference,
          type: "negative",
          source_feedback_id: savedFeedback.id,
          original_context: feedbackData.user_message,
          confidence: analysis.confidence
        });
        return {
          status: "processed_lesson",
          feedback: savedFeedback,
          lesson: lesson
        };
      }
    } catch (err) {
      console.error("[lessonGenerator] Gagal memproses analisa maklum balas negatif:", err);
      // Fallback: save standard low-confidence lesson
      const lesson = feedbackStore.addOrUpdateLesson({
        category: "other",
        lesson: `Elakkan pepijat dalam menjawab permintaan seperti: ${feedbackData.user_message.substring(0, 50)}`,
        type: "negative",
        source_feedback_id: savedFeedback.id,
        original_context: feedbackData.user_message,
        confidence: "low"
      });
      return {
        status: "processed_lesson_fallback",
        feedback: savedFeedback,
        lesson
      };
    }
  }

  return {
    status: "ignored",
    feedback: savedFeedback
  };
}

module.exports = { processUserFeedback };
