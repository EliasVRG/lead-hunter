import { z } from "zod";

export const jobMatchSchema = z.object({
  score: z.number().min(0).max(100),
  tier: z.enum(["SKIP", "MAYBE", "APPLY"]),
  dimensions: z.object({
    skill_match: z.number().min(0).max(40),
    rate_fit: z.number().min(0).max(20),
    seniority_fit: z.number().min(0).max(20),
    urgency: z.number().min(0).max(20),
  }),
  reason: z.string(),
  red_flags: z.array(z.string()),
  recommended_action: z.string(),
});

export type JobMatchSchemaType = z.infer<typeof jobMatchSchema>;
