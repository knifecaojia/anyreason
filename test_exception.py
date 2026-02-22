
from dataclasses import dataclass

@dataclass
class AppError(Exception):
    msg: str

try:
    raise AppError(msg="test")
except Exception as e:
    print(f"str(e): {str(e)}")
    print(f"repr(e): {repr(e)}")
