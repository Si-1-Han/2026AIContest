#!/usr/bin/env python3
"""관리자 계정 파일(admins.json)에 계정을 추가합니다. 표준 라이브러리만 씁니다.

EC2에서:   python3 make_admin.py /opt/hansei-campus/private/admins.json <아이디>
           (비밀번호는 화면에 표시되지 않게 입력받습니다)

backend/campus/api/admin.py와 같은 scrypt(n=16384, r=8, p=1) 해시를 저장합니다.
"""

import getpass
import hashlib
import json
import secrets
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(f"사용법: {sys.argv[0]} <admins.json 경로> <아이디>")
    path, username = Path(sys.argv[1]), sys.argv[2]
    password = getpass.getpass("비밀번호: ")
    if len(password) < 8 or password != getpass.getpass("비밀번호 확인: "):
        sys.exit("비밀번호가 8자 미만이거나 확인 값과 다릅니다.")

    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"accounts": []}
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1).hex()
    data["accounts"] = [a for a in data["accounts"] if a.get("username") != username]
    data["accounts"].append({"username": username, "salt": salt.hex(), "password_hash": digest})

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o644)  # 컨테이너가 읽을 수 있게 (폴더는 700으로 보호)
    print(f"'{username}' 계정을 {path}에 저장했습니다.")


if __name__ == "__main__":
    main()
