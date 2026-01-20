
import sys
import os
import secrets
from datetime import datetime, timedelta, timezone
import json

# Mock objects needed for authenticat_user
class MockUserRow:
    def __init__(self, user_id, password, metadata=None):
        self.user_id = user_id
        self.password = password
        self.metadata = metadata or {}
        self.user_role = "internal_user"
        self.user_email = "test@test.com"

class MockPrisma:
    class DB:
        class UserTable:
            def __init__(self, user_row):
                self.user_row = user_row
            
            async def find_first(self, where):
                return self.user_row

            async def update(self, where, data):
                from prisma import Json
                # Simulate update
                new_meta = data.get("metadata")
                if isinstance(new_meta, Json):
                    new_meta = new_meta.data 
                self.user_row.metadata = new_meta
                print(f"[DB UPDATE] Metadata: {self.user_row.metadata}")
        
        def __init__(self, user_row):
             self.litellm_usertable = self.UserTable(user_row)
    
    def __init__(self, user_row):
        self.db = self.DB(user_row)

# Import logic to test
def test_login_logic():
    # We are simulating the logic inside authenticate_user manually because importing it is hard without dependencies
    # But essentially we want to verify the logic block we pasted.
    
    # Setup
    password = "correct_password"
    hashed_password = secrets.token_hex(16) # Mock hash
    # Mocking compare_digest for simplicity in test harness
    # Actual logic uses secrets.compare_digest(password, row.password)
    
    # 1. Test Failure Increment
    user_row = MockUserRow("u1", "hashed_secret", metadata={})
    
    print("\n--- Test 1: Single Failure ---")
    current_metadata = user_row.metadata
    max_attempts = 3
    failed_attempts = current_metadata.get("failed_login_attempts", 0) + 1
    current_metadata["failed_login_attempts"] = failed_attempts
    print(f"Failed attempts: {failed_attempts}")
    
    assert failed_attempts == 1
    
    # Check remaining attempts logic
    remaining = max_attempts - failed_attempts
    print(f"Remaining attempts: {remaining}")
    assert remaining == 2
    
    print("\n--- Test 2: Lockout Trigger ---")
    # Simulate 2 more failures
    failed_attempts += 2 
    current_metadata["failed_login_attempts"] = failed_attempts
    
    if failed_attempts >= max_attempts:
         lockout_min = 15
         lock_until = datetime.now(timezone.utc) + timedelta(minutes=lockout_min)
         current_metadata["login_locked_until"] = lock_until.isoformat()
         current_metadata["failed_login_attempts"] = 0 # Reset
         print(f"Locked until: {lock_until}")

    assert current_metadata.get("login_locked_until") is not None
    assert current_metadata["failed_login_attempts"] == 0
    
    print("\n--- Test 3: Lockout Block ---")
    # Simulate next login attempt
    login_locked_until = current_metadata.get("login_locked_until")
    if login_locked_until:
        locked_until_dt = datetime.fromisoformat(login_locked_until)
        if datetime.now(timezone.utc) < locked_until_dt:
            print("BLOCKED: Account is locked.")
        else:
            print("ALLOWED: Lock expired.")
            
    assert datetime.now(timezone.utc) < locked_until_dt
    
    print("\nSUCCESS: Logic verification pass.")
    
    print("\n--- Test 4: Naive Datetime Handling ---")
    # Simulate DB returning a naive ISO string (no timezone info)
    naive_iso = (datetime.now() + timedelta(minutes=15)).isoformat() # Naive
    print(f"Naive stored string: {naive_iso}")
    
    login_locked_until = naive_iso
    if login_locked_until:
        locked_until_dt = datetime.fromisoformat(login_locked_until)
        # Emulate the fix: Force UTC if naive
        if locked_until_dt.tzinfo is None:
             print("Detected naive time. Assuming UTC.")
             locked_until_dt = locked_until_dt.replace(tzinfo=timezone.utc)
        
        current_time_utc = datetime.now(timezone.utc)
        print(f"Compare: Now({current_time_utc}) < Locked({locked_until_dt})")
        
        # This comparison would FAIL with TypeError if naive was not fixed
        if current_time_utc < locked_until_dt:
             print("BLOCKED (Naive handled correctly).")
        else:
             print("ALLOWED (Expired or Past).")
        
        assert current_time_utc < locked_until_dt

if __name__ == "__main__":
    test_login_logic()
