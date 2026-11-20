# Pronunciation scoring per sound (5.22, spec §6.14 P2, §9.5)

## What was already there

Before this change the lab could already send a drill to an acoustic provider: the
`PronunciationAssessor` contract (`domain/pronunciation_assessment.py`), the Azure Speech REST
adapter (`providers/azure_assessment.py`, phoneme granularity, 16 kHz mono WAV, at most 30 s),
consent per drill (the "Assess pronunciation" switch), the Terraform secret and region
(`azure_speech_enabled`, `azure_speech_api_key`, `azure_speech_region`), and a raw list of word
and phoneme scores on 5.22. What was missing was the answer a learner needs: **how did the sound I
am practising go?**

## What this adds

- **A drill's sound score** (`domain/sound_phonemes.py`). Each problem sound of every pack names
  its phonemes, in IPA and in Microsoft's SAPI spelling, and where in a word they count (anywhere,
  first, last). The score is the mean accuracy of those phonemes in the words the learner was
  asked to say. Words the provider heard but that were not asked for are left out.
- **A fallback that says so.** When no phoneme of the sound comes back (a locale whose phoneme
  names are not given, or another alphabet), the score is taken from the words that carry the
  sound, and the result says it is from whole words.
- **Bands, never red.** Good from 85, nearly there from 70 (the lab's existing review threshold,
  so the two agree), keep practising below. Keep practising is amber (spec §14.3).
- **The word to say again first:** the asked word whose sound scored lowest.
- **Each sound's recent score.** The mean of its last five assessed drills, on the lab's list
  (migration `0160`: a nullable `sound_score` on `pronunciation_drill`, included in the export
  with the table).
- **IPA requested** from Azure (`PhonemeAlphabet: IPA`).
- **Costs (6.12).** Azure's usage was metered as `pronunciation` seconds but had no price, so it
  showed as unpriced. The `prices` default now has `pronunciation = { seconds = 278 }` (about $1
  an hour of audio, the real-time speech-to-text rate).

## My calls

- **Stress is not scored.** Phoneme accuracy does not measure stress; a number there would be
  invented. Stress drills keep the word comparison only (`UNSCORED`).
- **Position for final devoicing, -ig and sp/st.** Only the last (or first) phoneme counts, so the
  t of "Tag" at the start does not dilute the k at its end.
- **Vowel length scores every vowel of the word.** Length is about how each vowel is held.
- **Five drills for the recent score.** Enough that one noisy recording does not swing it, recent
  enough to show progress within a sitting or two.
- **The "can't score single sounds" caption** stays on the lab page, but no longer sits under an
  assessed result, where it would contradict the score above it.
- **Conversation turns** assessed on 5.6 have no problem sound, so they get no sound score.

## Off by default; what the owner does

Nothing is sent anywhere unless the owner sets `azure_speech_enabled = true` with an Azure Speech
key and region in `infra/envs/dev/terraform.tfvars`, plans and applies. Even then, every drill
asks first. Without a key the lab works as before (word comparison) and shows no scores.

Before turning it on:

1. Create an Azure Speech resource in an EU region (for example `westeurope`). Check its price and
   set the real rate in `prices.pronunciation`.
2. Check that the de-DE, fr-FR and it-IT results carry phoneme names in IPA. The tests use
   recorded shapes, not the live service. Where they don't, scores fall back to whole words, and
   the matchers in `sound_phonemes.py` are the place to add the spelling that comes back.
3. Add Azure (Microsoft) to the privacy policy and the store privacy labels for the optional
   assessment, if it is not there yet.
