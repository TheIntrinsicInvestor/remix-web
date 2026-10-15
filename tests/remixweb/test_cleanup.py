import os, time
from remixweb.cleanup import purge_old

def test_purges_only_old(tmp_path):
    old = tmp_path / "old"; old.mkdir(); (old / "f").write_text("x")
    new = tmp_path / "new"; new.mkdir(); (new / "f").write_text("x")
    past = time.time() - 26 * 3600
    os.utime(old, (past, past))
    deleted = purge_old(tmp_path, 24)
    assert "old" in deleted and "new" not in deleted
    assert not old.exists() and new.exists()
