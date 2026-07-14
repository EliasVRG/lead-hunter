# 🔁 System Sequence — Lead Hunter

## 📌 Fluxo principal

```text
1. Lead Input
   ↓
2. API receives request
   ↓
3. Lead pushed to Queue (Redis)
   ↓
4. Worker picks job
   ↓
5. Scraper runs:
      - metadata
      - technologies
      - performance
   ↓
6. AI Worker:
      - scoring
      - reasoning
      - classification
   ↓
7. Data persisted in PostgreSQL
   ↓
8. Dashboard consumes data