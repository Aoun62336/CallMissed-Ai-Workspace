import json

from app import config


def test_runtime_secret_values_load_from_aws(monkeypatch):
    class FakeSecretsManager:
        def get_secret_value(self, SecretId):
            assert SecretId == "callmissed-ai-workspace/runtime"

            return {
                "SecretString": json.dumps(
                    {
                        "CALLMISSED_API_KEY": "test-api-key",
                        "APP_SESSION_SECRET": "test-session-secret",
                        "REVIEWER_PASSCODE_HASH": "test-passcode-hash",
                    }
                )
            }

    monkeypatch.setenv(
        "AWS_SECRET_ID",
        "callmissed-ai-workspace/runtime",
    )

    monkeypatch.setattr(
        config.boto3,
        "client",
        lambda service_name: FakeSecretsManager(),
    )

    config._runtime_secret_values.cache_clear()

    try:
        values = config._runtime_secret_values()

        assert values["CALLMISSED_API_KEY"] == "test-api-key"
        assert values["APP_SESSION_SECRET"] == "test-session-secret"
        assert values["REVIEWER_PASSCODE_HASH"] == "test-passcode-hash"

    finally:
        config._runtime_secret_values.cache_clear()