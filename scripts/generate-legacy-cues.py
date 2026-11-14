#!/usr/bin/env python3
"""Generate Sync's original legacy-URI compatibility effects using only stdlib.

No recordings, third-party samples, exported speech or external audio inputs.
Run normally to regenerate; --check verifies the committed WAVs byte-for-byte.
"""

import argparse
import hashlib
import io
import math
from pathlib import Path
import struct
import wave


RATE = 44100
PEAK = 0.60
OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "sounds" / "cues"


def envelope(time, duration, attack=0.012, release=0.060):
    """Smooth raised-cosine edges avoid clicks at either PCM boundary."""
    rise = (1 - math.cos(math.pi * min(1, time / attack))) / 2
    fall = (1 - math.cos(math.pi * min(1, (duration - time) / release))) / 2
    return rise * fall


def synthesize(name, duration):
    count = round(duration * RATE)
    samples = []
    phase = 0.0
    for index in range(count):
        time = index / RATE
        if name == "long-beep":
            value = math.sin(2 * math.pi * 660 * time) + 0.12 * math.sin(2 * math.pi * 1320 * time)
        elif name == "whistle":
            frequency = 1700 + 280 * math.sin(math.pi * time / duration) + 16 * math.sin(2 * math.pi * 5 * time)
            phase += 2 * math.pi * frequency / RATE
            value = math.sin(phase) + 0.08 * math.sin(2 * phase)
        elif name == "buzzer":
            value = sum(math.sin(2 * math.pi * 150 * harmonic * time) / harmonic for harmonic in (1, 3, 5, 7, 9))
            value *= 0.90 + 0.10 * math.sin(2 * math.pi * 35 * time)
        elif name == "air-horn":
            value = sum(math.sin(2 * math.pi * frequency * time) + 0.18 * math.sin(2 * math.pi * 2 * frequency * time) for frequency in (220, 275, 330))
        else:
            raise ValueError("Unknown synthesis recipe")
        samples.append(value * envelope(time, duration))
    maximum = max(abs(sample) for sample in samples)
    pcm = [round(sample / maximum * PEAK * 32767) for sample in samples]
    pcm[0] = pcm[-1] = 0
    destination = io.BytesIO()
    with wave.open(destination, "wb") as sound:
        sound.setnchannels(1)
        sound.setsampwidth(2)
        sound.setframerate(RATE)
        sound.writeframes(struct.pack(f"<{len(pcm)}h", *pcm))
    return destination.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check existing WAVs without modifying them")
    args = parser.parse_args()
    recipes = {"long-beep": 0.80, "whistle": 0.75, "buzzer": 0.65, "air-horn": 0.85}
    if not args.check:
        OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, duration in recipes.items():
        content = synthesize(name, duration)
        path = OUTPUT / f"{name}.wav"
        if args.check:
            if not path.exists() or path.read_bytes() != content:
                raise SystemExit(f"FAIL: {path.name} differs from its original synthesis recipe")
        else:
            path.write_bytes(content)
        print(f"{'PASS' if args.check else 'WROTE'} {path.name}: {duration:.2f}s, mono PCM16/{RATE}Hz, sha256={hashlib.sha256(content).hexdigest()}")


if __name__ == "__main__":
    main()
