const assert = require('assert');
const { Brain, extractMemory, extractMemoryWithAI } = require('./brain');

console.log('--- Running AXMchat Brain AI Memory Intelligence Layer Tests ---');

async function runTests() {
  const sampleInput = "Aku memang lebih selesa guna React daripada Vue.";

  // 1. Test Valid LLM Extraction with Injected Mock
  console.log('Testing Valid LLM Extraction with Injected Mock...');
  const mockExtractor = async (prompt) => {
    return {
      memories: [
        {
          content: "User prefers React over Vue.",
          type: "preference",
          category: "user",
          importance: 0.8,
          confidence: 0.92,
          tags: ["preference"],
          source: "lebih selesa guna React daripada Vue"
        }
      ]
    };
  };

  const aiRes = await extractMemoryWithAI(sampleInput, { llmExtractor: mockExtractor });
  console.log('AI Extracted Memories:', aiRes.memories);
  assert.strictEqual(aiRes.memories.length, 1);
  assert.strictEqual(aiRes.memories[0].content, "User prefers React over Vue.");
  assert.strictEqual(aiRes.memories[0].type, "preference");
  assert.ok(aiRes.memories[0].suggestedPath.startsWith('Users/'));

  // 2. Test Anti-Hallucination Guard (Source Validation)
  console.log('Testing Anti-Hallucination Guard...');
  const hallucinatedMock = async (prompt) => {
    return {
      memories: [
        {
          content: "User is an experienced frontend developer.",
          type: "fact",
          category: "user",
          importance: 0.9,
          confidence: 0.95,
          tags: ["fact"],
          source: "User is a senior developer with 10 years experience" // Source NOT in input!
        }
      ]
    };
  };

  const hallRes = await extractMemoryWithAI(sampleInput, { llmExtractor: hallucinatedMock });
  console.log('Hallucinated Memories Count (Expected 0):', hallRes.memories.length);
  assert.strictEqual(hallRes.memories.length, 0, 'Hallucinated memory with unverified source must be rejected');

  // 3. Test Invalid Memory Type Rejection
  console.log('Testing Invalid Memory Type Rejection...');
  const invalidTypeMock = async () => {
    return {
      memories: [
        {
          content: "Test",
          type: "invalid_type_xyz",
          importance: 0.8,
          confidence: 0.9,
          source: "React"
        }
      ]
    };
  };
  const invalidTypeRes = await extractMemoryWithAI(sampleInput, { llmExtractor: invalidTypeMock });
  assert.strictEqual(invalidTypeRes.memories.length, 0);

  // 4. Test Confidence Threshold Filtering
  console.log('Testing Confidence Threshold Filtering...');
  const lowConfMock = async () => {
    return {
      memories: [
        {
          content: "User might like React.",
          type: "preference",
          importance: 0.5,
          confidence: 0.4, // Below 0.6 default threshold
          source: "React"
        }
      ]
    };
  };
  const lowConfRes = await extractMemoryWithAI(sampleInput, { llmExtractor: lowConfMock, confidenceThreshold: 0.6 });
  assert.strictEqual(lowConfRes.memories.length, 0);

  // 5. Test Auto Mode Fallback to Rules when LLM Extractor fails or throws Error
  console.log('Testing Auto Mode Fallback on LLM Failure...');
  const failingLLMExtractor = async () => {
    throw new Error("LLM API Timeout / Rate Limit Exceeded");
  };

  // Input contains rule keyword "saya suka"
  const ruleInput = "Saya suka guna React dan Tailwind CSS.";
  const autoFallbackRes = await extractMemory(ruleInput, {
    mode: "auto",
    llmExtractor: failingLLMExtractor
  });

  console.log('Auto Fallback Extracted Memories:', autoFallbackRes.memories);
  assert.strictEqual(autoFallbackRes.memories.length, 1);
  assert.strictEqual(autoFallbackRes.memories[0].type, "preference");

  // 6. Test Rules Mode does NOT call LLM
  console.log('Testing Rules Mode Bypass...');
  let llmCalled = false;
  const trackingLLM = async () => {
    llmCalled = true;
    return { memories: [] };
  };

  await extractMemory(ruleInput, { mode: "rules", llmExtractor: trackingLLM });
  assert.strictEqual(llmCalled, false, 'Rules mode must not call LLM');

  // 7. Test Brain Class Integration
  console.log('Testing Brain Class Integration...');
  const brain = new Brain('./test_temp_vault');
  const brainAIRes = await brain.extractMemoryWithAI(sampleInput, { llmExtractor: mockExtractor });
  assert.strictEqual(brainAIRes.memories.length, 1);

  const brainAutoRes = await brain.extractMemory(ruleInput, { mode: "rules" });
  assert.strictEqual(brainAutoRes.memories.length, 1);

  console.log('✅ ALL AI MEMORY INTELLIGENCE LAYER TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ AI Memory Intelligence Layer Test Failed:', err);
  process.exit(1);
});
