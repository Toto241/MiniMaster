# Lint-Schuld im Produktionscode (`src/` + Root, ohne Tests)

> Auto-generiert aus `eslint . --ext .js,.ts`. Stand: nach Eingriff A (Test-Override) + B (safe autofixes).
> Testdateien sind bewusst ausgenommen (dort sind die `no-unsafe-*`/`object-injection`-Regeln abgeschaltet — siehe `.eslintrc.js`).
> **0 Errors** — alles hier sind `warn`-Level-Hinweise, kein CI-Blocker. Liste dient gezieltem Schuldenabbau.

## Gesamt: 649 Warnungen in 31 Dateien

### Nach Regel

| Anzahl | Regel |
|---:|---|
| 259 | `@typescript-eslint/prefer-nullish-coalescing` |
| 142 | `@typescript-eslint/no-unsafe-assignment` |
| 64 | `security/detect-object-injection` |
| 54 | `@typescript-eslint/no-unsafe-member-access` |
| 43 | `@typescript-eslint/no-non-null-assertion` |
| 22 | `max-len` |
| 15 | `@typescript-eslint/no-unsafe-argument` |
| 15 | `@typescript-eslint/no-explicit-any` |
| 12 | `@typescript-eslint/no-unsafe-call` |
| 9 | `@typescript-eslint/no-base-to-string` |
| 3 | `security/detect-unsafe-regex` |
| 3 | `@typescript-eslint/no-unsafe-return` |
| 3 | `@typescript-eslint/restrict-template-expressions` |
| 2 | `security/detect-non-literal-regexp` |
| 2 | `security/detect-non-literal-fs-filename` |
| 1 | `@typescript-eslint/require-await` |

### Nach Datei (absteigend)

| Warnungen | Datei |
|---:|---|
| 85 | `src/support.ts` |
| 68 | `src/subscription.ts` |
| 56 | `src/admin.ts` |
| 53 | `src/auth.ts` |
| 41 | `src/affiliate.ts` |
| 34 | `src/pairing.ts` |
| 33 | `src/ai-config-assistant.ts` |
| 33 | `src/b2b-licensing.ts` |
| 31 | `src/external-integrations.ts` |
| 28 | `src/shared.ts` |
| 28 | `src/triggers.ts` |
| 26 | `src/rate-limiter.ts` |
| 20 | `src/operator-setup.ts` |
| 19 | `src/legal.ts` |
| 17 | `src/pricing-config.ts` |
| 14 | `src/tasks.ts` |
| 11 | `src/secret-onboarding.ts` |
| 10 | `src/device.ts` |
| 6 | `src/services/decisioning-service.ts` |
| 5 | `src/admin-pin.ts` |
| 5 | `src/error-handler.ts` |
| 4 | `firebase.ts` |
| 4 | `src/acceptance.ts` |
| 4 | `start.js` |
| 3 | `src/resilience.ts` |
| 3 | `src/wizard-progress.ts` |
| 2 | `src/cutover-monitor.ts` |
| 2 | `src/tracing.ts` |
| 2 | `src/validation.ts` |
| 1 | `src/repositories/decisioning-repository.ts` |
| 1 | `src/validators/decisioning.ts` |

## Detail je Datei

### `src/support.ts` (85)

