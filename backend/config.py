import os

from dotenv import load_dotenv

load_dotenv()  # reads the .env file

SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))

if len(SECRET_KEY) < 32:
    raise RuntimeError("SECRET_KEY in .env is missing or too short (need 32+ characters).")