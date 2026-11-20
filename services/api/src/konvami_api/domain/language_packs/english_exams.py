"""Speaking simulations for English exams (spec §6.13): IELTS, Cambridge English B2 First and C1
Advanced, and the TOEFL iBT.

After their public descriptions: IELTS Speaking is 11 to 14 minutes with one examiner (an
interview on familiar topics, a long turn from a cue card after a minute's preparation, a
discussion linked to it); Cambridge B2 First and C1 Advanced are paired tests of about 14 and
15 minutes (an interview, a long turn on photographs, a collaborative task, a discussion), the
other candidate played by the second voice; the TOEFL iBT since January 2026 has a short,
computer-delivered speaking section (listen and repeat, then an interview) reported from 1 to 6
(the task counts are from preparation sites and unverified). The cards are our own; scores are
estimates, never official.
"""

from konvami_api.domain.exams import ExamPart, ExamScale, SpeakingExam, exam_card

_IELTS_RUBRIC = (
    "IELTS Speaking is reported as a band from 0 to 9 in half bands, from four equally weighted "
    "areas: fluency and coherence (judge it under coherence), lexical resource (vocabulary), "
    "grammatical range and accuracy (grammar), and pronunciation (not judged here). Under task, "
    "judge whether answers are developed and relevant. Estimate the overall speaking band."
)
_CAMBRIDGE_RUBRIC = (
    "Cambridge English speaking is judged on grammar and vocabulary, discourse management, "
    "pronunciation (not judged here) and interactive communication, and reported on the "
    "Cambridge English Scale. Weigh how the learner develops their long turn, compares and "
    "speculates, and how they interact with the other candidate (inviting opinions, building on "
    "ideas, negotiating a decision). Estimate the speaking score on the Cambridge English Scale."
)
_TOEFL_RUBRIC = (
    "The TOEFL iBT speaking section is reported from 1 to 6 in half steps. In listen and repeat, "
    "judge how exactly each sentence was repeated (task) and its grammar; in the interview, how "
    "relevant, developed and coherent the answers are and the range of vocabulary and grammar. "
    "Estimate the speaking score from 1 to 6."
)

_CAMBRIDGE_PICTURES = exam_card(
    "cam_2",
    "Look at the two photographs. Why might these people be waiting? How might they be feeling?",
    "Photo A and photo B",
    "Compare them",
    "Speculate",
    picture="waiting_pair",
)


def _cambridge(level: str, id: str, name: str, low: int, high: int) -> SpeakingExam:
    advanced = level == "C1"
    key = f"cam_{level.lower()}"
    return SpeakingExam(
        id=id,
        exam="cambridge",
        levels=(level,),
        name=name,
        prep_seconds=0,
        language="en",
        scale=ExamScale("points", low, high, 1),
        rubric=_CAMBRIDGE_RUBRIC,
        parts=(
            ExamPart(
                "part_1",
                "interview",
                "Interview",
                "Ask the learner a few questions about themselves along the card; ask the "
                "other candidate one too and let them answer briefly.",
                90,
                (
                    exam_card(
                        f"{key}_1a",
                        "Interview",
                        "Where you live",
                        "Free time",
                        "Studies or work",
                        "Future plans",
                    ),
                    exam_card(
                        f"{key}_1b",
                        "Interview",
                        "Friends and family",
                        "Holidays",
                        "Technology",
                        "Learning English",
                    ),
                ),
            ),
            ExamPart(
                "part_2",
                "compare_pictures",
                "Long turn: photographs",
                "The learner compares the two photographs and answers the card's question for "
                "about a minute, without help. Then ask the other candidate a short question "
                "about them and let them answer in a sentence or two.",
                150,
                (_CAMBRIDGE_PICTURES,),
            ),
            ExamPart(
                "part_3",
                "collaborate",
                "Collaborative task",
                "The learner and the other candidate talk together about the card's question "
                "for about two minutes, then decide on one option. The other candidate gives "
                "opinions, agrees and disagrees; you only start and close the task.",
                180,
                (
                    exam_card(
                        f"{key}_3a",
                        "Here are some things a town could do to help young people. Talk about "
                        "how useful they might be."
                        if not advanced
                        else "Here are some "
                        "pressures people face at work today. Talk about how these pressures "
                        "might affect people.",
                        *(
                            (
                                "A youth centre",
                                "Cheaper public transport",
                                "Free sports clubs",
                                "Job advice",
                                "Music events",
                            )
                            if not advanced
                            else (
                                "Long hours",
                                "Constant emails",
                                "Job insecurity",
                                "Open-plan offices",
                                "Targets",
                            )
                        ),
                    ),
                ),
            ),
            ExamPart(
                "part_4",
                "discussion",
                "Discussion",
                "Ask both candidates broader questions linked to part 3; let the other "
                "candidate react to the learner's answers now and then.",
                120,
                (
                    exam_card(
                        f"{key}_4",
                        "Discussion",
                        "Give reasons",
                        "React to the other candidate",
                        "Develop your answer",
                    ),
                ),
            ),
        ),
    )


