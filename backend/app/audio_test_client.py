import asyncio
import websockets
import sounddevice as sd
import numpy as np

SAMPLERATE = 16000
DURATION = 5  # seconds


async def stream_audio():
    uri = "ws://localhost:8000/ws/audio/test"

    async with websockets.connect(uri) as ws:

        print("🎤 Recording...")

        recording = sd.rec(
            int(DURATION * SAMPLERATE),
            samplerate=SAMPLERATE,
            channels=1,
            dtype='int16'
        )

        sd.wait()

        print("📤 Sending audio...")

        await ws.send(recording.tobytes())

        # Commit signal
        await ws.send("commit")

        full_text = ""

        while True:
            msg = await ws.recv()
            print(msg)

            if "final" in msg:
                break


asyncio.run(stream_audio())