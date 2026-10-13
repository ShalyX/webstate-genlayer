# WebState production plan

## Product

WebState is for protocol operators, autonomous agents, and automation systems that need a shared answer to a changing public-web condition. The first release is deliberately narrow: one URL, one human-readable condition, one consensus-backed observation, and an inspectable public result.

## Why GenLayer is necessary

The contract must interpret live, unstructured page content. A conventional contract cannot render a page or decide whether its content satisfies a natural-language condition. WebState puts retrieval and interpretation inside the non-deterministic flow, while keeping the committed status, fingerprint, revision, and counters deterministic.

## Release slices

1. Contract slice: registration, ownership, activation, versioning, observation state, strict structured output parsing, source-failure handling, and direct adversarial tests.
2. StudioNet slice: deploy the contract and exercise true, false, unclear, source failure, stale revision, inactive watch, malformed model output, and refresh/reconnect paths.
3. Operator console: wallet connection, watch creation, evaluation submission, consensus progress, public readback, and clear recovery states.
4. Project hardening: rate limits at the UI boundary, bounded refresh polling, idempotent action guards, explicit network configuration, and deployment evidence.

## Safety boundaries

- Page content is untrusted evidence; prompts explicitly ignore embedded instructions.
- `source_failure` never becomes `true` or `false`.
- Only the watch owner can change the URL, condition, or active state.
- Updating a watch increments its revision and clears the prior observation.
- The client never displays a successful observation until it reads the committed contract state.
- The first release does not execute external side effects based on a watch. Consumers must read the committed result and enforce their own deterministic action rules.

## Acceptance bar

The contract must pass direct tests, compile/lint cleanly, and complete each live StudioNet path with an inspectable finalized result. The public app must be usable by a first-time operator without manually constructing calldata or guessing where a result came from.
