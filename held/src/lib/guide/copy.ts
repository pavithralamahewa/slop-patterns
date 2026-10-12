import type { PhaseId } from "@/lib/core/types";

/**
 * Plain-language guide copy for people who have never run a design sprint.
 */

export type PhaseGuide = {
  plainName: string;
  inOneSentence: string;
  whyItExists: string;
  whatYouDo: string;
  whatAiDoes: string;
  dontSkip: string;
  nextHint: string;
};

export const PHASE_GUIDE: Record<PhaseId, PhaseGuide> = {
  foundation: {
    plainName: "Name the bet",
    inOneSentence:
      "Write one clear sentence about who you help, what problem you solve, and why they would pick you.",
    whyItExists:
      "If you skip this, the rest of the week is busywork on the wrong idea. Building got cheap — choosing what to build is the hard part.",
    whatYouDo:
      "Read the draft sentence. Change anything that feels wrong. When it matches what you believe, approve it.",
    whatAiDoes:
      "Drafts options and competitor notes. It does not get to claim customers will love it.",
    dontSkip: "Do not approve a sentence you cannot explain to a stranger in 20 seconds.",
    nextHint: "Next you will pick who to focus on and which questions this week must answer.",
  },
  map: {
    plainName: "Focus the week",
    inOneSentence:
      "Choose one type of person, one moment in their journey, and a few yes/no questions you must answer before you build.",
    whyItExists:
      "You cannot prototype everything. A good week answers a few risky questions — not every feature idea.",
    whatYouDo:
      "Check the target person, the moment, and the questions. Pull research if you want more sources. Approve when the focus feels right.",
    whatAiDoes:
      "Gathers evidence with links (reviews, competitors, articles) so claims are not invented.",
    dontSkip: "Every question should be answerable by watching real people use a fake product.",
    nextHint: "Next you will see several different solution ideas — not one AI default.",
  },
  sketch: {
    plainName: "Explore options",
    inOneSentence:
      "Look at several genuinely different ways to solve the problem, then mark the ones worth debating.",
    whyItExists:
      "AI tools often give you one pretty answer. Good teams force themselves to see real alternatives before choosing.",
    whatYouDo:
      "Silently look first. Then place dots on ideas you want to keep alive. You are not picking a winner yet.",
    whatAiDoes:
      "Creates a diverse set of ideas and hides near-copies so you are not voting on the same idea eight times.",
    dontSkip: "If everything looks the same, the diversity check failed — reset or demand more spread.",
    nextHint: "Next you alone pick the direction to fake and test.",
  },
  decide: {
    plainName: "Choose a direction",
    inOneSentence:
      "You (the Decider) pick one idea to turn into a realistic fake product for user interviews.",
    whyItExists:
      "Committees stall. One accountable person chooses. The choice is recorded forever so the team stops re-arguing.",
    whatYouDo:
      "Skim rankings. Select one. Cast the supervote. That locks the story for the prototype.",
    whatAiDoes:
      "May draft neutral critique notes. It is never allowed to cast the supervote.",
    dontSkip: "Write down what you rejected — that is part of the decision record.",
    nextHint: "Next we build a realistic-looking fake, not the real product.",
  },
  prototype: {
    plainName: "Fake the product",
    inOneSentence:
      "Build only the surfaces a customer would see — enough to interview people tomorrow.",
    whyItExists:
      "Shipping real software to learn is slow and expensive. A convincing façade answers the same questions in a day.",
    whatYouDo:
      "Review the interview script and the click-through story. Accept when it is real enough that a stranger would treat it as a product.",
    whatAiDoes:
      "Turns the storyboard into interview tasks and a simple façade preview.",
    dontSkip: "Do not add a real backend “because AI can.” Stay on the happy path.",
    nextHint: "Next you need five real people who match your target — not chatbots.",
  },
  test: {
    plainName: "Watch real people",
    inOneSentence:
      "Interview five people who match your target while they try the fake product.",
    whyItExists:
      "Opinions inside the team are cheap. Patterns across five strangers tell you whether to build, change, or stop.",
    whatYouDo:
      "Recruit five people. Run the interview script. Take notes. Then record Ship, Loop, or Kill with your evidence.",
    whatAiDoes:
      "Drafts a recruiting screener and helps organize notes. It must not invent interview quotes.",
    dontSkip: "Synthetic users are rehearsal only. Primary evidence is five real humans.",
    nextHint: "Your output is a Verdict Packet you can take to the team.",
  },
  verdict: {
    plainName: "Write the verdict",
    inOneSentence:
      "Lock Ship, Loop, or Kill — with the evidence and the next build steps.",
    whyItExists:
      "Without a written verdict, the week evaporates into Slack opinions. The packet is the product of Held.",
    whatYouDo:
      "Confirm the decision. Export the Verdict Packet. Share it with anyone who will build next.",
    whatAiDoes:
      "Scores how rigorous the sprint was (sources, diversity, human decision, Friday rules).",
    dontSkip: "If you shipped without five interviews, say so — and treat it as Loop, not proof.",
    nextHint: "Build only what the verdict says. Or start another sprint on the next risk.",
  },
};

export const WELCOME = {
  title: "Welcome to Held",
  subtitle:
    "You will answer one product question, then leave with a written Ship / Loop / Kill verdict.",
  bullets: [
    {
      title: "What you will do",
      body: "Walk through a short guided week: name the bet, focus, explore options, choose, fake a product, watch real people, then write a verdict.",
    },
    {
      title: "What AI will do",
      body: "Draft research, generate different solution ideas, and prepare interview scripts. You keep every important choice.",
    },
    {
      title: "What you will leave with",
      body: "A Verdict Packet: the bet, the evidence, Ship / Loop / Kill, and what to build next — not a mood board.",
    },
  ],
  roles:
    "You are the Decider for this demo — the person whose vote sticks. In a real company that is usually the founder or product lead.",
  cta: "Continue",
};

export const GLOSSARY: Record<string, string> = {
  Decider:
    "The one person whose final product call sticks. Avoids endless consensus.",
  "Verdict Packet":
    "The written outcome of the week: hypothesis, evidence, decision, next steps.",
  Supervote:
    "The Decider’s final pick among solution ideas. AI cannot cast it.",
  Façade:
    "A realistic-looking fake of the product — enough for interviews, not a real system.",
  "Sprint questions":
    "Yes/no questions you must answer this week by watching users, e.g. “Will they understand X?”",
};
