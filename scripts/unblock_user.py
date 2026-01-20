
import asyncio
import os
import sys
import json
from prisma import Prisma

async def unblock_user(user_identifier):
    # Construct DATABASE_URL if not set, using APP_* env vars
    if not os.getenv("DATABASE_URL"):
        user = os.getenv("APP_USER")
        password = os.getenv("APP_PASSWORD")
        db = os.getenv("APP_DB")
        host = os.getenv("DB_HOST", "localhost")
        port = os.getenv("DB_PORT", "5432")
        
        if user and password and db:
            os.environ["DATABASE_URL"] = f"postgresql://{user}:{password}@{host}:{port}/{db}"
            print(f"Constructed DATABASE_URL from env vars: postgresql://{user}:****@{host}:{port}/{db}")
        else:
            print("Error: DATABASE_URL not set and APP_USER/APP_PASSWORD/APP_DB not provided.")
            sys.exit(1)

    prisma = Prisma()
    try:
        await prisma.connect()
        
        # Try to find by user_id first
        user = await prisma.litellm_usertable.find_unique(where={"user_id": user_identifier})
        
        # If not found, try by email (using find_first since email isn't unique constraint in schema normally, though it should be)
        if not user:
             user = await prisma.litellm_usertable.find_first(where={"user_email": user_identifier})
        
        if not user:
            print(f"User not found: {user_identifier}")
            return

        print(f"Found user: {user.user_id} ({user.user_email})")
        
        # Update metadata
        metadata = user.metadata or {}
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        
        if "login_locked_until" in metadata:
            print("Removing login lock...")
            metadata.pop("login_locked_until")
        
        if "failed_login_attempts" in metadata:
            print("Resetting failed attempts...")
            metadata["failed_login_attempts"] = 0
            
        # Write back
        from prisma import Json
        await prisma.litellm_usertable.update(
            where={"user_id": user.user_id},
            data={"metadata": Json(metadata)}
        )
        print("User unblocked successfully.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        if prisma.is_connected():
            await prisma.disconnect()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 unblock_user.py <user_id_or_email>")
        sys.exit(1)
    
    asyncio.run(unblock_user(sys.argv[1]))
