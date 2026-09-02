# PDA PostgreSQL QA fixture order

Use only a disposable PostgreSQL database with synthetic data.

1. Deploy migrations from commit `3b60b5d6a7ca9897a32e0f6e6c0245eef58463c4`.
2. Apply `pda-qa-aviat-prerequisite.sql`. This satisfies the documented
   precondition of historical migration `20260829020000`.
3. Deploy migrations from commit `4f9215bad5e6e7e376e11c4a5a7d10693bfe9552`.
4. Apply `pda-legacy-qa.sql`.
5. Deploy migrations from the current PR branch.
6. Run:

   ```sh
   TEST_DATABASE_URL="$QA_DATABASE_URL" \
   DATABASE_URL="$QA_DATABASE_URL" \
   NODE_ENV=test \
   DATABASE_ENVIRONMENT=qa \
   PRODUCTION_DATABASE_HOST=production.invalid \
   JWT_SECRET="$QA_ONLY_JWT_SECRET" \
   PDA_TOKEN_PEPPER="$QA_ONLY_PDA_PEPPER" \
   ENABLE_PDA_SCANNER_LAB=true \
   npm run test:pda:pg
   ```

`test:pda:pg` fails when `TEST_DATABASE_URL` is absent. The fixtures never add
products, inventory, movements, picking data, receipts, imports, tasks, or
production identifiers.
