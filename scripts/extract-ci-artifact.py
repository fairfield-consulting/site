"""Extract CI artifacts as bounded regular data; never restore archive permissions/links."""

import pathlib
import stat
import sys
import zipfile


def extract(archive, destination, kind):
    root = pathlib.Path(destination)
    if kind not in ("assets", "review") or not root.is_absolute() or root.is_symlink():
        raise ValueError("Invalid data boundary")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.resolve() != root or any(root.iterdir()):
        raise ValueError("Data directory must be empty and have no symlink ancestors")
    total = 0
    seen = set()
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        if not entries or len(entries) > 25000:
            raise ValueError("Archive entry count exceeds the static limit")
        files = 0
        for entry in entries:
            name = entry.filename
            parts = pathlib.PurePosixPath(name).parts
            if not parts or name.startswith("/") or "\\" in name or any(c in name for c in "\r\n\x00") or any(p in ("", ".", "..") for p in parts):
                raise ValueError("Unsafe archive path")
            canonical = "/".join(parts) + ("/" if entry.is_dir() else "")
            if canonical != name or name in seen or entry.flag_bits & 1:
                raise ValueError("Noncanonical, duplicate or encrypted entry")
            seen.add(name)
            mode = stat.S_IFMT(entry.external_attr >> 16)
            if mode not in (0, stat.S_IFDIR, stat.S_IFREG) or (mode == stat.S_IFDIR and not entry.is_dir()):
                raise ValueError("Links and special files are forbidden")
            if any(p.startswith(".") for p in parts) and not (parts == (".assetsignore",) and not entry.is_dir() and kind == "assets"):
                raise ValueError("Unexpected hidden data")
            if kind == "review" and name != "review.json":
                raise ValueError("Review archive must contain only review.json")
            limit = 64 * 1024 if kind == "review" else 25 * 1024 * 1024
            if entry.file_size > limit:
                raise ValueError("Entry exceeds the data limit")
            target = root.joinpath(*parts)
            if entry.is_dir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
                continue
            files += 1
            if files > (1 if kind == "review" else 20000):
                raise ValueError("File count exceeds the native limit")
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            size = 0
            with bundle.open(entry) as source, target.open("xb") as output:
                while chunk := source.read(65536):
                    size += len(chunk)
                    total += len(chunk)
                    if size > limit or total > (64 * 1024 if kind == "review" else 200 * 1024 * 1024):
                        raise ValueError("Inflated data exceeds the limit")
                    output.write(chunk)
            if size != entry.file_size:
                raise ValueError("Entry size mismatch")
    if not (root / ("review.json" if kind == "review" else "index.html")).is_file():
        raise ValueError("Required root document is absent")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 4:
            raise ValueError("Expected archive, destination and data kind")
        extract(*sys.argv[1:])
    except Exception:
        print("CI artifact rejected by the regular-data boundary.", file=sys.stderr)
        sys.exit(1)
