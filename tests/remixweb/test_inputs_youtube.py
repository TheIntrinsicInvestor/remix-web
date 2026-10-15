import pytest
import remixweb.inputs as inputs
from remixweb.inputs import from_youtube, InputError

def test_rejects_long_video_before_download(tmp_path, monkeypatch):
    monkeypatch.setattr(inputs, "youtube_metadata",
                        lambda url: {"title": "x", "channel": "c",
                                     "duration_sec": 9 * 60, "thumbnail": "",
                                     "webpage_url": url})
    called = {"dl": False}
    monkeypatch.setattr(inputs, "_youtube_download",
                        lambda url, d: called.__setitem__("dl", True))
    with pytest.raises(InputError):
        from_youtube("http://yt/x", tmp_path)
    assert called["dl"] is False  # never downloaded

def test_downloads_when_short(tmp_path, monkeypatch):
    monkeypatch.setattr(inputs, "youtube_metadata",
                        lambda url: {"title": "x", "channel": "c",
                                     "duration_sec": 120, "thumbnail": "",
                                     "webpage_url": url})
    marker = tmp_path / "input.wav"
    monkeypatch.setattr(inputs, "_youtube_download",
                        lambda url, d: marker.write_bytes(b"RIFF"))
    out = from_youtube("http://yt/x", tmp_path)
    assert out == marker and out.exists()
