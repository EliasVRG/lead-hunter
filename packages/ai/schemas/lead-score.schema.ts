import { z } from "zod";

export const leadScoreSchema = z.object({
  score: z.number().min(0).max(100),
  tiers: z.enum(["COLD", "WARM", "HOT"]),
  dimensions: z.object({
    technical_pain: z.number().min(0).max(25),
    digital_maturity: z.number().min(0).max(25),
    urgency: z.number().min(0).max(25),
    financial_potential: z.number().min(0).max(25),
  }),
  reason: z.string(),
  recommended_approach: z.string(),
});

export type LeadScoreSchemaType = z.infer<typeof leadScoreSchema>;
