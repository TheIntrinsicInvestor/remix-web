import remixweb.inputs as inputs
from tests.remixweb.conftest import AUTH

def test_returns_metadata_for_valid_url(client, monkeypatch):
    monkeypatch.setattr(inputs, "youtube_metadata",
                        lambda url: {"title": "x", "channel": "c", "duration_sec": 120,
                                     "thumbnail": "t", "webpage_url": url})
    r = client.post("/youtube-metadata", json={"youtube_url": "http://yt/x"}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["title"] == "x"

def test_rejects_bad_url(client, monkeypatch):
    def boom(url):
        raise inputs.InputError("bad url")
    monkeypatch.setattr(inputs, "youtube_metadata", boom)
    r = client.post("/youtube-metadata", json={"youtube_url": "http://yt/bad"}, headers=AUTH)
    assert r.status_code == 400

def test_requires_auth(client):
    r = client.post("/youtube-metadata", json={"youtube_url": "http://yt/x"})
    assert r.status_code == 401
