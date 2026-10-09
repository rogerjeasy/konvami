from tools.build_lambda import requirements

LOCK = {
    "package": [
        {
            "name": "fastapi",
            "version": "0.142.2",
            "groups": ["main"],
            "files": [
                {"file": "fastapi-0.142.2-py3-none-any.whl", "hash": "sha256:aaa"},
                {"file": "fastapi-0.142.2.tar.gz", "hash": "sha256:bbb"},
            ],
        },
        {
            "name": "anyio",
            "version": "4.15.1",
            "groups": ["main", "dev"],
            "files": [{"file": "anyio-4.15.1-py3-none-any.whl", "hash": "sha256:ccc"}],
        },
        {
            "name": "pytest",
            "version": "9.1.1",
            "groups": ["dev"],
            "files": [{"file": "pytest-9.1.1-py3-none-any.whl", "hash": "sha256:ddd"}],
        },
        {
            "name": "colorama",
            "version": "0.4.6",
            "groups": ["main"],
            "markers": 'sys_platform == "win32"',
            "files": [{"file": "colorama-0.4.6-py2.py3-none-any.whl", "hash": "sha256:eee"}],
        },
    ]
}


def test_the_lambda_gets_exactly_the_locked_runtime_packages_with_their_hashes() -> None:
    assert requirements(LOCK) == [
        "anyio==4.15.1 --hash=sha256:ccc",
        'colorama==0.4.6 ; sys_platform == "win32" --hash=sha256:eee',
        "fastapi==0.142.2 --hash=sha256:aaa --hash=sha256:bbb",
    ]