- `src/support.ts:96:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:151:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:152:15` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:167:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:168:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:169:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:208:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:220:10` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/support.ts:224:15` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:228:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:263:32` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:313:1` — **max-len** — This line has a length of 130. Maximum allowed is 120.
- `src/support.ts:353:10` — **security/detect-non-literal-fs-filename** — Found existsSync from package "fs" with non literal argument at index 0
- `src/support.ts:356:21` — **security/detect-non-literal-fs-filename** — Found readFileSync from package "fs" with non literal argument at index 0
- `src/support.ts:371:1` — **max-len** — This line has a length of 130. Maximum allowed is 120.
- `src/support.ts:401:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:477:1` — **max-len** — This line has a length of 121. Maximum allowed is 120.
- `src/support.ts:522:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:524:53` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/support.ts:529:20` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:567:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:569:62` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/support.ts:591:38` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:620:7` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:623:7` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:625:7` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:626:7` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:627:7` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:642:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:643:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:644:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:645:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:702:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:703:60` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:704:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:720:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:723:22` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:769:1` — **max-len** — This line has a length of 146. Maximum allowed is 120.
- `src/support.ts:823:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:848:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:849:75` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/support.ts:853:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:865:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:916:43` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string | undefined`.
- `src/support.ts:922:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:943:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:974:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:976:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:989:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1030:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1034:46` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1072:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1077:90` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1116:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1121:46` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1146:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1182:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1194:62` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1212:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1220:79` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1258:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1260:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1275:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1276:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1276:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1276:118` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1293:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1296:7` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:1366:22` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/support.ts:1379:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/support.ts:1380:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:1390:71` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/support.ts:1395:19` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/support.ts:1404:44` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .seconds on an `any` value.
- `src/support.ts:1405:56` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/support.ts:1410:60` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/support.ts:1419:19` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:1423:30` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:1425:7` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/support.ts:1425:23` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/support.ts:1425:23` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/support.ts:1425:40` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toDate on an `any` value.
- `src/support.ts:1425:52` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toISOString on an `any` value.
- `src/support.ts:1425:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1495:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.

### `src/subscription.ts` (68)

- `src/subscription.ts:97:22` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/subscription.ts:97:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:97:40` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/subscription.ts:103:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:104:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:104:33` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/subscription.ts:104:39` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .isPremium on an `any` value.
- `src/subscription.ts:104:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:120:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:121:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:124:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:125:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:187:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:187:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:188:34` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/subscription.ts:188:43` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:190:22` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .status on an `any` value.
- `src/subscription.ts:190:57` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .trialEndsAt on an `any` value.
- `src/subscription.ts:191:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:191:37` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .trialEndsAt on an `any` value.
- `src/subscription.ts:192:11` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/subscription.ts:192:24` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .trialEndsAt on an `any` value.
- `src/subscription.ts:193:24` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .trialEndsAt on an `any` value.
- `src/subscription.ts:200:5` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:200:42` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .parentAppLimit on an `any` value.
- `src/subscription.ts:200:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:201:5` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:201:38` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .childLimit on an `any` value.
- `src/subscription.ts:201:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:202:5` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:202:36` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .platform on an `any` value.
- `src/subscription.ts:202:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:203:5` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:203:49` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .originalTransactionId on an `any` value.
- `src/subscription.ts:203:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:204:5` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:204:41` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .expiresDateMs on an `any` value.
- `src/subscription.ts:204:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:237:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/subscription.ts:248:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:248:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:272:1` — **max-len** — This line has a length of 167. Maximum allowed is 120.
- `src/subscription.ts:275:84` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:359:27` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/subscription.ts:359:32` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .purchaseState on an `any` value.
- `src/subscription.ts:359:64` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/subscription.ts:359:69` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .expiryTimeMillis on an `any` value.
- `src/subscription.ts:365:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:366:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:367:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:368:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:369:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:534:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:574:15` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/subscription.ts:656:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:659:39` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string | null | undefined`.
- `src/subscription.ts:659:51` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/subscription.ts:659:57` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .data on an `any` value.
- `src/subscription.ts:783:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:783:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:784:14` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .purchaseToken on an `any` value.
- `src/subscription.ts:784:36` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .type on an `any` value.
- `src/subscription.ts:792:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:792:29` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .type on an `any` value.
- `src/subscription.ts:793:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/subscription.ts:793:20` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .purchaseToken on an `any` value.
- `src/subscription.ts:829:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:830:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/admin.ts` (56)

