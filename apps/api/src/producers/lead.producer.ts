import { addJob, JobType } from "@lead-hunter/queue";

export async function addLead(lead: Record<string, unknown>) {
  await addJob(JobType.Scrape, lead);
}
