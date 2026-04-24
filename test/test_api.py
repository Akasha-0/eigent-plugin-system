"""
Tests for Eigent Plugin System API
"""
import pytest
from fastapi.testclient import TestClient
from src.lib.api.server import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self):
        response = client.get("/api/health")
        assert response.status_code == 200
    
    def test_health_response_structure(self):
        response = client.get("/api/health")
        data = response.json()
        assert "status" in data


class TestPluginEndpoints:
    def test_list_plugins(self):
        response = client.get("/api/plugins")
        assert response.status_code == 200
    
    def test_get_sso_config(self):
        response = client.get("/api/auth/sso/config")
        assert response.status_code == 200


class TestModels:
    def test_list_models(self):
        response = client.get("/api/agent/models")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestAgentRun:
    def test_agent_run_requires_input(self):
        response = client.post("/api/agent/run", json={})
        assert response.status_code == 422
    
    def test_agent_run_with_input(self):
        response = client.post("/api/agent/run", json={
            "input": "Hello!",
            "model": "gpt-4",
        })
        assert response.status_code == 200


class TestProjects:
    def test_list_projects(self):
        response = client.get("/api/projects")
        assert response.status_code == 200
    
    def test_create_project(self):
        response = client.post("/api/projects", json={
            "name": "Test Project",
            "description": "Test"
        })
        assert response.status_code == 201


if __name__ == "__main__":
    pytest.main([__file__, "-v"])