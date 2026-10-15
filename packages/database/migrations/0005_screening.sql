-- Filtro determinístico de vaga morta, aplicado antes da IA (fase 12).
--
-- A vaga cortada é gravada em vez de ignorada: sem registro não há como
-- auditar se o filtro está cortando demais, e ela seria redescoberta e
-- reavaliada a cada rodada da descoberta.

ALTER TABLE job_postings
    ADD COLUMN IF NOT EXISTS dismissed_reason TEXT;

-- A descoberta roda a cada poucos minutos e consulta prazo e concorrência em
-- toda vaga que volta na listagem.
CREATE INDEX IF NOT EXISTS idx_job_postings_expires_at
    ON job_postings (expires_at)
    WHERE expires_at IS NOT NULL;
