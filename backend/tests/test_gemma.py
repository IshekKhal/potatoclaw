"""Test suite for Google DeepMind Gemma 4 intelligence engine."""

from app.services.gemma_brain import (
    generate_multimodal_vision,
    generate_text_reasoning,
)


def test_gemma_text_reasoning_live():
    """Verify Gemma 4 text reasoning on a concrete Python coding problem."""
    prompt = "Fix this code: def add(a, b): return a - b. Provide only the corrected function."
    answer = generate_text_reasoning(prompt=prompt)

    assert isinstance(answer, str)
    assert len(answer) > 0
    assert "return a + b" in answer or "add" in answer


def test_gemma_multimodal_vision_live(synthetic_png_bytes: bytes):
    """Verify Gemma 4 multimodal image inspection on synthetic test PNG."""
    prompt = "What error message or text is written inside this image?"
    answer = generate_multimodal_vision(
        image_bytes=synthetic_png_bytes,
        mime_type="image/png",
        prompt=prompt,
    )

    assert isinstance(answer, str)
    assert len(answer) > 0
    # The synthetic image has 'SYNTAX ERROR' text
    lower_ans = answer.lower()
    assert "syntax" in lower_ans or "error" in lower_ans
