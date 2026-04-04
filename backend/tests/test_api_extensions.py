import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import api as api_module
from app import extraction as extraction_module
from app import main as main_module
from app.memory import PersistentStore


class ApiExtensionTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.store = PersistentStore(f"{self.tempdir.name}/test.db")
        self.patches = [
            patch.object(api_module, "store", self.store),
            patch.object(extraction_module, "store", self.store),
            patch.object(main_module, "store", self.store),
        ]
        for active_patch in self.patches:
            active_patch.start()

        extraction_module.ensure_default_workflows()
        self.client = TestClient(main_module.app)

    def tearDown(self):
        self.client.close()
        for active_patch in reversed(self.patches):
            active_patch.stop()
        self.store.close()
        self.tempdir.cleanup()

    def test_dashboard_and_session_routes(self):
        self.store.add("session-ui", "user", "Hello from UI")
        self.store.add("session-ui", "assistant", "Hello back")
        self.store.record_transcript(
            session_id="session-ui",
            source="api.transcribe",
            text="Transcript text",
            dominant_language="en",
            languages=["en"],
            is_code_mixed=False,
            segments=[],
            details={},
        )

        dashboard = self.client.get("/api/dashboard/summary")
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.json()["session_count"], 1)

        messages = self.client.get("/api/session/session-ui/messages")
        self.assertEqual(messages.status_code, 200)
        self.assertEqual(len(messages.json()), 2)

        transcripts = self.client.get("/api/session/session-ui/transcripts")
        self.assertEqual(transcripts.status_code, 200)
        self.assertEqual(len(transcripts.json()), 1)

        search = self.client.get("/api/search", params={"q": "hello"})
        self.assertEqual(search.status_code, 200)
        self.assertEqual(len(search.json()), 2)

    def test_workflow_and_extraction_review_routes(self):
        workflow_response = self.client.put(
            "/api/workflows/custom-intake",
            json={
                "display_name": "Custom Intake",
                "description": "Workflow for intake review",
                "fields": [
                    {"key": "summary", "label": "Summary", "type": "text"},
                    {"key": "next_steps", "label": "Next Steps", "type": "list"},
                ],
            },
        )
        self.assertEqual(workflow_response.status_code, 200)
        self.assertEqual(workflow_response.json()["name"], "custom-intake")

        extraction_response = self.client.post(
            "/api/extractions/generate",
            json={
                "workflow_name": "custom-intake",
                "text": "We need to review the issue next week and schedule a follow up.",
            },
        )
        self.assertEqual(extraction_response.status_code, 200)
        record = extraction_response.json()
        self.assertEqual(record["workflow_name"], "custom-intake")
        self.assertIn("fields", record["generated_data"])

        update_response = self.client.put(
            f"/api/extractions/{record['id']}",
            json={
                "reviewed_data": {
                    "fields": {
                        "summary": "Reviewed summary",
                        "next_steps": ["Schedule the follow up"],
                    }
                },
                "status": "approved",
                "notes": "Approved in API test",
            },
        )
        self.assertEqual(update_response.status_code, 200)
        updated = update_response.json()
        self.assertEqual(updated["status"], "approved")
        self.assertEqual(updated["notes"], "Approved in API test")


if __name__ == "__main__":
    unittest.main()
