# WebState

WebState is a GenLayer Intelligent Contract primitive for consensus-backed observations of changing public web state.

An operator registers a URL and a precise condition such as “the status page clearly says the service is operational.” When evaluated, validators independently render the page, ignore instructions contained in the page, and reach consensus on a structured result: `true`, `false`, `unclear`, or `source_failure`. The contract stores the result, page fingerprint, explanation, and evaluation count.

This is intentionally not a generic fact checker. It is a small, auditable state machine for agents and protocols that need to know whether a public web condition is currently satisfied before taking an action elsewhere.

## Contract surface

- `create_watch(watch_id, url, condition)` registers a source and condition.
- `update_watch(watch_id, url, condition, active)` rotates the watch revision or deactivates it.
- `evaluate_watch(watch_id)` runs the non-deterministic render-and-consensus flow.
- `get_watch(watch_id)` returns the latest committed observation.
- `get_watch_ids()` enumerates registered watches.

## Local verification

```powershell
python -m pip install -r requirements.txt
python -m pytest -p no:cacheprovider tests/direct -q
```

The production build will add StudioNet integration tests and an operator console with wallet signing, refresh/reconnect recovery, source failure visibility, and public observation pages.

