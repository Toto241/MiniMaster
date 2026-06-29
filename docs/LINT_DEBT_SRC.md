# Lint-Schuld im Produktionscode (`src/` + Root, ohne Tests)

> Auto-generiert aus `eslint . --ext .js,.ts`. Stand: nach Eingriff A (Test-Override) + B (safe autofixes).
> Testdateien sind bewusst ausgenommen (dort sind die `no-unsafe-*`/`object-injection`-Regeln abgeschaltet — siehe `.eslintrc.js`).
> **0 Errors** — alles hier sind `warn`-Level-Hinweise, kein CI-Blocker. Liste dient gezieltem Schuldenabbau.

## Gesamt: 263 Warnungen in 27 Dateien

### Nach Regel

| Anzahl | Regel |
|---:|---|
| 216 | `@typescript-eslint/prefer-nullish-coalescing` |
| 30 | `@typescript-eslint/no-non-null-assertion` |
| 9 | `@typescript-eslint/no-base-to-string` |
| 6 | `max-len` |
| 1 | `@typescript-eslint/no-unnecessary-type-assertion` |
| 1 | `@typescript-eslint/require-await` |

### Nach Datei (absteigend)

| Warnungen | Datei |
|---:|---|
| 36 | `src/admin.ts` |
| 34 | `src/support.ts` |
| 27 | `src/auth.ts` |
| 21 | `src/external-integrations.ts` |
| 21 | `src/subscription.ts` |
| 16 | `src/b2b-licensing.ts` |
| 12 | `src/pairing.ts` |
| 12 | `src/rate-limiter.ts` |
| 11 | `src/affiliate.ts` |
| 9 | `src/operator-setup.ts` |
| 9 | `src/secret-onboarding.ts` |
| 8 | `src/triggers.ts` |
| 7 | `src/legal.ts` |
| 6 | `src/tasks.ts` |
| 5 | `src/pricing-config.ts` |
| 4 | `src/ai-config-assistant.ts` |
| 4 | `src/error-handler.ts` |
| 4 | `src/shared.ts` |
| 3 | `firebase.ts` |
| 3 | `src/acceptance.ts` |
| 3 | `src/services/decisioning-service.ts` |
| 2 | `src/admin-pin.ts` |
| 2 | `src/resilience.ts` |
| 1 | `src/device.ts` |
| 1 | `src/repositories/decisioning-repository.ts` |
| 1 | `src/tracing.ts` |
| 1 | `src/validators/decisioning.ts` |

## Detail je Datei

### `src/admin.ts` (36)

- `src/admin.ts:174:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:177:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:177:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:221:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:222:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:223:74` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:224:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:349:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:363:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:387:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:387:94` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:597:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:628:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:628:65` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:629:7` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??=`) instead of an assignment expression, as it is simpler to read.
- `src/admin.ts:630:87` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:630:120` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:630:142` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:667:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:58` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:88` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:120` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:165` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:681:1` — **max-len** — This line has a length of 126. Maximum allowed is 120.
- `src/admin.ts:697:1` — **max-len** — This line has a length of 135. Maximum allowed is 120.
- `src/admin.ts:735:79` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:735:95` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:753:32` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:753:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:754:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:754:74` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:755:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:755:64` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:756:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:855:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:856:56` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/support.ts` (34)

- `src/support.ts:154:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:209:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:210:15` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:225:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:226:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:227:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:266:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:282:15` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:286:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:371:1` — **max-len** — This line has a length of 130. Maximum allowed is 120.
- `src/support.ts:464:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:768:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:769:60` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:770:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:786:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:789:22` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:835:1` — **max-len** — This line has a length of 146. Maximum allowed is 120.
- `src/support.ts:889:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:988:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1009:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1042:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1055:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1100:46` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1143:90` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1187:46` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1212:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1260:62` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1286:79` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1326:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1342:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1342:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1342:118` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1359:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1491:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/auth.ts` (27)

- `src/auth.ts:76:50` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:76:97` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:101:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:102:60` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:124:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:129:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:146:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:146:89` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:439:24` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:450:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:465:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:608:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:618:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:844:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:904:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:923:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1065:90` — **@typescript-eslint/require-await** — Async arrow function has no 'await' expression.
- `src/auth.ts:1239:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1597:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1709:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1710:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1720:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1991:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1992:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1993:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1995:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:2060:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/external-integrations.ts` (21)

