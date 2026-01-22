// Smart category suggestion based on keywords in ticket title/description

type Category = "Problem" | "Request" | null;

// Keywords that strongly suggest a Problem (something is broken)
const PROBLEM_KEYWORDS = [
  // Direct indicators
  "broken",
  "not working",
  "doesn't work",
  "won't work",
  "stopped working",
  "quit working",
  "error",
  "crashed",
  "crashing",
  "down",
  "failed",
  "failing",
  "bug",
  "outage",
  "slow",
  "stuck",
  "frozen",
  "freeze",
  "freezing",
  "malfunction",
  "dead",
  "glitch",
  "fault",
  "defective",
  "damaged",
  "issue with",
  "problem with",
  // Negative states
  "can't",
  "cannot",
  "won't",
  "unable to",
  "no longer",
  "stopped",
  // Tech-specific
  "blue screen",
  "black screen",
  "no power",
  "no signal",
  "offline",
  "disconnected",
  "unresponsive",
  "hanging",
  "loading forever",
  "keeps restarting",
  "rebooting",
  // Physical issues
  "leaking",
  "leak",
  "overheating",
  "smoke",
  "sparking",
  "noise",
  "loud",
  "beeping",
];

// Keywords that strongly suggest a Request (need something new or changed)
const REQUEST_KEYWORDS = [
  // Direct requests
  "need",
  "needs",
  "request",
  "requesting",
  "would like",
  "want",
  "looking for",
  "require",
  // New things
  "new",
  "install",
  "installation",
  "setup",
  "set up",
  "create",
  "add",
  "order",
  "purchase",
  "buy",
  // Access/permissions
  "access to",
  "permission",
  "permissions",
  "grant",
  "enable",
  "unlock",
  "credentials",
  "account",
  "login for",
  // Changes
  "change",
  "modify",
  "update my",
  "upgrade",
  "configure",
  "reconfigure",
  "move",
  "relocate",
  "transfer",
  // Scheduling
  "schedule",
  "book",
  "reserve",
  // Information
  "how do i",
  "how to",
  "can you",
  "please",
  "help with setting up",
];

// Phrases that are ambiguous and should not trigger suggestions
const AMBIGUOUS_PHRASES = [
  "update", // Could be "software update needed" (request) or "update broke something" (problem)
  "help",   // Generic
  "issue",  // Could be either
];

interface SuggestionResult {
  suggestedCategory: Category;
  confidence: "high" | "medium" | "low";
  matchedKeywords: string[];
}

/**
 * Analyzes text and suggests a category based on keyword matching
 */
export function suggestCategory(text: string): SuggestionResult {
  const lowerText = text.toLowerCase();

  const problemMatches: string[] = [];
  const requestMatches: string[] = [];

  // Check for problem keywords
  for (const keyword of PROBLEM_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      problemMatches.push(keyword);
    }
  }

  // Check for request keywords
  for (const keyword of REQUEST_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      requestMatches.push(keyword);
    }
  }

  // Calculate scores (weighted by number of matches)
  const problemScore = problemMatches.length;
  const requestScore = requestMatches.length;

  // No matches - no suggestion
  if (problemScore === 0 && requestScore === 0) {
    return {
      suggestedCategory: null,
      confidence: "low",
      matchedKeywords: [],
    };
  }

  // Determine winner and confidence
  const scoreDiff = Math.abs(problemScore - requestScore);
  const totalMatches = problemScore + requestScore;

  let suggestedCategory: Category;
  let confidence: "high" | "medium" | "low";
  let matchedKeywords: string[];

  if (problemScore > requestScore) {
    suggestedCategory = "Problem";
    matchedKeywords = problemMatches;
  } else if (requestScore > problemScore) {
    suggestedCategory = "Request";
    matchedKeywords = requestMatches;
  } else {
    // Tie - no clear suggestion
    return {
      suggestedCategory: null,
      confidence: "low",
      matchedKeywords: [...problemMatches, ...requestMatches],
    };
  }

  // Determine confidence level
  if (scoreDiff >= 2 || (scoreDiff === 1 && totalMatches >= 3)) {
    confidence = "high";
  } else if (scoreDiff === 1 || totalMatches >= 2) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    suggestedCategory,
    confidence,
    matchedKeywords,
  };
}

/**
 * Returns a user-friendly message explaining the suggestion
 */
export function getSuggestionMessage(result: SuggestionResult): string | null {
  if (!result.suggestedCategory || result.confidence === "low") {
    return null;
  }

  if (result.suggestedCategory === "Problem") {
    return "This sounds like something is broken or not working correctly.";
  } else {
    return "This sounds like a request for something new or a change.";
  }
}
