import pytest
import remixweb.inputs as inputs
from remixweb.inputs import resolve_spotify, InputError

def test_resolve_builds_query_and_returns_candidate(monkeypatch):
    monkeypatch.setattr(inputs, "_spotify_oembed_title",
                        lambda url: "Blinding Lights")
    monkeypatch.setattr(inputs, "youtube_search",
                        lambda q: {"title": "The Weeknd - Blinding Lights",
                                   "channel": "TheWeekndVEVO", "duration_sec": 200,
                                   "thumbnail": "t", "webpage_url": "http://yt/bl"})
    out = resolve_spotify("https://open.spotify.com/track/abc")
    assert out["query"] == "Blinding Lights"
    assert out["candidate"]["webpage_url"] == "http://yt/bl"

def test_resolve_raises_on_oembed_failure(monkeypatch):
    def boom(url): raise InputError("no oembed")
    monkeypatch.setattr(inputs, "_spotify_oembed_title", boom)
    with pytest.raises(InputError):
        resolve_spotify("https://open.spotify.com/track/abc")