- `src/external-integrations.ts:385:41` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:385:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:388:38` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:388:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:394:47` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:394:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:403:38` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:403:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:406:39` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:406:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:412:47` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:412:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:428:47` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:428:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:431:24` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:431:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:457:77` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:460:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:506:75` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/external-integrations.ts:507:22` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/external-integrations.ts:510:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/subscription.ts` (21)

- `src/subscription.ts:135:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:141:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:142:81` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:162:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:163:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:225:68` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:238:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:239:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:240:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:241:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:242:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:287:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:317:84` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:414:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:415:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:416:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:417:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:418:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:705:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:878:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:879:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/b2b-licensing.ts` (16)

- `src/b2b-licensing.ts:128:21` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:130:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:132:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:133:27` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:136:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:141:27` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:150:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:204:26` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:212:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:212:89` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:246:25` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:338:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:356:63` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:505:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:526:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:551:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/pairing.ts` (12)

- `src/pairing.ts:21:65` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:162:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:194:76` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:202:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:261:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:273:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:274:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:339:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:369:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:436:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:454:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:471:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/rate-limiter.ts` (12)

- `src/rate-limiter.ts:107:59` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:107:104` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:108:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:109:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:109:107` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:133:58` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:184:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:226:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:227:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:229:23` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:317:24` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/rate-limiter.ts:318:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/affiliate.ts` (11)

- `src/affiliate.ts:112:30` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:129:43` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:150:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:158:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:159:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:206:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:248:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:263:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:321:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:364:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:423:56` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/operator-setup.ts` (9)

- `src/operator-setup.ts:110:5` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:111:5` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:113:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:114:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:162:50` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:171:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:172:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:173:38` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:240:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/secret-onboarding.ts` (9)

- `src/secret-onboarding.ts:90:52` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:93:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:173:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:208:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:221:27` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:226:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:256:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/secret-onboarding.ts:277:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:277:72` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/triggers.ts` (8)

- `src/triggers.ts:186:93` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:220:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:241:65` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:242:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/triggers.ts:288:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:333:76` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:364:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:365:46` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/legal.ts` (7)

- `src/legal.ts:40:67` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:99:93` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:110:15` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:187:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/legal.ts:206:35` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/legal.ts:220:33` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/legal.ts:448:38` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/tasks.ts` (6)

- `src/tasks.ts:144:23` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/tasks.ts:144:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tasks.ts:153:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tasks.ts:347:42` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/tasks.ts:504:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tasks.ts:507:103` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/pricing-config.ts` (5)

- `src/pricing-config.ts:237:25` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pricing-config.ts:377:26` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/pricing-config.ts:381:26` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/pricing-config.ts:501:77` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pricing-config.ts:504:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/ai-config-assistant.ts` (4)

- `src/ai-config-assistant.ts:25:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:177:76` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:177:92` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:210:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/error-handler.ts` (4)

- `src/error-handler.ts:118:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/error-handler.ts:147:10` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/error-handler.ts:168:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/error-handler.ts:169:91` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/shared.ts` (4)

- `src/shared.ts:196:32` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:201:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:210:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:351:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `firebase.ts` (3)

- `firebase.ts:17:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `firebase.ts:23:10` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `firebase.ts:67:27` — **@typescript-eslint/no-unnecessary-type-assertion** — This assertion is unnecessary since it does not change the type of the expression.

### `src/acceptance.ts` (3)

- `src/acceptance.ts:56:15` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/acceptance.ts:127:5` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/acceptance.ts:165:15` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.

### `src/services/decisioning-service.ts` (3)

- `src/services/decisioning-service.ts:104:62` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/services/decisioning-service.ts:117:1` — **max-len** — This line has a length of 177. Maximum allowed is 120.
- `src/services/decisioning-service.ts:130:1` — **max-len** — This line has a length of 166. Maximum allowed is 120.

### `src/admin-pin.ts` (2)

- `src/admin-pin.ts:43:16` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/admin-pin.ts:44:23` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.

### `src/resilience.ts` (2)

- `src/resilience.ts:188:59` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/resilience.ts:292:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/device.ts` (1)

- `src/device.ts:224:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/repositories/decisioning-repository.ts` (1)

- `src/repositories/decisioning-repository.ts:89:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/tracing.ts` (1)

- `src/tracing.ts:50:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/validators/decisioning.ts` (1)

- `src/validators/decisioning.ts:39:100` — **@typescript-eslint/no-base-to-string** — 'value ?? ""' will use Object's default stringification format ('[object Object]') when stringified.
