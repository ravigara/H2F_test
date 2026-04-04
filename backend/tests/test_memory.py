import tempfile
import unittest

from app.memory import PersistentStore


class PersistentStoreTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.store = PersistentStore(f"{self.tempdir.name}/test.db")

    def tearDown(self):
        self.store.close()
        self.tempdir.cleanup()

    def test_session_transcript_and_telemetry_persistence(self):
        self.store.add("session-a", "user", "Hello world")
        self.store.add("session-a", "assistant", "Reply text")
        self.store.track_languages("session-a", {"en", "hi"})
        self.store.set_selected_language("session-a", "en")
        self.store.record_transcript(
            session_id="session-a",
            source="ws.audio",
            text="Hello from transcript",
            dominant_language="en",
            languages=["en", "hi"],
            is_code_mixed=True,
            segments=[{"text": "Hello"}],
            details={"sample_rate": 16000},
        )
        self.store.record_latency("session-a", "api.chat", 42.5, status="ok")
        self.store.record_error("session-a", "ws.audio", "disconnect")

        detail = self.store.get_session_detail("session-a")
        self.assertIsNotNone(detail)
        self.assertEqual(detail["message_count"], 2)
        self.assertEqual(detail["transcript_count"], 1)
        self.assertEqual(detail["telemetry_count"], 2)
        self.assertEqual(detail["selected_language"], "en")
        self.assertEqual(detail["languages"], ["en", "hi"])

        messages = self.store.list_messages("session-a")
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["role"], "user")

        transcripts = self.store.list_transcripts(session_id="session-a")
        self.assertEqual(len(transcripts), 1)
        self.assertTrue(transcripts[0]["is_code_mixed"])

        telemetry = self.store.list_telemetry(session_id="session-a")
        self.assertEqual(len(telemetry), 2)

    def test_workflows_extractions_dashboard_and_search(self):
        workflow = self.store.upsert_workflow(
            "general",
            "General Review",
            "General workflow",
            [{"key": "summary", "label": "Summary", "type": "text"}],
        )
        self.assertEqual(workflow["name"], "general")

        self.store.add("session-b", "user", "Need urgent help with payment issue")
        extraction = self.store.create_extraction(
            workflow_name="general",
            session_id="session-b",
            source_text="Need urgent help with payment issue",
            generated_data={"fields": {"summary": "Payment issue"}},
        )
        self.assertEqual(extraction["workflow_name"], "general")

        reviewed = self.store.update_extraction_review(
            extraction["id"],
            reviewed_data={"fields": {"summary": "Reviewed payment issue"}},
            status="reviewed",
            notes="Checked by reviewer",
        )
        self.assertEqual(reviewed["status"], "reviewed")
        self.assertEqual(reviewed["notes"], "Checked by reviewer")

        dashboard = self.store.dashboard_summary()
        self.assertEqual(dashboard["workflow_count"], 1)
        self.assertEqual(dashboard["extraction_count"], 1)

        search_results = self.store.search("payment")
        self.assertEqual(len(search_results), 1)
        self.assertEqual(search_results[0]["source_type"], "message")


if __name__ == "__main__":
    unittest.main()