- `src/admin.ts:150:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:152:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:174:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:177:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:177:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:221:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:222:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:223:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:223:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:223:74` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:224:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:224:39` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:224:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:349:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:363:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:387:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:387:94` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:597:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:628:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:628:65` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:629:7` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??=`) instead of an assignment expression, as it is simpler to read.
- `src/admin.ts:629:12` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:630:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:630:87` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:630:120` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:630:142` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:632:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:667:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:58` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:88` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:120` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:165` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:681:1` — **max-len** — This line has a length of 126. Maximum allowed is 120.
- `src/admin.ts:697:1` — **max-len** — This line has a length of 135. Maximum allowed is 120.
- `src/admin.ts:735:79` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:735:95` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:753:16` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:753:32` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:753:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:754:21` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:754:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:754:74` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:755:21` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:755:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:755:64` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:756:20` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:756:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:855:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:856:11` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:856:35` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:856:56` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:882:10` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:888:31` — **security/detect-object-injection** — Function Call Object Injection Sink
- `src/admin.ts:893:11` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:894:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:895:14` — **security/detect-object-injection** — Generic Object Injection Sink

### `src/auth.ts` (53)

- `src/auth.ts:50:50` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:50:97` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:75:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:76:60` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:98:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:103:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:120:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:120:89` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:307:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:413:24` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:421:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:424:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/auth.ts:424:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:439:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:582:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:590:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:592:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/auth.ts:592:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:616:1` — **max-len** — This line has a length of 127. Maximum allowed is 120.
- `src/auth.ts:804:1` — **max-len** — This line has a length of 152. Maximum allowed is 120.
- `src/auth.ts:809:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:869:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:888:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1030:90` — **@typescript-eslint/require-await** — Async arrow function has no 'await' expression.
- `src/auth.ts:1040:11` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:1203:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1503:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/auth.ts:1516:81` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1528:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1561:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1597:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1602:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1628:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1673:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1674:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1684:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1801:32` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1805:7` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/auth.ts:1805:66` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toMillis on an `any` value.
- `src/auth.ts:1806:11` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/auth.ts:1806:29` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toMillis on an `any` value.
- `src/auth.ts:1843:40` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:1860:32` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:1881:37` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:1953:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/auth.ts:1953:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1954:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/auth.ts:1954:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1955:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/auth.ts:1955:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1957:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/auth.ts:1957:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:2022:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/affiliate.ts` (41)

- `src/affiliate.ts:76:30` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:93:43` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:93:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/affiliate.ts:114:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:122:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:123:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:170:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:191:1` — **max-len** — This line has a length of 129. Maximum allowed is 120.
- `src/affiliate.ts:209:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:224:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:236:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:282:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:294:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:295:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:296:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:297:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:298:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:299:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:300:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:304:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:305:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:306:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:307:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:308:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:308:22` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/affiliate.ts:308:42` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toMillis on an `any` value.
- `src/affiliate.ts:325:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:342:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:343:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:344:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:345:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:346:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:347:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:348:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:349:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:349:24` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/affiliate.ts:349:37` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toMillis on an `any` value.
- `src/affiliate.ts:384:15` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/affiliate.ts:384:56` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:389:67` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `number`.
- `src/affiliate.ts:398:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.

### `src/pairing.ts` (34)

- `src/pairing.ts:21:65` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:26:36` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .status on an `any` value.
- `src/pairing.ts:29:1` — **max-len** — This line has a length of 126. Maximum allowed is 120.
- `src/pairing.ts:30:33` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .status on an `any` value.
- `src/pairing.ts:34:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:35:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:148:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:180:23` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:180:69` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .status on an `any` value.
- `src/pairing.ts:180:76` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:188:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:188:52` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .childLimit on an `any` value.
- `src/pairing.ts:188:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:247:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:247:59` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .status on an `any` value.
- `src/pairing.ts:247:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:259:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:259:52` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .childLimit on an `any` value.
- `src/pairing.ts:259:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:260:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:260:56` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .parentAppLimit on an `any` value.
- `src/pairing.ts:260:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:283:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:284:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:325:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:355:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:355:52` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .childLimit on an `any` value.
- `src/pairing.ts:355:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:422:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:429:45` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/pairing.ts:440:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:457:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/pairing.ts:457:52` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .childLimit on an `any` value.
- `src/pairing.ts:457:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/ai-config-assistant.ts` (33)

- `src/ai-config-assistant.ts:25:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:55:17` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/ai-config-assistant.ts:56:59` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:61:49` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/ai-config-assistant.ts:62:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/ai-config-assistant.ts:64:19` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .project_id on an `any` value.
- `src/ai-config-assistant.ts:64:44` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/ai-config-assistant.ts:64:68` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .project_id on an `any` value.
- `src/ai-config-assistant.ts:65:19` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .storage_bucket on an `any` value.
- `src/ai-config-assistant.ts:65:48` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/ai-config-assistant.ts:65:76` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .storage_bucket on an `any` value.
- `src/ai-config-assistant.ts:66:19` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .project_number on an `any` value.
- `src/ai-config-assistant.ts:66:48` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/ai-config-assistant.ts:66:80` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .project_number on an `any` value.
- `src/ai-config-assistant.ts:67:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/ai-config-assistant.ts:69:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/ai-config-assistant.ts:69:26` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .client_info on an `any` value.
- `src/ai-config-assistant.ts:71:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/ai-config-assistant.ts:71:41` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .api_key on an `any` value.
- `src/ai-config-assistant.ts:71:59` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .api_key on an `any` value.
- `src/ai-config-assistant.ts:80:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:81:16` — **security/detect-non-literal-regexp** — Found non-literal argument to RegExp Constructor
- `src/ai-config-assistant.ts:83:17` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:96:27` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/ai-config-assistant.ts:98:5` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/ai-config-assistant.ts:104:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/ai-config-assistant.ts:156:76` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:156:92` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:189:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:193:14` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:193:36` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:193:51` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:193:72` — **security/detect-object-injection** — Generic Object Injection Sink

### `src/b2b-licensing.ts` (33)

- `src/b2b-licensing.ts:79:18` — **security/detect-non-literal-regexp** — Found non-literal argument to RegExp Constructor
- `src/b2b-licensing.ts:91:20` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/b2b-licensing.ts:110:21` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:112:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:114:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:115:27` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:118:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:123:27` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:132:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:186:26` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:194:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:194:89` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:228:25` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:229:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/b2b-licensing.ts:231:69` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/b2b-licensing.ts:240:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/b2b-licensing.ts:252:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:253:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/b2b-licensing.ts:320:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:338:63` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:455:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/b2b-licensing.ts:456:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/b2b-licensing.ts:457:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/b2b-licensing.ts:457:20` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/b2b-licensing.ts:457:38` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toMillis on an `any` value.
- `src/b2b-licensing.ts:460:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/b2b-licensing.ts:461:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/b2b-licensing.ts:462:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/b2b-licensing.ts:462:22` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/b2b-licensing.ts:462:42` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toMillis on an `any` value.
- `src/b2b-licensing.ts:481:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:502:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:527:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/external-integrations.ts` (31)

