const fs = require("fs");
const path = require("path");

const FEEDBACKS_FILE = path.join(__dirname, "data", "feedbacks.json");
const LESSONS_FILE = path.join(__dirname, "data", "lessons.json");
const PREFERENCES_FILE = path.join(__dirname, "data", "preferences.json");

function ensureDirectoryAndFiles() {
  const dir = path.join(__dirname, "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(FEEDBACKS_FILE)) {
    fs.writeFileSync(FEEDBACKS_FILE, JSON.stringify([], null, 2), "utf8");
  }
  if (!fs.existsSync(LESSONS_FILE)) {
    fs.writeFileSync(LESSONS_FILE, JSON.stringify([], null, 2), "utf8");
  }
  if (!fs.existsSync(PREFERENCES_FILE)) {
    fs.writeFileSync(PREFERENCES_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

function readJSON(filePath) {
  try {
    ensureDirectoryAndFiles();
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error(`[feedbackStore] Gagal membaca fail ${filePath}:`, err);
    return [];
  }
}

function writeJSON(filePath, obj) {
  try {
    ensureDirectoryAndFiles();
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error(`[feedbackStore] Gagal menulis fail ${filePath}:`, err);
    return false;
  }
}

const feedbackStore = {
  // Feedbacks
  getFeedbacks() {
    return readJSON(FEEDBACKS_FILE);
  },

  addFeedback(feedback) {
    const list = this.getFeedbacks();
    const item = {
      id: feedback.id || "fb_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      conversation_id: feedback.conversation_id || "",
      message_id: feedback.message_id || "",
      user_message: feedback.user_message || "",
      ai_response: feedback.ai_response || "",
      provider: feedback.provider || "",
      model: feedback.model || "",
      type: feedback.type || "positive", // 'positive' atau 'negative'
      reason: feedback.reason || "",
      created_at: feedback.created_at || new Date().toISOString()
    };

    // Remove duplicates if any
    const existingIdx = list.findIndex(
      f => f.conversation_id === item.conversation_id && f.message_id === item.message_id
    );

    if (existingIdx !== -1) {
      list[existingIdx] = item;
    } else {
      list.push(item);
    }

    writeJSON(FEEDBACKS_FILE, list);
    return item;
  },

  // Lessons
  getLessons() {
    return readJSON(LESSONS_FILE);
  },

  saveLessons(lessons) {
    return writeJSON(LESSONS_FILE, lessons);
  },

  addOrUpdateLesson(lessonData) {
    const lessons = this.getLessons();
    const now = new Date().toISOString();

    // Try to find an existing lesson that is highly similar or matching the exact text
    const existingIdx = lessons.findIndex(
      l => l.lesson.toLowerCase().trim() === lessonData.lesson.toLowerCase().trim() ||
           (l.category === lessonData.category && l.lesson.toLowerCase().includes(lessonData.lesson.toLowerCase().substring(0, 30)))
    );

    if (existingIdx !== -1) {
      const existing = lessons[existingIdx];
      // Update frequency and confidence
      existing.frequency = (existing.frequency || 1) + 1;
      if (lessonData.type === "negative") {
        existing.negative_count = (existing.negative_count || 0) + 1;
      } else if (lessonData.type === "positive") {
        existing.positive_count = (existing.positive_count || 0) + 1;
      }

      if (lessonData.source_feedback_id && !existing.source_feedback_ids.includes(lessonData.source_feedback_id)) {
        existing.source_feedback_ids.push(lessonData.source_feedback_id);
      }

      // Recalculate confidence based on frequency & feedback ratio
      // 1 negative count = low confidence
      // >= 3 negative count with little positive = medium/high
      // Many feedback with high ratio of negative = high
      const netNegative = existing.negative_count - (existing.positive_count || 0);
      if (netNegative <= 1) {
        existing.confidence = "low";
      } else if (netNegative < 4) {
        existing.confidence = "medium";
      } else {
        existing.confidence = "high";
      }

      existing.updated_at = now;
      existing.last_seen = now;
      lessons[existingIdx] = existing;
      this.saveLessons(lessons);
      return existing;
    } else {
      // Create new lesson
      const newLesson = {
        id: "lsn_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        category: lessonData.category || "other",
        lesson: lessonData.lesson,
        source_feedback_ids: lessonData.source_feedback_id ? [lessonData.source_feedback_id] : [],
        confidence: lessonData.confidence || "low", // 'low', 'medium', 'high'
        positive_count: lessonData.type === "positive" ? 1 : 0,
        negative_count: lessonData.type === "negative" ? 1 : 0,
        original_context: lessonData.original_context || "",
        frequency: 1,
        created_at: now,
        updated_at: now,
        last_seen: now
      };
      lessons.push(newLesson);
      this.saveLessons(lessons);
      return newLesson;
    }
  },

  adjustLessonOnPositiveFeedback(feedbackText) {
    // If a feedback is marked as POSITIVE, and it overlaps with any error lessons,
    // we should decrement their confidence / increment their positive_count to "not trust blindly".
    const lessons = this.getLessons();
    let updated = false;

    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      // simple match if the positive context is related to the lesson
      if (feedbackText.toLowerCase().includes(lesson.lesson.toLowerCase()) ||
          lesson.lesson.toLowerCase().split(" ").some(word => word.length > 5 && feedbackText.toLowerCase().includes(word))) {
        lesson.positive_count = (lesson.positive_count || 0) + 1;
        lesson.frequency = (lesson.frequency || 1) + 1;
        lesson.last_seen = new Date().toISOString();

        const netNegative = lesson.negative_count - lesson.positive_count;
        if (netNegative <= 1) {
          lesson.confidence = "low";
        } else if (netNegative < 4) {
          lesson.confidence = "medium";
        } else {
          lesson.confidence = "high";
        }
        updated = true;
      }
    }

    if (updated) {
      this.saveLessons(lessons);
    }
  },

  // Preferences
  getPreferences() {
    return readJSON(PREFERENCES_FILE);
  },

  savePreferences(prefs) {
    return writeJSON(PREFERENCES_FILE, prefs);
  },

  addOrUpdatePreference(preferenceText) {
    const prefs = this.getPreferences();
    const now = new Date().toISOString();

    // Check if highly similar preference already exists
    const existingIdx = prefs.findIndex(
      p => p.preference.toLowerCase().trim() === preferenceText.toLowerCase().trim() ||
           p.preference.toLowerCase().includes(preferenceText.toLowerCase()) ||
           preferenceText.toLowerCase().includes(p.preference.toLowerCase())
    );

    if (existingIdx !== -1) {
      const existing = prefs[existingIdx];
      existing.evidence_count = (existing.evidence_count || 1) + 1;

      if (existing.evidence_count <= 1) {
        existing.confidence = "low";
      } else if (existing.evidence_count < 4) {
        existing.confidence = "medium";
      } else {
        existing.confidence = "high";
      }

      existing.updated_at = now;
      prefs[existingIdx] = existing;
      this.savePreferences(prefs);
      return existing;
    } else {
      const newPref = {
        id: "pref_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        preference: preferenceText,
        confidence: "low",
        evidence_count: 1,
        created_at: now,
        updated_at: now
      };
      prefs.push(newPref);
      this.savePreferences(prefs);
      return newPref;
    }
  }
};

// Ensure directories and files exist on import
ensureDirectoryAndFiles();

module.exports = feedbackStore;
