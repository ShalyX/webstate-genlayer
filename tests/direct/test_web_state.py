import json


CONTRACT = "contracts/web_state.py"
OWNER = "0x1111111111111111111111111111111111111111"
OTHER = "0x2222222222222222222222222222222222222222"
URL = "https://status.example.org"
CONDITION = "The page clearly says that the service is operational."


def deploy(direct_deploy):
    return direct_deploy(CONTRACT, sdk_version="v0.2.16")


def create_watch(contract, direct_vm, direct_alice, watch_id="status"):
    direct_vm.sender = direct_alice
    contract.create_watch(watch_id, URL, CONDITION)


def approval():
    return json.dumps({
        "state": "true",
        "summary": "The service is operational.",
        "rationale": "The page displays the operational status requested by the condition.",
    })


def test_create_watch_starts_unobserved(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    create_watch(contract, direct_vm, direct_alice)
    watch = contract.get_watch("status")
    assert watch["status"] == "unobserved"
    assert watch["revision"] == 1
    assert watch["active"] is True


def test_duplicate_watch_id_is_rejected(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    create_watch(contract, direct_vm, direct_alice)
    with direct_vm.expect_revert("Watch ID already exists"):
        contract.create_watch("status", URL, CONDITION)


def test_non_owner_cannot_update_watch(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    create_watch(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the watch owner may do this"):
        contract.update_watch("status", URL, "A different condition", True)


def test_consensus_evaluation_stores_true_state(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    create_watch(contract, direct_vm, direct_alice)
    direct_vm.mock_web(r"https://status\.example\.org", {"status": 200, "body": "Status: operational"})
    direct_vm.mock_llm(r"(?s).*service is operational.*", approval())
    direct_vm.sender = direct_alice
    contract.evaluate_watch("status")
    watch = contract.get_watch("status")
    assert watch["status"] == "true"
    assert watch["evaluation_count"] == 1
    assert len(watch["page_fingerprint"]) == 64


def test_source_failure_is_stored_and_not_claimed_true(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    create_watch(contract, direct_vm, direct_alice)
    direct_vm.mock_web(r"https://status\.example\.org", {"status": 503, "body": "offline"})
    direct_vm.sender = direct_alice
    contract.evaluate_watch("status")
    watch = contract.get_watch("status")
    assert watch["status"] == "source_failure"
    assert watch["page_fingerprint"] == "0" * 64


def test_inactive_watch_cannot_be_evaluated(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    create_watch(contract, direct_vm, direct_alice)
    contract.update_watch("status", URL, CONDITION, False)
    with direct_vm.expect_revert("Watch is inactive"):
        contract.evaluate_watch("status")


def test_observation_parser_rejects_extra_fields(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    with direct_vm.expect_revert("response must contain exactly"):
        contract._parse_observation({
            "state": "true",
            "summary": "ok",
            "rationale": "ok",
            "trusted": True,
        })