ENGLISH_EXAMS: tuple[SpeakingExam, ...] = (
    SpeakingExam(
        id="ielts",
        exam="ielts",
        levels=("A2", "B1", "B2", "C1", "C2"),
        name="IELTS · Speaking",
        prep_seconds=0,
        language="en",
        scale=ExamScale("band", 0, 9, 0.5),
        pass_share=0.65,
        rubric=_IELTS_RUBRIC,
        parts=(
            ExamPart(
                "part_1",
                "interview",
                "Part 1: Interview",
                "Ask four or five short questions on the card's familiar topics, one at a "
                "time; do not comment on the answers.",
                150,
                (
                    exam_card(
                        "ielts_1a",
                        "Part 1",
                        "Your home town",
                        "Work or studies",
                        "Weekends",
                        "Music",
                    ),
                    exam_card(
                        "ielts_1b", "Part 1", "Where you live", "Food", "Weather", "Shopping"
                    ),
                ),
            ),
            ExamPart(
                "part_2",
                "long_turn",
                "Part 2: Long turn",
                "Read out the cue card's task. Give the learner one minute to prepare in "
                "silence (say so, then wait), then let them speak for up to two minutes "
                "without interrupting. Ask one short question to round off.",
                210,
                (
                    exam_card(
                        "ielts_2a",
                        "Describe a skill you learned as an adult.",
                        "What it was",
                        "How you learned it",
                        "How long it took",
                        "And explain how you feel about it now",
                    ),
                    exam_card(
                        "ielts_2b",
                        "Describe a place you visited that surprised you.",
                        "Where it was",
                        "When you went",
                        "What you did there",
                        "And explain why it surprised you",
                    ),
                ),
            ),
            ExamPart(
                "part_3",
                "discussion",
                "Part 3: Discussion",
                "Discuss broader, more abstract questions linked to part 2 with the learner, "
                "as the examiner; ask them to justify, compare and speculate.",
                180,
                (
                    exam_card(
                        "ielts_3a",
                        "Part 3: Learning",
                        "Learning at school vs as an adult",
                        "Learning online",
                        "Skills for the future",
                    ),
                    exam_card(
                        "ielts_3b",
                        "Part 3: Travel",
                        "Why people travel",
                        "Tourism and local life",
                        "Travel in the future",
                    ),
                ),
            ),
        ),
    ),
    _cambridge("B2", "cambridge_b2_first", "Cambridge English B2 First · Speaking", 140, 190),
    _cambridge("C1", "cambridge_c1_advanced", "Cambridge English C1 Advanced · Speaking", 160, 210),
    SpeakingExam(
        id="toefl",
        exam="toefl",
        levels=("A2", "B1", "B2", "C1", "C2"),
        name="TOEFL iBT · Speaking",
        prep_seconds=0,
        language="en",
        scale=ExamScale("band", 1, 6, 0.5),
        pass_share=0.65,
        rubric=_TOEFL_RUBRIC,
        min_learner_turns=4,
        parts=(
            ExamPart(
                "listen_repeat",
                "listen_repeat",
                "Listen and repeat",
                "Speak in a neutral, recorded-test voice. Say the sentences in your note one "
                "at a time, clearly and once; after each, wait for the learner to repeat it "
                "and go on without comment.",
                150,
                (
                    exam_card(
                        "toefl_1a",
                        "Listen and repeat each sentence exactly as you hear it.",
                        "A campus tour",
                        examiner=(
                            "Sentences: 1. Welcome to the campus tour. 2. The library opens at "
                            "eight. 3. Please keep your student card with you. 4. The science "
                            "building is next to the main hall. 5. Lunch is served in the "
                            "cafeteria until two. 6. If you have questions, ask any of the "
                            "guides. 7. The tour ends at the sports centre, where you can sign "
                            "up for a club."
                        ),
                    ),
                    exam_card(
                        "toefl_1b",
                        "Listen and repeat each sentence exactly as you hear it.",
                        "At the museum",
                        examiner=(
                            "Sentences: 1. The museum is open today. 2. Bags go in the lockers. "
                            "3. Photos are allowed without a flash. 4. The new exhibition is on "
                            "the second floor. 5. A guided tour starts every hour on the hour. "
                            "6. The café closes thirty minutes before the museum does. 7. "
                            "Visitors under eighteen can enter for free if they show an ID."
                        ),
                    ),
                ),
            ),
            ExamPart(
                "interview",
                "interview",
                "Take an interview",
                "Ask the four questions in your note, one at a time, as a neutral interviewer; "
                "the learner answers each for about 45 seconds. No follow-ups.",
                240,
                (
                    exam_card(
                        "toefl_2a",
                        "Answer the interviewer's questions.",
                        "Topic: working from home",
                        examiner=(
                            "Questions: 1. Have you ever worked or studied from home? 2. What "
                            "is the hardest part of it? 3. Should companies let everyone work "
                            "from home? Why? 4. How might offices change in the next ten years?"
                        ),
                    ),
                    exam_card(
                        "toefl_2b",
                        "Answer the interviewer's questions.",
                        "Topic: city life",
                        examiner=(
                            "Questions: 1. Do you prefer living in a city or the countryside? "
                            "2. What would make your town a better place to live? 3. Should "
                            "cars be banned from city centres? Why? 4. How will cities change "
                            "for young people in the future?"
                        ),
                    ),
                ),
            ),
        ),
    ),
)
