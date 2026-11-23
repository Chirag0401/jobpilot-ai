import pytest
from ai_providers import generate_application_draft, _extract_response
from scout import ai_draft

JOB = {"company": "Acme", "title": "Platform Engineer", "description": "Kubernetes on AWS",
       "location": "Remote India", "match_reasons": "Kubernetes"}
CONFIG = {"profile": {"verified_experience": ["Kubernetes", "AWS"]}}

@pytest.mark.parametrize("provider,payload,expected", [
    ("OpenAI", {"output": [{"content": [{"type": "output_text", "text": "OpenAI response"}]}]}, "OpenAI response"),
    ("Claude", {"content": [{"type": "text", "text": "Claude response"}]}, "Claude response"),
    ("Gemini", {"candidates": [{"content": {"parts": [{"text": "Gemini response"}]}}]}, "Gemini response"),
])
def test_provider_response_parsing(provider, payload, expected):
    assert _extract_response(provider, payload) == expected

@pytest.mark.parametrize("provider,response,domain,key_name", [
    ("OpenAI", {"output_text": "hello"}, "api.openai.com", "Authorization"),
    ("Claude", {"content": [{"type": "text", "text": "hello"}]}, "api.anthropic.com", "x-api-key"),
    ("Gemini", {"candidates": [{"content": {"parts": [{"text": "hello"}]}}]}, "generativelanguage.googleapis.com", "x-goog-api-key"),
])
def test_provider_requests_are_sent_to_right_host(monkeypatch, provider, response, domain, key_name):
    captured = {}
    class FakeResponse:
        def raise_for_status(self): pass
        def json(self): return response
    def fake_post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return FakeResponse()
    monkeypatch.setattr("ai_providers.requests.post", fake_post)
    assert generate_application_draft(provider, JOB, CONFIG, api_key="TEST_NOT_REAL") == "hello"
    assert domain in captured["url"]
    assert "TEST_NOT_REAL" in captured["headers"][key_name]
    assert "TEST_NOT_REAL" not in str(captured["json"])
    assert "Kubernetes" in str(captured["json"])

def test_template_requires_no_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = ai_draft(JOB, CONFIG, provider="Template")
    assert "[" in result and "Acme" in result

def test_invalid_model_rejected(monkeypatch):
    with pytest.raises(ValueError, match="Invalid model ID"):
        generate_application_draft("Gemini", JOB, CONFIG, api_key="fake", model="bad/model")