- `src/external-integrations.ts:165:21` — **security/detect-unsafe-regex** — Unsafe Regular Expression
- `src/external-integrations.ts:247:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:250:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:251:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:252:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:254:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:255:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:304:5` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/external-integrations.ts:306:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/external-integrations.ts:308:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/external-integrations.ts:384:41` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:384:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:387:38` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:387:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:393:47` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:393:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:402:38` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:402:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:405:39` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:405:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:411:47` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:411:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:427:47` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:427:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:430:24` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:430:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:456:77` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:459:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:505:75` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/external-integrations.ts:506:22` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/external-integrations.ts:509:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/shared.ts` (28)

- `src/shared.ts:37:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/shared.ts:44:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/shared.ts:72:22` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/shared.ts:81:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/shared.ts:182:32` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:187:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:196:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:267:30` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/shared.ts:284:30` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/shared.ts:291:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/shared.ts:291:31` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/shared.ts:294:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/shared.ts:294:39` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/shared.ts:303:52` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/shared.ts:319:30` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/shared.ts:334:30` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/shared.ts:337:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:348:30` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/shared.ts:365:37` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/shared.ts:422:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/shared.ts:425:20` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .status on an `any` value.
- `src/shared.ts:427:20` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .status on an `any` value.
- `src/shared.ts:427:55` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .trialEndsAt on an `any` value.
- `src/shared.ts:428:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/shared.ts:428:35` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .trialEndsAt on an `any` value.
- `src/shared.ts:429:9` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/shared.ts:429:22` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .trialEndsAt on an `any` value.
- `src/shared.ts:430:22` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .trialEndsAt on an `any` value.

### `src/triggers.ts` (28)

