import base64
import hashlib

from cryptography.fernet import Fernet


def build_fernet_key(*, seed: bytes) -> bytes:
    return base64.urlsafe_b64encode(hashlib.sha256(seed).digest())


def build_fernet(*, seed: bytes) -> Fernet:
    return Fernet(build_fernet_key(seed=seed))

