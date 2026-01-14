import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch, AsyncMock
import jwt
import json
import uuid
import os
from datetime import datetime, timedelta

# Mock the entire proxy server module attributes if needed, but easier to use mock.patch on the module
import litellm.proxy.proxy_server as proxy_server
from litellm.proxy.proxy_server import app

client = TestClient(app)

# Helper to create a valid token
def create_token(user_id, jti, master_key, expiry_minutes=60):
    expiry = datetime.utcnow() + timedelta(minutes=expiry_minutes)
    payload = {
        "user_id": user_id,
        "jti": jti,
        "exp": int(expiry.timestamp()),
        "user_role": "app_owner"
    }
    return jwt.encode(payload, master_key, algorithm="HS256")

@pytest.mark.asyncio
async def test_refresh_token_success():
    """
    Test successful token refresh.
    """
    master_key = "test_master_key"
    proxy_server.master_key = master_key
    
    user_id = "test_user_id"
    old_jti = str(uuid.uuid4())
    token = create_token(user_id, old_jti, master_key)
    
    # Mock Prisma Client
    mock_prisma = MagicMock()
    mock_user = MagicMock()
    # User metadata has matching active_jti
    mock_user.metadata = json.dumps({"active_token_jti": old_jti})
    
    proxy_server.prisma_client = mock_prisma
    
    # Mock database responses
    # find_unique should return the user
    mock_prisma.db.litellm_usertable.find_unique = AsyncMock(return_value=mock_user)
    # update should be called
    mock_prisma.db.litellm_usertable.update = AsyncMock()

    # Pass token in cookie
    response = client.post("/refresh_token", cookies={"token": token})
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "token" in data
    
    new_token = data["token"]
    decoded = jwt.decode(new_token, master_key, algorithms=["HS256"])
    
    assert decoded["user_id"] == user_id
    assert decoded["jti"] != old_jti # Should be new JTI
    
    # Verify DB update called with new JTI
    assert mock_prisma.db.litellm_usertable.update.called
    call_args = mock_prisma.db.litellm_usertable.update.call_args
    assert call_args
    _, kwargs = call_args
    updated_metadata = kwargs["data"]["metadata"]
    assert updated_metadata["active_token_jti"] == decoded["jti"]


@pytest.mark.asyncio
async def test_refresh_token_invalid_jti():
    """
    Test refresh failure when JTI does not match (token invalidated).
    """
    master_key = "test_master_key"
    proxy_server.master_key = master_key
    
    user_id = "test_user_id"
    old_jti = "stolen_jti"
    active_jti = "new_active_jti" # Changed by another login
    token = create_token(user_id, old_jti, master_key)
    
    # Mock Prisma Client
    mock_prisma = MagicMock()
    mock_user = MagicMock()
    # User metadata has DIFFERENT active_jti
    mock_user.metadata = json.dumps({"active_token_jti": active_jti})
    
    proxy_server.prisma_client = mock_prisma
    mock_prisma.db.litellm_usertable.find_unique = AsyncMock(return_value=mock_user)
    
    response = client.post("/refresh_token", cookies={"token": token})
    
    assert response.status_code == 401
    assert "Token has been invalidated" in response.json()["detail"]

@pytest.mark.asyncio
async def test_refresh_token_no_token():
    response = client.post("/refresh_token")
    assert response.status_code == 401
    assert "No token provided" in response.json()["detail"]
