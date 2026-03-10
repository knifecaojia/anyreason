import bcrypt

password = "1235anyreason1235"
hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
print(hashed)
