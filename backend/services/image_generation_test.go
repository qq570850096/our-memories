package services

import (
	"strings"
	"testing"
)

func TestAvatarSpritePromptIncludesPixelQualityGuardrails(t *testing.T) {
	prompt := avatarSpritePrompt(AvatarSpriteSpec{
		Prompt:         "short black hair and red scarf",
		Gender:         "female",
		ReferenceImage: "data:image/png;base64,abc",
	})

	for _, want := range []string{
		"crisp hand-placed pixel art",
		"clear hard pixel edges",
		"one complete full-body character",
		"lively walking pose",
		"complete character mid-step",
		"If the prompt asks for two people or a couple",
		"do not split them into panels",
		"Do not create a sprite sheet",
		"Negative prompt:",
		"frame boundary slicing",
		"blurry",
		"short black hair and red scarf",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("expected prompt to contain %q, got:\n%s", want, prompt)
		}
	}
}

func TestNormalizePromptTemplateUpgradesLegacyDefault(t *testing.T) {
	prompt := normalizePromptTemplate(legacyDefaultAvatarPromptTemplate)
	if !strings.Contains(prompt, "lively walking pose") {
		t.Fatalf("expected legacy prompt template to upgrade, got:\n%s", prompt)
	}
}

func TestNormalizeNegativePromptUpgradesLegacyDefault(t *testing.T) {
	prompt := normalizeNegativePrompt(legacyDefaultAvatarNegativePrompt)
	if !strings.Contains(prompt, "frame boundary slicing") {
		t.Fatalf("expected legacy negative prompt to upgrade, got:\n%s", prompt)
	}
}
