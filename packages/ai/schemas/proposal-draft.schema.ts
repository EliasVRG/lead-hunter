import { z } from "zod";

export const proposalDraftSchema = z.object({
  proposalDraft: z.string().min(1),
});

export type ProposalDraftSchemaType = z.infer<typeof proposalDraftSchema>;
