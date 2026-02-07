---
name: publish
description: Release a new version of Tele
disable-model-invocation: true
allowed-tools: Bash, Read, Edit
argument-hint: <version>
---

## Publish Tele v$1

1. Update `version` in `package.json` to `$1`
2. Commit: `git commit -am "v$1"`
3. Tag and push: `git tag v$1 && git push && git push origin v$1`
4. Wait for the Release GitHub Action to complete successfully
5. Download the DMG from the release and compute its SHA256: `curl -sL "https://github.com/saeedseyfi/tele/releases/download/v$1/Tele-$1-arm64.dmg" | shasum -a 256`
6. Update `../homebrew-tele/Casks/tele.rb`: set `version` to `$1` and `sha256` to the computed hash
7. Commit and push the homebrew-tele repo