- `src/triggers.ts:22:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/triggers.ts:22:21` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/triggers.ts:26:5` — **@typescript-eslint/no-unsafe-return** — Unsafe return of a value of type `any`.
- `src/triggers.ts:65:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/triggers.ts:74:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of type `any[]` to a variable of type `string[]`.
- `src/triggers.ts:74:73` — **@typescript-eslint/no-unsafe-assignment** — Unsafe spread of an `any` value in an array.
- `src/triggers.ts:75:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of type `any[]` to a variable of type `string[]`.
- `src/triggers.ts:75:73` — **@typescript-eslint/no-unsafe-assignment** — Unsafe spread of an `any` value in an array.
- `src/triggers.ts:105:89` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:108:83` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:155:31` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/triggers.ts:165:55` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/triggers.ts:165:73` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/triggers.ts:165:93` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:199:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:220:65` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:221:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/triggers.ts:267:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:294:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/triggers.ts:300:62` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/triggers.ts:301:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/triggers.ts:309:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/triggers.ts:312:76` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:334:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/triggers.ts:343:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:344:46` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:347:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/triggers.ts:355:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.

### `src/rate-limiter.ts` (26)

- `src/rate-limiter.ts:95:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/rate-limiter.ts:95:27` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/rate-limiter.ts:95:46` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toMillis on an `any` value.
- `src/rate-limiter.ts:95:59` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:95:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:96:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/rate-limiter.ts:96:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:97:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/rate-limiter.ts:97:28` — **@typescript-eslint/no-unsafe-call** — Unsafe call of a(n) `any` typed value.
- `src/rate-limiter.ts:97:48` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .toMillis on an `any` value.
- `src/rate-limiter.ts:97:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:97:83` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:101:48` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/rate-limiter.ts:121:58` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:130:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/rate-limiter.ts:137:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/rate-limiter.ts:172:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:214:1` — **max-len** — This line has a length of 124. Maximum allowed is 120.
- `src/rate-limiter.ts:214:25` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/rate-limiter.ts:214:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:214:92` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:216:23` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:304:24` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/rate-limiter.ts:305:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/rate-limiter.ts:305:33` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/rate-limiter.ts:305:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/operator-setup.ts` (20)

- `src/operator-setup.ts:69:1` — **max-len** — This line has a length of 154. Maximum allowed is 120.
- `src/operator-setup.ts:73:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:74:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:75:1` — **max-len** — This line has a length of 121. Maximum allowed is 120.
- `src/operator-setup.ts:79:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/operator-setup.ts:104:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/operator-setup.ts:105:5` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:106:5` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:107:13` — **@typescript-eslint/no-unsafe-return** — Unsafe return of a value of type `any`.
- `src/operator-setup.ts:107:59` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:107:68` — **@typescript-eslint/no-unsafe-member-access** — Unsafe member access .projectId on an `any` value.
- `src/operator-setup.ts:107:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:147:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/operator-setup.ts:149:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/operator-setup.ts:155:50` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:164:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:165:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:166:38` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:189:5` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/operator-setup.ts:233:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/legal.ts` (19)

- `src/legal.ts:29:67` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:88:93` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:98:3` — **@typescript-eslint/no-unsafe-return** — Unsafe return of a value of type `any`.
- `src/legal.ts:98:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:117:8` — **security/detect-unsafe-regex** — Unsafe Regular Expression
- `src/legal.ts:147:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/legal.ts:148:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/legal.ts:149:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/legal.ts:150:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/legal.ts:151:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/legal.ts:162:5` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/legal.ts:174:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/legal.ts:193:35` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/legal.ts:207:33` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/legal.ts:214:1` — **max-len** — This line has a length of 133. Maximum allowed is 120.
- `src/legal.ts:285:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:401:1` — **max-len** — This line has a length of 131. Maximum allowed is 120.
- `src/legal.ts:430:38` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:456:1` — **max-len** — This line has a length of 121. Maximum allowed is 120.

### `src/pricing-config.ts` (17)

- `src/pricing-config.ts:237:10` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:237:25` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pricing-config.ts:237:28` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:347:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pricing-config.ts:367:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:367:34` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:367:47` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:377:5` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:377:26` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/pricing-config.ts:377:26` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:377:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:381:5` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:381:26` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/pricing-config.ts:381:26` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:381:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:501:77` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pricing-config.ts:504:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/tasks.ts` (14)

