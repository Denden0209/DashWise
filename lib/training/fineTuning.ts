// lib/training/fineTuning.ts
// Collects rated conversations for fine-tuning GPT-4o mini.
// Users click 👍 on good advisor responses → saved as training data.
// When you have 50+ examples → run fine-tune job → cheaper inference.

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type TrainingExample = {
  id?:            string;
  uid:            string;
  userMessage:    string;
  assistantReply: string;
  rating:         "good" | "bad";
  bizType:        string;
  createdAt:      unknown;
  usedInTraining: boolean;
};

// ── Format examples as OpenAI fine-tune JSONL ─────────────
export function formatAsJSONL(examples: TrainingExample[]): string {
  return examples.map(ex => JSON.stringify({
    messages: [
      {
        role:    "system",
        content: "You are DashWise, an AI business advisor. Give specific, data-driven insights. Reference actual numbers. Be concise — 2-4 paragraphs max. Never invent data.",
      },
      { role: "user",      content: ex.userMessage    },
      { role: "assistant", content: ex.assistantReply },
    ],
  })).join("\n");
}

// ── Start a fine-tune job ─────────────────────────────────
// Call this from an admin script when you have 50+ good examples.
export async function startFineTuneJob(jsonlContent: string): Promise<string> {
  const blob   = new Blob([jsonlContent], { type: "application/json" });
  const file   = new File([blob], "dashwise_training.jsonl", { type: "application/json" });
  const upload = await openai.files.create({ file, purpose: "fine-tune" });

  const job = await openai.fineTuning.jobs.create({
    training_file:   upload.id,
    model:           "gpt-4o-mini",
    suffix:          "dashwise",
    hyperparameters: { n_epochs: "auto" },
  });

  return job.id;
  // Job takes 15-60 min. Check status at platform.openai.com → Fine-tuning
  // Once complete, use model ID "ft:gpt-4o-mini:...:dashwise:..." in parse-files route
}

export async function checkFineTuneStatus(jobId: string) {
  const job = await openai.fineTuning.jobs.retrieve(jobId);
  return {
    status:           job.status,
    fineTunedModelId: job.fine_tuned_model,
    trainedTokens:    job.trained_tokens,
  };
}
