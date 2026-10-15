-- Dimensões excluídas do score por falta de dado na vaga.
--
-- Sem esta coluna a explicação mente: um score de 72 calculado sobre três
-- dimensões não é comparável a 72 sobre quatro, e não havia como distinguir os
-- dois olhando a linha.
--
-- Motivação concreta: no 99Freelas praticamente todo projeto é publicado com
-- orçamento "Aberto", então `rate_fit` quase sempre entra aqui.

ALTER TABLE job_postings
    ADD COLUMN IF NOT EXISTS unassessed_dimensions TEXT[] DEFAULT '{}';