- `src/tasks.ts:116:23` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/tasks.ts:116:30` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/tasks.ts:116:52` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tasks.ts:125:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tasks.ts:172:1` — **max-len** — This line has a length of 135. Maximum allowed is 120.
- `src/tasks.ts:278:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/tasks.ts:279:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/tasks.ts:280:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/tasks.ts:281:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/tasks.ts:283:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/tasks.ts:285:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/tasks.ts:319:42` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/tasks.ts:476:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tasks.ts:479:103` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/secret-onboarding.ts` (11)

- `src/secret-onboarding.ts:90:52` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:93:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:173:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:174:24` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/secret-onboarding.ts:208:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:221:27` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:226:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:256:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/secret-onboarding.ts:256:28` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/secret-onboarding.ts:277:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:277:72` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/device.ts` (10)

- `src/device.ts:210:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/device.ts:210:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/device.ts:211:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/device.ts:211:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/device.ts:212:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/device.ts:212:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/device.ts:389:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/device.ts:400:62` — **@typescript-eslint/no-unsafe-argument** — Unsafe argument of type `any` assigned to a parameter of type `string`.
- `src/device.ts:401:13` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/device.ts:404:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.

### `src/services/decisioning-service.ts` (6)

- `src/services/decisioning-service.ts:104:62` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/services/decisioning-service.ts:115:27` — **@typescript-eslint/restrict-template-expressions** — Invalid type "never" of template literal expression.
- `src/services/decisioning-service.ts:116:1` — **max-len** — This line has a length of 181. Maximum allowed is 120.
- `src/services/decisioning-service.ts:116:62` — **@typescript-eslint/restrict-template-expressions** — Invalid type "never" of template literal expression.
- `src/services/decisioning-service.ts:117:56` — **@typescript-eslint/restrict-template-expressions** — Invalid type "never" of template literal expression.
- `src/services/decisioning-service.ts:129:1` — **max-len** — This line has a length of 166. Maximum allowed is 120.

### `src/admin-pin.ts` (5)

- `src/admin-pin.ts:36:16` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/admin-pin.ts:37:23` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/admin-pin.ts:48:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/admin-pin.ts:70:9` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/admin-pin.ts:105:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/error-handler.ts` (5)

- `src/error-handler.ts:114:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/error-handler.ts:143:10` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/error-handler.ts:164:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/error-handler.ts:165:5` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/error-handler.ts:165:58` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `firebase.ts` (4)

- `firebase.ts:17:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `firebase.ts:23:10` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `firebase.ts:66:11` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `firebase.ts:67:27` — **@typescript-eslint/no-unsafe-call** — Unsafe construction of a(n) `any` typed value.

### `src/acceptance.ts` (4)

- `src/acceptance.ts:23:1` — **max-len** — This line has a length of 134. Maximum allowed is 120.
- `src/acceptance.ts:49:15` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/acceptance.ts:120:5` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/acceptance.ts:158:15` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.

### `start.js` (4)

- `start.js:115:60` — **security/detect-object-injection** — Function Call Object Injection Sink
- `start.js:127:29` — **security/detect-object-injection** — Generic Object Injection Sink
- `start.js:127:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `start.js:174:5` — **security/detect-object-injection** — Generic Object Injection Sink

### `src/resilience.ts` (3)

- `src/resilience.ts:157:10` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/resilience.ts:185:59` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/resilience.ts:289:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/wizard-progress.ts` (3)

- `src/wizard-progress.ts:112:97` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/wizard-progress.ts:214:97` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/wizard-progress.ts:217:46` — **security/detect-object-injection** — Function Call Object Injection Sink

### `src/cutover-monitor.ts` (2)

- `src/cutover-monitor.ts:56:21` — **@typescript-eslint/no-unsafe-assignment** — Unsafe assignment of an `any` value.
- `src/cutover-monitor.ts:85:33` — **security/detect-object-injection** — Generic Object Injection Sink

### `src/tracing.ts` (2)

- `src/tracing.ts:50:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tracing.ts:105:1` — **max-len** — This line has a length of 121. Maximum allowed is 120.

### `src/validation.ts` (2)

- `src/validation.ts:48:16` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/validation.ts:311:14` — **security/detect-unsafe-regex** — Unsafe Regular Expression

### `src/repositories/decisioning-repository.ts` (1)

- `src/repositories/decisioning-repository.ts:89:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/validators/decisioning.ts` (1)

- `src/validators/decisioning.ts:39:100` — **@typescript-eslint/no-base-to-string** — 'value ?? ""' will use Object's default stringification format ('[object Object]') when stringified.
