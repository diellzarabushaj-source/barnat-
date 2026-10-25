# ICD description search: Groq reserve

Gemini remains the primary provider. After explicit per-query consent naming both recipients, anonymous ICD descriptions may go to Groq when Gemini reports quota/capacity failure or exceeds its bounded deadline. The server uses `openai/gpt-oss-120b` at Groq's fixed chat-completions endpoint, with strict JSON, low reasoning effort, a 1,800-token completion cap and a 15-second reserve deadline. The overall description deadline remains 45 seconds. No paid plan, additional dependency, database migration or prescription-provider change is included.

Activation requires server-only `GROQ_API_KEY` and `ICD_GROQ_FALLBACK_ENABLED=true`. Production alone is configured; Preview and Development do not receive the credential. The key is saved as a Vercel Secret. Its value is absent from source, tests, documentation and browser bundles. The frontend sends `groqFallback: true` only for the confirmed description action. Existing clients without that flag retain Gemini-only behavior; cache entries are separated by recipient consent as well as signed owner and classification.

Quota failures open a short, function-instance cooldown; no key rotation, repeated Groq attempts or paid-provider escalation occurs. `Retry-After` is bounded. Groq failures never expose remote response bodies. Authentication failures do not trigger a different recipient. Cached responses retain the actual provider label. Normal catalog search stays available without either provider.

Both providers pass through the same canonical WHO ICD-10 2019 validation, escaped explanation rendering and clinical safeguards. Results remain unconfirmed retrieval suggestions, with no automatic choice, definitive diagnosis, treatment advice or terminology/database write. Input privacy filtering is a guard rather than a comprehensive identifier detector; clinicians must anonymize descriptions before confirming transmission.

The free Groq plan has request and token limits, which may change. This feature improves availability but cannot promise unlimited use or diagnostic accuracy. No payment or upgrade was activated.

Validation covers quota/capacity fallback, cooldown, cancellation, authentication denial, explicit recipient consent, old-client isolation, strict schema, canonical codes, incomplete JSON, safe errors, owner/consent cache separation, accurate live/cache labels and phone/desktop layouts. Controlled fixtures verify software behavior; production provider results are recorded separately.

Official references: [Groq structured output](https://console.groq.com/docs/structured-outputs), [model](https://console.groq.com/docs/model/openai/gpt-oss-120b), [API](https://console.groq.com/docs/api-reference), [rate limits](https://console.groq.com/docs/rate-limits), [data handling](https://console.groq.com/docs/your-data).
