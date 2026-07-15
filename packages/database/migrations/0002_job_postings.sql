CREATE TABLE IF NOT EXISTS job_postings (
    id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,
    external_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    skills TEXT[],
    budget_type TEXT DEFAULT 'unknown',
    budget_min NUMERIC,
    budget_max NUMERIC,
    currency TEXT,
    client_name TEXT,
    client_rating NUMERIC,
    proposals_count INT,
    posted_at TIMESTAMP,
    score INT,
    tier TEXT,
    dimensions JSONB,
    reason TEXT,
    red_flags TEXT[] DEFAULT '{}',
    proposal_draft TEXT,
    status TEXT NOT NULL DEFAULT 'discovered',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_job_postings_platform_external_id ON job_postings (platform, external_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_tier ON job_postings (tier);
CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings (status);
