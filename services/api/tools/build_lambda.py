"""Builds the Lambda package: the locked runtime dependencies plus the service code.

    poetry run python -m tools.build_lambda          # writes dist/lambda/

Terraform zips that folder (infra/modules/api). Dependencies are installed as Linux arm64 wheels
for the Lambda runtime, pinned to the versions and hashes in poetry.lock, so the package matches
what the tests ran against. boto3 is not included: the Lambda runtime provides it.

pip evaluates environment markers for the machine it runs on, not for the target. That is fine
while no runtime dependency is Linux-only; CI builds on Linux in any case.
"""

import shutil
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any

SERVICE = Path(__file__).resolve().parent.parent
OUTPUT = SERVICE / "dist" / "lambda"
PACKAGE = "konvami_api"

# Must match the function's runtime and architecture in infra/modules/api.
PYTHON_VERSION = "3.12"
PLATFORM = "manylinux2014_aarch64"


def requirements(lock: dict[str, Any]) -> list[str]:
    """pip requirement lines, with hashes, for the packages of the `main` group."""
    lines = []
    for package in lock["package"]:
        if "main" not in package.get("groups", []):
            continue
        markers = package.get("markers")
        if isinstance(markers, dict):
            markers = markers.get("main")
        line = f"{package['name']}=={package['version']}"
        if markers:
            line += f" ; {markers}"
        hashes = " ".join(f"--hash={file['hash']}" for file in package["files"])
        lines.append(f"{line} {hashes}")
    return sorted(lines)


def build() -> None:
    shutil.rmtree(OUTPUT, ignore_errors=True)
    OUTPUT.mkdir(parents=True)
    pinned = OUTPUT.parent / "requirements.txt"
    with (SERVICE / "poetry.lock").open("rb") as lock:
        pinned.write_text("\n".join(requirements(tomllib.load(lock))) + "\n")

    subprocess.run(  # noqa: S603 - fixed arguments, no user input
        [
            sys.executable, "-m", "pip", "install",
            "--quiet", "--disable-pip-version-check",
            "--requirement", str(pinned), "--require-hashes", "--no-deps",
            "--only-binary", ":all:",
            "--platform", PLATFORM, "--implementation", "cp", "--python-version", PYTHON_VERSION,
            "--target", str(OUTPUT),
        ],
        check=True,
    )  # fmt: skip
    shutil.copytree(SERVICE / "src" / PACKAGE, OUTPUT / PACKAGE)
    # Byte-code caches and console scripts are not needed and would change the zip for no reason.
    for leftover in [*OUTPUT.rglob("__pycache__"), OUTPUT / "bin"]:
        shutil.rmtree(leftover, ignore_errors=True)


if __name__ == "__main__":
    build()
    print(f"Built {OUTPUT.relative_to(SERVICE)}")  # noqa: T201 - a command-line tool
