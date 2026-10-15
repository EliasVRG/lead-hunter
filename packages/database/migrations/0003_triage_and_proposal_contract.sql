-- Alinha job_postings com o contrato de output do OpenRouter e com os campos
-- que o scraper do 99Freelas realmente extrai.
--
-- Status: 'reviewing' passou a 'triaged' — o nome anterior sugeria ação humana
-- pendente, quando na prática é o estado "a IA pontuou, aguardando decisão".

ALTER TABLE job_postings
    -- Campos adicionais disponíveis na listagem/detalhe do 99Freelas
    ADD COLUMN IF NOT EXISTS client_reviews_count INT,
    ADD COLUMN IF NOT EXISTS interested_count INT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS subcategory TEXT,
    ADD COLUMN IF NOT EXISTS experience_level TEXT,
    ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,

    -- Contrato de triagem
    ADD COLUMN IF NOT EXISTS matched_skills TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS missing_skills TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS recommended_action TEXT,
    ADD COLUMN IF NOT EXISTS confidence NUMERIC,
    ADD COLUMN IF NOT EXISTS triage_model TEXT,

    -- Contrato de proposta (proposal_draft já existe e guarda o corpo)
    ADD COLUMN IF NOT EXISTS proposal_summary TEXT,
    ADD COLUMN IF NOT EXISTS proposal_key_points TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS proposal_questions TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS proposal_estimated_days INT,
    ADD COLUMN IF NOT EXISTS proposal_suggested_price NUMERIC,
    ADD COLUMN IF NOT EXISTS proposal_currency TEXT,
    ADD COLUMN IF NOT EXISTS proposal_model TEXT;

UPDATE job_postings SET status = 'triaged' WHERE status = 'reviewing';

-- 'open' = cliente publicou sem definir faixa de orçamento, o que é diferente
-- de 'unknown' (não conseguimos ler o campo).
ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS job_postings_budget_type_check;
ALTER TABLE job_postings
    ADD CONSTRAINT job_postings_budget_type_check
    CHECK (budget_type IN ('fixed', 'hourly', 'open', 'unknown'));

-- A listagem é ordenada por score/recência no endpoint GET /jobs.
CREATE INDEX IF NOT EXISTS idx_job_postings_score_posted
    ON job_postings (score DESC NULLS LAST, posted_at DESC NULLS LAST);
