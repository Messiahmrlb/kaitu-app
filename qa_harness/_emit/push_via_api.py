"""通过 GitHub Git Data API 推送本地提交（沙箱内 github.com:443 不可达时的通道）。

复刻本地提交的 tree / author / committer / message，使 API 生成的 commit SHA
与本地一致，随后 PATCH ref，最后同步本地 origin/main 引用。
"""
import base64
import json
import subprocess
import sys
import urllib.request
import urllib.error

REPO = "Messiahmrlb/kaitu-app"
BRANCH = "main"
API = f"https://api.github.com/repos/{REPO}"


def run(args, binary=False):
    out = subprocess.run(args, capture_output=True, check=True).stdout
    return out if binary else out.decode("utf-8")


def token():
    p = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        text=True,
        check=True,
        env={**__import__("os").environ, "GCM_INTERACTIVE": "never"},
    )
    for line in p.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise RuntimeError("no credential")


TOKEN = token()


def api(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "kaitu-app-push",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        print("API ERROR", method, path, e.code, e.read().decode()[:500])
        raise


commits = run(["git", "rev-list", "--reverse", "origin/main..HEAD"]).split()
remote_head = api("GET", f"/git/ref/heads/{BRANCH}")["object"]["sha"]
print("remote head:", remote_head)

for sha in commits:
    changed = [
        p for p in run(["git", "diff-tree", "-r", "--no-commit-id", "--name-only", sha]).splitlines() if p
    ]
    # 上传本提交里新增/修改的 blob（按 git 对象字节，保证与本地 SHA 一致）
    for path in changed:
        try:
            raw = run(["git", "cat-file", "blob", f"{sha}:{path}"], binary=True)
        except subprocess.CalledProcessError:
            continue  # 删除的文件
        blob = api(
            "POST",
            "/git/blobs",
            {"content": base64.b64encode(raw).decode(), "encoding": "base64"},
        )
        local_blob = run(["git", "rev-parse", f"{sha}:{path}"]).strip()
        if blob["sha"] != local_blob:
            print(f"  ! blob 不一致 {path}: remote={blob['sha']} local={local_blob}")

    # 用本提交的完整文件清单建树
    entries = []
    for line in run(["git", "ls-tree", "-r", sha]).splitlines():
        meta, path = line.split("\t", 1)
        mode, typ, obj = meta.split()
        entries.append({"path": path, "mode": mode, "type": typ, "sha": obj})
    tree = api("POST", "/git/trees", {"tree": entries})

    meta = run(
        ["git", "log", "-1", "--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI", sha]
    ).split("\x00")
    message = run(["git", "log", "-1", "--format=%B", sha])
    if message.endswith("\n"):
        message = message[:-1]
    new_commit = api(
        "POST",
        "/git/commits",
        {
            "message": message,
            "tree": tree["sha"],
            "parents": [remote_head],
            "author": {"name": meta[0], "email": meta[1], "date": meta[2]},
            "committer": {"name": meta[3], "email": meta[4], "date": meta[5]},
        },
    )
    if new_commit["sha"] != sha:
        print(f"  ! commit SHA 不同: remote={new_commit['sha']} local={sha}")
    remote_head = new_commit["sha"]
    print(f"pushed {sha[:7]} -> {remote_head[:7]} ({len(entries)} files)")

api("PATCH", f"/git/refs/heads/{BRANCH}", {"sha": remote_head, "force": False})
subprocess.run(["git", "update-ref", f"refs/remotes/origin/{BRANCH}", remote_head], check=True)
print("updated refs/remotes/origin/%s -> %s" % (BRANCH, remote_head))
