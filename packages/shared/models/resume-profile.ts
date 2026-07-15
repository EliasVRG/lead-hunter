export type Seniority = "junior" | "pleno" | "senior" | "especialista";
export type Availability = "full-time" | "part-time" | "project-based";
export type RemotePreference = "remote-only" | "hybrid" | "onsite-ok";

export interface ResumeProfile {
  id?: number;
  name: string;
  headline: string;
  seniority: Seniority;
  skills: string[];
  roles: string[];
  stack: string[];
  minRate: number | null;
  maxRate: number | null;
  currency: string;
  availability: Availability;
  remotePreference: RemotePreference;
  languages: string[];
  bio: string;
  updated_at?: Date;
}
